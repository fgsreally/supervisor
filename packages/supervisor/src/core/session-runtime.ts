import { readFileSync } from "node:fs";
import type {
  AgentHarness,
  AgentHarnessEvent,
  AgentMessage,
  AgentTool,
  SessionTreeEntry,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import { getModel, type ImageContent, type KnownProvider, type Model } from "@earendil-works/pi-ai";
import { expandPromptTemplate, type PromptTemplate } from "../agent/prompt-templates.js";
import type { Skill } from "../agent/skills.js";
import type { SourceInfo } from "../utils/source-info.js";
import type { Session } from "../types.js";
import { ExtensionRuntime, createExtensionDatabase } from "../extension-system/index.js";
import type { ToolInfo } from "../extension-system/types.js";
import { toolInfoToAgentTool, wrapToolWithExtensionRuntime } from "../extension-system/tool-adapter.js";
import { buildExtensionDeps } from "../extension-system/extension-deps.js";
import { discoverAndLoadExtensions } from "../extension-system/loader.js";
import {
  mapHarnessEventToExtensionEvents,
  mergeSessionToolInfos,
} from "../extension-system/extension-event-bridge.js";
import { getAgentHomeDir } from "../agent/agent-paths.js";
import type { SupervisorDb } from "../db/db.js";
import type { SessionManager } from "./session-manager.js";
import type { SQLiteSessionStorage } from "./session-storage.js";
import {
  ensureProjectDir,
  ensureSessionDir,
  getProjectDir,
  getSessionDir,
} from "./session-files.js";

interface HarnessSessionTree {
  buildContext(): Promise<{ messages: AgentMessage[] }>;
  appendCompaction(
    summary: string,
    firstKeptEntryId: string,
    tokensBefore: number,
    details?: unknown,
    fromHook?: boolean,
  ): Promise<string>;
}

function harnessSession(harness: unknown): HarnessSessionTree {
  return (harness as { session: HarnessSessionTree }).session;
}

export type SlashCommandSource = "prompt" | "skill";

export interface SlashCommandInfo {
  name: string;
  description?: string;
  source: SlashCommandSource;
  sourceInfo: SourceInfo;
}

export interface SupervisorSessionState {
  id: number;
  sessionId: string | null;
  cwd: string;
  status: Session["status"];
  model: {
    provider: string;
    modelId: string;
  };
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  messageCount: number;
  leafId: string | null;
}

export interface SupervisorSessionRuntimeOptions {
  session: Session;
  harness: AgentHarness;
  storage?: SQLiteSessionStorage;
  skills?: Skill[];
  promptTemplates?: PromptTemplate[];
  getSession: () => Session | undefined;
  getMessages: () => Promise<SessionTreeEntry[]>;
}

export type SupervisorSessionEvent = AgentHarnessEvent;
export type SupervisorSessionEventListener = (
  event: SupervisorSessionEvent,
) => void | Promise<void>;

export class SupervisorSessionRuntime {
  readonly id: number;
  readonly harness: AgentHarness;

  private getSession: () => Session | undefined;
  private getMessagesForSession: () => Promise<SessionTreeEntry[]>;
  private listeners = new Set<SupervisorSessionEventListener>();
  private skills: Skill[];
  private promptTemplates: PromptTemplate[];
  private storage?: SQLiteSessionStorage;
  private _extensionRuntime: ExtensionRuntime | null = null;
  private emittedAgentMessageCount = 0;

  constructor(options: SupervisorSessionRuntimeOptions) {
    this.id = options.session.id;
    this.harness = options.harness;
    this.storage = options.storage;
    this.skills = options.skills ?? [];
    this.promptTemplates = options.promptTemplates ?? [];
    this.getSession = options.getSession;
    this.getMessagesForSession = options.getMessages;

    this.harness.subscribe((event) => {
      void this.emit(event);
      void this.forwardHarnessEventToExtensions(event);
    });
  }

  private async emit(event: SupervisorSessionEvent): Promise<void> {
    for (const listener of this.listeners) {
      await listener(event);
    }
  }

  subscribe(listener: SupervisorSessionEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ==================== Extension Runtime ====================

  get extensionRuntime(): ExtensionRuntime | null {
    return this._extensionRuntime;
  }

  /**
   * Initialize the extension runtime: load and setup all extensions.
   */
  async initExtensions(
    agentId: number,
    agentName: string,
    providerId: number,
    modelId: string,
    cwd: string,
    db: SupervisorDb,
    manager: SessionManager,
    systemPrompt?: string,
  ): Promise<void> {
    const session = this.getSession();
    if (session?.projectId == null) throw new Error(`Session ${this.id} has no project`);
    await ensureProjectDir(session.projectId);
    await ensureSessionDir(session.projectId, this.id);
    const extDb = createExtensionDatabase({
      sessionId: this.id,
      query: async (sql, params) => {
        const stmt = db.db.prepare(sql);
        return stmt.all(...params) as any[];
      },
      queryOne: async (sql, params) => {
        const stmt = db.db.prepare(sql);
        return stmt.get(...params) as any;
      },
      sqlite: db.db,
    });

    const extensionRuntimeRef: { current: ExtensionRuntime | null } = { current: null };
    const deps = buildExtensionDeps({
      runtime: this,
      manager,
      db,
      sessionId: this.id,
      projectId: session.projectId,
      listSessionTools: () =>
        mergeSessionToolInfos(
          this.harness.agent.state.tools ?? [],
          extensionRuntimeRef.current?.getAllTools() ?? [],
        ),
      emitExtensionEvent: (event) => extensionRuntimeRef.current?.emit(event as any),
    });
    const options = {
      sessionId: this.id,
      parentSessionId: session.parentId,
      cwd,
      sessionDir: getSessionDir(session.projectId, this.id),
      projectDir: getProjectDir(session.projectId),
      agent: {
        id: agentId,
        name: agentName,
        providerId,
        modelId,
        systemPrompt,
      },
      db: extDb,
      deps,
    };

    const runtime = new ExtensionRuntime(options);
    this._extensionRuntime = runtime;
    extensionRuntimeRef.current = runtime;

    const currentSession = this.getSession();
    await runtime.emit({
      type: "session.prepare",
      sessionId: this.id,
      parentSessionId: currentSession?.parentId ? String(currentSession.parentId) : undefined,
      cwd,
      toolsPreset: "coding",
      agentDisplayName: agentName,
    } as any);

    // Discover and load extensions from agent home + project
    const agentHomeDir = getAgentHomeDir(String(agentId));
    const result = await discoverAndLoadExtensions({ agentHomeDir, cwd });
    for (const ext of result.extensions) {
      await runtime.loadExtension(ext.definition, ext.path);
    }

    // Connect harness hooks to extension events
    this.harness.on("tool_call", async (event) => {
      await runtime.emit({
        type: "tool.before_call" as any,
        toolCallId: event.toolCallId,
        name: event.toolName,
        args: event.input,
        entryId: "",
      });
      return undefined;
    });

    await runtime.emit({
      type: "session.start",
      reason: "startup",
      sessionId: this.id,
    } as any);
  }

  /**
   * Collect all tools registered by extensions as AgentTool[].
   */
  collectExtensionTools(): AgentTool[] {
    const runtime = this._extensionRuntime;
    if (!runtime) return [];

    const tools: AgentTool[] = [];
    const infos = runtime.getAllTools() as ToolInfo[];
    for (const info of infos) {
      tools.push(toolInfoToAgentTool(info, runtime));
    }
    return tools;
  }

  /**
   * Forward harness events to the extension runtime.
   * Maps AgentHarnessEvent types to ExtensionEvent types.
   */
  private async forwardHarnessEventToExtensions(event: SupervisorSessionEvent): Promise<void> {
    const ext = this._extensionRuntime;
    if (!ext) return;

    try {
      switch (event.type) {
        case "agent_start":
          await ext.emit({
            type: "agent.start",
            messageId: "",
            entryId: "",
            timestamp: Date.now(),
          } as any);
          break;

        case "agent_end": {
          await ext.emit({
            type: "agent.end",
            messageId: "",
            entryId: "",
            stopReason: (event as any).stopReason ?? "end_turn",
            timestamp: Date.now(),
            messages: (event as any).messages,
          } as any);

          const mapped = mapHarnessEventToExtensionEvents(event, this.id, {
            previousMessageCount: this.emittedAgentMessageCount,
          });
          const messages = (event as any).messages ?? [];
          this.emittedAgentMessageCount = Array.isArray(messages) ? messages.length : 0;
          for (const mappedEvent of mapped) {
            await ext.emit(mappedEvent as any);
          }
          break;
        }

        case "abort":
          await ext.emit({
            type: "agent.abort",
            reason: (event as any).reason ?? "user",
            timestamp: Date.now(),
          } as any);
          break;

        default: {
          for (const mappedEvent of mapHarnessEventToExtensionEvents(event, this.id)) {
            await ext.emit(mappedEvent as any);
          }
          break;
        }
      }
    } catch {
      // Safe to ignore — extension runtime may not be fully initialized
    }
  }

  /**
   * Check if the current harness event carries an error condition
   * and forward it to extensions if so.
   */
  forwardErrorToExtensions(errorMessage: string, messageId?: string): void {
    const ext = this._extensionRuntime;
    if (!ext) return;
    void ext
      .emit({
        type: "agent.error",
        error: errorMessage,
        messageId,
        timestamp: Date.now(),
      } as any)
      .catch(() => {});
  }

  /**
   * Forward tool execution events to extensions.
   */
  forwardToolExecutionToExtensions(_event: {
    phase: "start" | "update" | "end";
    toolCallId: string;
    toolName: string;
    args?: unknown;
    result?: unknown;
    isError?: boolean;
  }): void {
    const ext = this._extensionRuntime;
    if (!ext) return;
    // Currently forwarded via harness tool_call/tool_result hooks in initExtensions
  }

  /**
   * Shutdown extension runtime: emit session.end and unload all.
   */
  async shutdownExtensions(): Promise<void> {
    const runtime = this._extensionRuntime;
    if (!runtime) return;

    await runtime.emit({
      type: "session.end",
      reason: "shutdown",
      sessionId: this.id,
    } as any);

    await runtime.unloadAll();
    this._extensionRuntime = null;
  }

  // ==================== Original Methods ====================

  /**
   * Expand /skill:name commands to full skill content (XML format, matching coding-agent).
   */
  private expandSkillCommand(text: string): string {
    if (!text.startsWith("/skill:")) return text;

    const spaceIndex = text.indexOf(" ");
    const skillName = spaceIndex === -1 ? text.slice(7) : text.slice(7, spaceIndex);
    const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);

    const skill = this.skills.find((s) => s.name === skillName);
    if (!skill) return text;

    try {
      const rawContent = readFileSync(skill.filePath, "utf-8");
      // Strip frontmatter
      let body = rawContent;
      if (rawContent.startsWith("---")) {
        const end = rawContent.indexOf("\n---", 3);
        if (end !== -1) {
          body = rawContent.slice(end + 4).trim();
        }
      }
      const skillBlock = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
      return args ? `${skillBlock}\n\n${args}` : skillBlock;
    } catch {
      return text;
    }
  }

  async prompt(message: string, images?: ImageContent[], source?: string | null): Promise<void> {
    let expanded = this.expandSkillCommand(message);
    expanded = expandPromptTemplate(expanded, this.promptTemplates);
    const ext = this._extensionRuntime;
    if (ext) {
      await ext.emit({
        type: "message.user",
        text: expanded,
        messageId: "",
        entryId: "",
        timestamp: Date.now(),
      } as any);
    }
    const cancelQueuedSource =
      source === undefined ? undefined : this.storage?.queueUserMessageSource(source);
    try {
      await this.harness.prompt(expanded, images?.length ? { images } : undefined);
    } finally {
      cancelQueuedSource?.();
    }
  }

  steer(message: string): void {
    this.harness.steer(message);
  }

  followUp(message: string, source?: string | null): void {
    if (source !== undefined) this.storage?.queueUserMessageSource(source);
    this.harness.followUp(message);
  }

  async abort(): Promise<void> {
    await this.harness.abort();
  }

  async compact(customInstructions?: string): Promise<{
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    details?: unknown;
  }> {
    return this.harness.compact(customInstructions);
  }

  /** Reload in-memory agent messages from the persisted session tree. */
  async reloadMessagesFromSessionTree(): Promise<void> {
    const session = harnessSession(this.harness);
    const context = await session.buildContext();
    this.harness.agent.state.messages = context.messages;
  }

  /** Persist a compaction entry and sync agent state. */
  async appendCompactionResult(
    summary: string,
    firstKeptEntryId: string,
    tokensBefore: number,
    details?: unknown,
  ): Promise<void> {
    const session = harnessSession(this.harness);
    await session.appendCompaction(summary, firstKeptEntryId, tokensBefore, details, false);
    await this.reloadMessagesFromSessionTree();
  }

  async setModel(provider: string, modelId: string): Promise<Model<any>> {
    const model = getModel(provider as KnownProvider, modelId as never);
    if (!model) {
      throw new Error(`Model ${modelId} from provider ${provider} not found`);
    }
    await this.harness.setModel(model);
    return model;
  }

  async setThinkingLevel(level: ThinkingLevel): Promise<void> {
    await this.harness.setThinkingLevel(level);
  }

  async setActiveTools(toolNames: string[]): Promise<void> {
    await this.harness.setActiveTools(toolNames);
  }

  async setTools(tools: AgentTool[], activeToolNames?: string[]): Promise<void> {
    const runtime = this._extensionRuntime;
    const effectiveTools = runtime
      ? tools.map((tool) => wrapToolWithExtensionRuntime(tool, runtime))
      : tools;
    await this.harness.setTools(effectiveTools, activeToolNames);
  }

  async getMessages(): Promise<SessionTreeEntry[]> {
    return this.getMessagesForSession();
  }

  async getState(): Promise<SupervisorSessionState> {
    const session = this.getSession();
    if (!session) throw new Error(`Session ${this.id} not found`);
    const messages = await this.getMessagesForSession();
    const model = this.harness.agent.state.model;
    return {
      id: session.id,
      sessionId: session.sessionId,
      cwd: session.cwd,
      status: session.status,
      model: {
        provider: model.provider,
        modelId: model.id,
      },
      thinkingLevel: this.harness.agent.state.thinkingLevel,
      isStreaming: session.status === "running",
      messageCount: messages.filter((entry) => entry.type === "message").length,
      leafId: session.leafId,
    };
  }

  /**
   * Return available dynamic slash commands: skills + prompt templates.
   * Mirrors coding-agent's AgentSession.getSlashCommands().
   */
  getSlashCommands(): SlashCommandInfo[] {
    const skillCommands: SlashCommandInfo[] = this.skills.map((s) => ({
      name: `skill:${s.name}`,
      description: s.description,
      source: "skill" as const,
      sourceInfo: s.sourceInfo,
    }));
    const templateCommands: SlashCommandInfo[] = this.promptTemplates.map((t) => ({
      name: t.name,
      description: t.description,
      source: "prompt" as const,
      sourceInfo: t.sourceInfo,
    }));
    return [...skillCommands, ...templateCommands];
  }

  getLastAssistantText(): string | undefined {
    for (let i = this.harness.agent.state.messages.length - 1; i >= 0; i--) {
      const message = this.harness.agent.state.messages[i] as AgentMessage | undefined;
      if (!message || message.role !== "assistant") continue;
      const content = message.content;
      if (typeof content === "string") return content;
      return content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("");
    }
    return undefined;
  }
}
