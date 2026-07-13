import type {
  AgentHarness,
  AgentHarnessEvent,
  AgentMessage,
  AgentTool,
  SessionTreeEntry,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import { getModel, type ImageContent, type KnownProvider, type Model } from "@earendil-works/pi-ai";
import type { Session } from "../types.js";
import type {
  AgentResource,
  AgentResourceCommandInfo,
  AgentResourceCommandSource,
} from "../resources/agent-resource.js";
import { Extension, createExtensionDatabase } from "../extension-system/index.js";
import { buildExtensionDeps } from "../extension-system/extension-deps.js";
import { getAgentHomeDir } from "../agent/agent-paths.js";
import { activatePackagedTools, listEnabledPackagedToolIds } from "../tools/loader.js";
import { isPackagedToolId } from "../tools/catalog.js";
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

export type SlashCommandSource = AgentResourceCommandSource;

export type SlashCommandInfo = AgentResourceCommandInfo;

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
  resource: AgentResource;
  storage?: SQLiteSessionStorage;
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
  /** 与当前运行中 Agent 唯一绑定的非扩展资源管理器。 */
  readonly resource: AgentResource;

  private getSession: () => Session | undefined;
  private getMessagesForSession: () => Promise<SessionTreeEntry[]>;
  private listeners = new Set<SupervisorSessionEventListener>();
  private storage?: SQLiteSessionStorage;
  /** 与当前运行中 Agent 会话唯一绑定的 Extension 实例。 */
  private _extension: Extension | null = null;

  constructor(options: SupervisorSessionRuntimeOptions) {
    this.id = options.session.id;
    this.harness = options.harness;
    this.resource = options.resource;
    this.storage = options.storage;
    this.getSession = options.getSession;
    this.getMessagesForSession = options.getMessages;

    this.harness.subscribe((event) => {
      void this.emit(event);
      void this._extension?.handleHarnessEvent(event);
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

  get extension(): Extension | null {
    return this._extension;
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

    const extensionRef: { current: Extension | null } = { current: null };
    const deps = buildExtensionDeps({
      runtime: this,
      manager,
      db,
      sessionId: this.id,
      projectId: session.projectId,
      listSessionTools: () =>
        Extension.mergeToolInfos(
          this.harness.agent.state.tools ?? [],
          extensionRef.current?.getAllTools() ?? [],
        ),
      emitExtensionEvent: (event) => extensionRef.current?.emit(event as any),
    });
    const sessionMeta =
      typeof session.meta === "string"
        ? (JSON.parse(session.meta) as Record<string, unknown>)
        : ((session.meta as Record<string, unknown> | undefined) ?? {});
    const options = {
      sessionId: this.id,
      parentSessionId: session.parentId,
      sessionMeta,
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

    const extension = new Extension(options);
    this._extension = extension;
    extensionRef.current = extension;

    const currentSession = this.getSession();
    await extension.emit({
      type: "session.prepare",
      sessionId: this.id,
      parentSessionId: currentSession?.parentId ? String(currentSession.parentId) : undefined,
      cwd,
      toolsPreset: "coding",
      agentDisplayName: agentName,
    } as any);

    // Activate bound extensions (modules imported once at process level).
    await manager.ensureResourceCatalog();
    const extensionSlugs = db.listAgentResourceSlugs(agentId, "extension");
    const moduleErrors = await extension.loadModules(
      manager.getExtensionRegistry().getMany(extensionSlugs),
    );
    for (const moduleError of moduleErrors) {
      console.error(`extension module [${moduleError.slug}]:`, moduleError.error);
    }

    const toolSlugs = db.listAgentResourceSlugs(agentId, "tool");
    const legacyToolIds = listEnabledPackagedToolIds(getAgentHomeDir(String(agentId)));
    const packagedToolIds = [...new Set([...toolSlugs.filter(isPackagedToolId), ...legacyToolIds])];
    await activatePackagedTools(extension, {
      cwd,
      sessionId: this.id,
      toolIds: packagedToolIds,
    });

    extension.bindHarness(this.harness);

    await extension.emit({
      type: "session.start",
      reason: "startup",
      sessionId: this.id,
    } as any);
  }

  /**
   * Collect all tools registered by extensions as AgentTool[].
   */
  collectExtensionTools(): AgentTool[] {
    return this._extension?.collectTools() ?? [];
  }

  /**
   * Check if the current harness event carries an error condition
   * and forward it to extensions if so.
   */
  forwardErrorToExtensions(errorMessage: string, messageId?: string): void {
    this._extension?.forwardError(errorMessage, messageId);
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
    const ext = this._extension;
    if (!ext) return;
    // Currently forwarded via harness tool_call/tool_result hooks in initExtensions
  }

  /** 清理与当前 Agent 绑定的 Extension 和其他 Resource。 */
  async clear(): Promise<void> {
    const extension = this._extension;
    if (extension) {
      await extension.clear();
      this._extension = null;
    }
    await this.resource.clear();
  }

  async prompt(message: string, images?: ImageContent[], source?: string | null): Promise<void> {
    const expanded = this.resource.expandPrompt(message);
    const ext = this._extension;
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

  async waitForIdle(): Promise<void> {
    await this.harness.waitForIdle();
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
    const effectiveTools = this._extension?.wrapTools(tools) ?? tools;
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
    return this.resource.getSlashCommands();
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
