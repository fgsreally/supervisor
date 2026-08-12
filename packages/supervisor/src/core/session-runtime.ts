import type {
  AgentHarness,
  AgentHarnessEvent,
  AgentMessage,
  AgentTool,
  SessionTreeEntry,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { Session } from "../types.js";
import type {
  AgentResource,
  AgentResourceCommandInfo,
  AgentResourceCommandSource,
} from "../agent/runtime-resources.js";
import { SessionExtensionHost } from "../extension/runtime/index.js";
import { activatePackagedTools } from "../tools/loader.js";
import { isPackagedToolId } from "../tools/catalog.js";
import type { SupervisorDb } from "../db/db.js";
import { getDb } from "../db/db.js";
import { resolveLLMConfig } from "../utils/model-utils.js";
import type { SessionManager } from "./session-manager.js";
import { resolveSessionPromptImages, type SessionPromptImage } from "./session-media.js";
import type { SQLiteSessionStorage } from "./session-storage.js";
import { Context } from "../extension/runtime/index.js";
import { ensureProjectDir, ensureSessionDir } from "./session-files.js";
import type { ManagedSessionRuntime } from "./managed-session-runtime.js";
import { BUILTIN_EXTENSION_SLUGS } from "../extension/builtin/catalog.js";
import { listEnabledBuiltinExtensionSlugs } from "../extension/builtin/ensure.js";
import { evaluateAgentPermission, type AgentPermissionRules } from "./agent-permissions.js";
import type { ApprovalRequest, ApprovalResult, ExtensionEvent } from "../extension/index.js";
import { harnessAgentState, readHarnessTools } from "./harness-compat.js";

export {
  harnessAgentController,
  harnessAgentState,
  type HarnessAgentController,
  type HarnessAgentState,
} from "./harness-compat.js";

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

export type SlashCommandSource = AgentResourceCommandSource | "extension" | string;

export type SlashCommandInfo = Omit<AgentResourceCommandInfo, "source" | "sourceInfo"> & {
  source?: SlashCommandSource;
  sourceInfo?: AgentResourceCommandInfo["sourceInfo"];
  icon?: string;
  arguments?: { type: "none" } | { type: "text"; required?: boolean; placeholder?: string };
};

export interface SessionState {
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
  /** Partial assistant text while a turn is streaming; used to resume UI after refresh. */
  streamingReply?: string;
}

export interface SessionRuntimeOptions {
  session: Session;
  harness: AgentHarness;
  resource: AgentResource;
  storage?: SQLiteSessionStorage;
  getSession: () => Session | undefined;
  getMessages: () => Promise<SessionTreeEntry[]>;
}

export type SessionEvent = AgentHarnessEvent;
export type SessionEventListener = (event: SessionEvent) => void | Promise<void>;

export class SessionRuntime implements ManagedSessionRuntime {
  readonly id: number;
  readonly harness: AgentHarness;
  /** 与当前运行中 Agent 唯一绑定的非扩展资源管理器。 */
  readonly resource: AgentResource;

  private getSession: () => Session | undefined;
  private getMessagesForSession: () => Promise<SessionTreeEntry[]>;
  private listeners = new Set<SessionEventListener>();
  private storage?: SQLiteSessionStorage;
  /** 与当前运行中 Agent 会话唯一绑定的 Extension 实例。 */
  private _extension: SessionExtensionHost | null = null;
  private permissionConfig: {
    rules: AgentPermissionRules;
    cwd: string;
    projectRoots: string[];
    requestApproval: (request: ApprovalRequest) => Promise<ApprovalResult>;
    approvedCalls: Set<string>;
    sessionAllowed: Set<string>;
  } | null = null;

  constructor(options: SessionRuntimeOptions) {
    this.id = options.session.id;
    this.harness = options.harness;
    this.resource = options.resource;
    this.storage = options.storage;
    this.getSession = options.getSession;
    this.getMessagesForSession = options.getMessages;

    this.storage?.onEntryAppended((entry) => this._extension?.handleStoredEntry(entry));

    this.harness.subscribe((event) => {
      void this.emit(event);
      void this._extension?.handleHarnessEvent(event);
    });
  }

  private async emit(event: SessionEvent): Promise<void> {
    for (const listener of this.listeners) {
      await listener(event);
    }
  }

  subscribe(listener: SessionEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ==================== Extension Runtime ====================

  get extension(): SessionExtensionHost | null {
    return this._extension;
  }

  /**
   * Initialize the extension runtime: load and setup all extensions.
   */
  async initExtensions(
    agentId: number,
    agentName: string,
    cwd: string,
    db: SupervisorDb,
    manager: SessionManager,
  ): Promise<void> {
    const session = this.getSession();
    // The built-in Pi assistant is deliberately global and has no project-scoped
    // artifact directory. Its regular Agent tools and resources still work, while
    // project/session extensions are skipped because their Context requires a project.
    if (session?.projectId == null) return;
    await ensureProjectDir(session.projectId);
    const sessionDir = await ensureSessionDir(session.projectId, this.id);
    const context = new Context({ sessionManager: manager, db, sessionRuntime: this });
    const extension = new SessionExtensionHost(context);
    this._extension = extension;

    await manager.ensureResourceCatalog();
    const currentSession = this.getSession();
    const isMainSession = currentSession?.parentId == null;
    const enabledBuiltins = listEnabledBuiltinExtensionSlugs(db, agentId, { isMainSession });
    await extension.initialize(enabledBuiltins);

    const agent = db.getAgent(agentId);
    const toolsPreset = agent?.toolsPreset ?? "coding";
    const spawnType = currentSession?.spawnType ?? null;
    const createEvent = {
      type: "session.create",
      sessionId: this.id,
      parentSessionId: currentSession?.parentId ? String(currentSession.parentId) : undefined,
      cwd,
      toolsPreset,
      spawnType,
      agentDisplayName: agentName,
    } as ExtensionEvent;

    await extension.emit(createEvent);
    await extension.emit({ ...createEvent, type: "session.prepare" } as ExtensionEvent);

    this.syncWorkingDirectory(this.getSession()?.cwd ?? cwd);

    // User-installed extensions only (builtins load via initialize). Bound = active.
    const extensionSlugs = db
      .listAgentResourceBindings(agentId, { kind: "extension", enabledOnly: false })
      .flatMap((binding) => {
        const slug = binding.resource?.slug;
        if (!slug || BUILTIN_EXTENSION_SLUGS.has(slug)) return [];
        return [slug];
      });
    const moduleErrors = await extension.loadModules(
      manager.getExtensionRegistry().getMany(extensionSlugs),
    );
    for (const moduleError of moduleErrors) {
      console.error(`extension module [${moduleError.slug}]:`, moduleError.error);
    }

    const toolSlugs = db.listAgentResourceSlugs(agentId, "tool");
    const packagedToolIds = toolSlugs.filter(isPackagedToolId);
    await activatePackagedTools(extension, {
      cwd,
      sessionId: this.id,
      sessionDir,
      toolIds: packagedToolIds,
    });

    extension.bindHarness(this.harness);

    await extension.emit({
      type: "session.start",
      reason: "startup",
      sessionId: this.id,
    } as ExtensionEvent);
  }

  /** Keep harness permission cwd in sync after extensions change session cwd (e.g. worktree). */
  syncWorkingDirectory(cwd: string): void {
    if (this.permissionConfig) this.permissionConfig.cwd = cwd;
    const harnessEnv = (this.harness as { env?: { cwd?: string } }).env;
    if (harnessEnv && typeof harnessEnv.cwd === "string") {
      harnessEnv.cwd = cwd;
    }
  }

  /** Tear down and reload extension modules for the current Agent binding set. */
  async reloadExtensions(
    agentId: number,
    agentName: string,
    cwd: string,
    db: SupervisorDb,
    manager: SessionManager,
  ): Promise<void> {
    if (this._extension) {
      await this._extension.clear();
      this._extension = null;
    }
    await this.initExtensions(agentId, agentName, cwd, db, manager);
  }

  /**
   * Collect all tools registered by extensions as AgentTool[].
   */
  collectExtensionTools(): AgentTool[] {
    return this._extension?.collectTools() ?? [];
  }

  configureAgentPermissions(
    rules: AgentPermissionRules,
    cwd: string,
    requestApproval: (request: ApprovalRequest) => Promise<ApprovalResult>,
    options?: { projectRoots?: string[] },
  ): void {
    this.permissionConfig = {
      rules,
      cwd,
      projectRoots: options?.projectRoots ?? [],
      requestApproval,
      approvedCalls: new Set(),
      sessionAllowed: new Set(),
    };
  }

  async deactivateExtension(extensionId: string): Promise<boolean> {
    return (await this._extension?.unload(extensionId)) ?? false;
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

  async prompt(
    message: string,
    images?: SessionPromptImage[],
    source?: string | null,
    origin?: string,
  ): Promise<void> {
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
    const slashName = message.startsWith("/") ? message.slice(1).split(/\s/, 1)[0] : undefined;
    const slashSource = slashName
      ? this.getSlashCommands().find((command) => command.name === slashName)?.source
      : undefined;
    const effectiveSource =
      source ?? (expanded !== message && slashSource ? `slash:${slashSource}` : undefined);
    const cancelQueuedSource =
      effectiveSource === undefined
        ? undefined
        : this.storage?.queueUserMessageSource(effectiveSource);
    const effectiveOrigin = origin ?? (expanded !== message ? message : undefined);
    const cancelQueuedOrigin = effectiveOrigin
      ? this.storage?.queueUserMessageOrigin(effectiveOrigin)
      : undefined;
    try {
      const imageContent = images?.length
        ? await resolveSessionPromptImages(this.id, images)
        : undefined;
      await this.harness.prompt(
        expanded,
        imageContent?.length ? { images: imageContent } : undefined,
      );
    } finally {
      cancelQueuedSource?.();
      cancelQueuedOrigin?.();
    }
  }

  async steer(message: string, images?: SessionPromptImage[]): Promise<void> {
    if (images?.length) {
      await this.harness.abort();
      const imageContent = await resolveSessionPromptImages(this.id, images);
      await this.harness.prompt(message, { images: imageContent });
      return;
    }
    this.harness.steer(message);
  }

  followUp(message: string, source?: string | null, images?: SessionPromptImage[]): void {
    if (source !== undefined) this.storage?.queueUserMessageSource(source);
    if (images?.length) {
      void this.harness.waitForIdle().then(async () => {
        const imageContent = await resolveSessionPromptImages(this.id, images);
        await this.harness.prompt(message, { images: imageContent });
      });
      return;
    }
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
    harnessAgentState(this.harness).messages = context.messages;
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
    const db = getDb();
    const providerRow = db
      .listProviders()
      .find((item) => item.slug === provider || String(item.id) === provider);
    const configuredModel = providerRow ? db.getModel(providerRow.id, modelId) : undefined;
    if (!configuredModel) throw new Error(`Model ${modelId} from provider ${provider} not found`);
    const { model } = resolveLLMConfig(configuredModel.id);
    await this.harness.setModel(model);
    return model;
  }

  async setThinkingLevel(level: ThinkingLevel): Promise<void> {
    await this.harness.setThinkingLevel(level);
  }

  async setActiveTools(toolNames: string[]): Promise<void> {
    const known = new Set(readHarnessTools(this.harness).map((tool) => tool.name));
    if (known.size === 0) return;
    const filtered = toolNames.filter((name) => known.has(name));
    if (filtered.length === 0 && toolNames.length > 0) return;
    await this.harness.setActiveTools(filtered);
  }

  /**
   * Replace the tool registry on the harness.
   * Only tools with active:true (per-tool flag) are model-visible.
   */
  async setTools(tools: AgentTool[], activeToolNames?: string[]): Promise<void> {
    const extensionTools = this._extension?.wrapTools(tools) ?? tools;
    const effectiveTools = this.permissionConfig
      ? extensionTools.map((tool) => this.wrapPermissionTool(tool))
      : extensionTools;
    const toolServices = this._extension?.services.tools;
    for (const tool of effectiveTools) {
      toolServices?.ensureRegistered(tool.name, true);
    }
    const knownNames = effectiveTools.map((tool) => tool.name);
    const nextActive =
      activeToolNames?.filter((name) => knownNames.includes(name)) ??
      toolServices?.filterActiveNames(knownNames) ??
      knownNames;
    await this.harness.setTools(effectiveTools, nextActive);
  }

  /** Sync harness activeToolNames from per-tool active flags. */
  async syncActiveTools(): Promise<void> {
    const known = readHarnessTools(this.harness).map((tool) => tool.name);
    if (known.length === 0) return;
    const active =
      this._extension?.services.tools.filterActiveNames(known) ??
      this._extension?.listActiveToolNames(known) ??
      known;
    await this.harness.setActiveTools(active);
  }

  private wrapPermissionTool(tool: AgentTool): AgentTool {
    const execute = tool.execute.bind(tool);
    return {
      ...tool,
      execute: async (toolCallId, params, signal, onUpdate) => {
        const config = this.permissionConfig;
        if (!config || config.approvedCalls.has(toolCallId)) {
          return execute(toolCallId, params, signal, onUpdate);
        }
        const decision = evaluateAgentPermission(
          config.rules,
          tool.name,
          params,
          config.cwd,
          config.projectRoots,
        );
        if (decision.effect === "deny") {
          return {
            content: [
              {
                type: "text",
                text: `Agent permission denied ${decision.tool}: ${decision.target || "(no parameter)"}`,
              },
            ],
            details: {},
            isError: true,
          };
        }
        if (decision.effect === "ask") {
          const key = JSON.stringify([decision.tool, decision.target]);
          if (!config.sessionAllowed.has(key)) {
            const result = await config.requestApproval({
              kind: "tool_permission",
              title: `允许调用 ${decision.tool}？`,
              body: `${decision.target || "(无可匹配参数)"}${
                decision.matchedTarget && decision.matchedTarget !== decision.target
                  ? `\n命中命令段：${decision.matchedTarget}`
                  : ""
              }\n匹配规则：${decision.pattern}`,
              actions: ["approve", "approve_session", "reject"],
            });
            if (result.action !== "approve" && result.action !== "approve_session") {
              return {
                content: [
                  {
                    type: "text",
                    text: `User rejected ${decision.tool}: ${decision.target}`,
                  },
                ],
                details: {},
                isError: true,
              };
            }
            if (result.action === "approve_session") config.sessionAllowed.add(key);
          }
        }
        config.approvedCalls.add(toolCallId);
        return execute(toolCallId, params, signal, onUpdate);
      },
    };
  }

  async getMessages(): Promise<SessionTreeEntry[]> {
    return this.getMessagesForSession();
  }

  async getState(): Promise<SessionState> {
    const session = this.getSession();
    if (!session) throw new Error(`Session ${this.id} not found`);
    const messages = await this.getMessagesForSession();
    const model = this.harness.getModel();
    const streamingReply = assistantMessagePlainText(
      harnessAgentState(this.harness).streamingMessage,
    );
    return {
      id: session.id,
      sessionId: session.externalSessionId,
      cwd: session.cwd,
      status: session.status,
      model: {
        provider: model.provider,
        modelId: model.id,
      },
      thinkingLevel: this.harness.getThinkingLevel(),
      isStreaming: session.status === "running",
      messageCount: messages.filter((entry) => entry.type === "message").length,
      leafId: session.leafId,
      ...(streamingReply?.trim() ? { streamingReply } : {}),
    };
  }

  /**
   * Return available dynamic slash commands: skills + prompt templates.
   * Mirrors coding-agent's AgentSession.getSlashCommands().
   */
  getSlashCommands(): SlashCommandInfo[] {
    const commands = new Map<string, SlashCommandInfo>();
    for (const command of this.resource.getSlashCommands()) {
      commands.set(command.name, {
        name: command.name,
        description: command.description,
        source: command.source,
        arguments:
          command.source === "prompt"
            ? {
                type: "text",
                required: false,
                placeholder: command.argumentHint ?? "Template arguments",
              }
            : { type: "text", required: false },
      });
    }
    for (const command of this._extension?.getAllCommands() ?? []) {
      commands.set(command.name, {
        name: command.name,
        description: command.description,
        source: command.definition.source ?? "custom",
        icon: command.definition.icon,
        arguments: command.definition.arguments ?? { type: "text", required: false },
      });
    }
    return [...commands.values()];
  }

  reloadResources(): void {
    this.resource.reload();
  }

  async executeSlashCommand(name: string, args: string): Promise<void> {
    if (!this._extension) throw new Error("Extension runtime is unavailable");
    const raw = `/${name}${args ? ` ${args}` : ""}`;
    const commandSource = this.getSlashCommands().find(
      (command) => command.name === name.replace(/^\//, ""),
    )?.source;
    const result = await this._extension.executeCommand(name, args);
    if (result.type === "prompt") {
      await this.prompt(result.prompt, undefined, `slash:${commandSource ?? "custom"}`, raw);
      return;
    }
    if (result.type === "error") throw new Error(result.message);
  }

  getLastAssistantText(): string | undefined {
    const messages = harnessAgentState(this.harness).messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message || message.role !== "assistant") continue;
      return assistantMessagePlainText(message);
    }
    return undefined;
  }
}

function assistantMessagePlainText(message?: AgentMessage): string | undefined {
  if (!message || !("content" in message)) return undefined;
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
  return text || undefined;
}
