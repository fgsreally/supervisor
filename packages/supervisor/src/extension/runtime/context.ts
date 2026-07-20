import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { TSchema } from "typebox";
import type { SupervisorDb } from "../../db/db.js";
import { buildExtensionDeps, createExtensionDatabase } from "./deps.js";
import { SessionExtensionServices } from "./services.js";
import type { ToolPolicy } from "./services.js";
import type {
  BroadcastEvent,
  ApprovalRequest,
  ApprovalResult,
  ContinueTurnOptions,
  EventBus,
  EventHandlerContext,
  ExecResult,
  ExtensionDatabase,
  ExtensionEvent,
  ExtensionSqliteDatabase,
  ExtensionSqliteStatement,
  MemberAgentInfo,
  SessionInfo,
  SessionResultSummary,
  ScheduleInjectionInput,
  SpawnSessionRequest,
  SpawnSessionResult,
  ToolDefinition,
  ExtensionCommandDefinition,
  ToolGuardHandler,
  ToolInfo,
  ToolResultHandler,
} from "../index.js";
import { getProjectDir, getSessionDir } from "../../core/session-files.js";
import type { SessionManager } from "../../core/session-manager.js";
import type { SessionRuntime } from "../../core/session-runtime.js";
import type { SessionWorkflowState, WorkflowStatePatch } from "../../core/session-workflow.js";

export interface ContextSessionMessages {
  list: ExtensionDatabase["getMessages"];
  get: ExtensionDatabase["getMessageById"];
  tree: ExtensionDatabase["getMessageTree"];
  currentBranch: ExtensionDatabase["getCurrentBranch"];
  search: ExtensionDatabase["searchMessages"];
  getMeta(messageId: string): Promise<Record<string, unknown>>;
  setMeta(messageId: string, meta: Record<string, unknown>): Promise<void>;
  patchMeta(messageId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  setLabel(entryId: string, label: string | undefined): Promise<void>;
  stats: ExtensionDatabase["getMessageStats"];
  contextUsage: ExtensionDatabase["getContextUsage"];
}

export interface ContextSessionMeta {
  get(): Promise<Record<string, unknown>>;
  set(meta: Record<string, unknown>): Promise<void>;
  patch(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface ContextSessionTools {
  setPolicy(policy: ToolPolicy): void;
  getPolicy(): ToolPolicy;
  beforeUse(handler: ToolGuardHandler, options?: { priority?: number }): () => void;
  afterUse(handler: ToolResultHandler, options?: { priority?: number }): () => void;
  enable(name: string): void;
  disable(name: string, reason?: string): void;
  setActive(names: string[]): Promise<void>;
  getActive(): string[] | null;
}

interface ContextSessionOptions {
  id: number;
  cwd: string;
  dir: string;
  isMain: boolean;
  isChild: boolean;
  getDir: () => Promise<string>;
  isIdle: () => boolean;
  isStreaming: () => boolean;
  getSignal: () => AbortSignal | undefined;
  abort: () => void;
  waitForIdle: () => Promise<void>;
  messages: ContextSessionMessages;
  meta: ContextSessionMeta;
  workflow: {
    get(): Promise<SessionWorkflowState | null>;
    set(patch: WorkflowStatePatch): Promise<SessionWorkflowState>;
    clear(): Promise<void>;
  };
  tools: ContextSessionTools;
  getParent: () => Promise<SessionInfo | undefined>;
  children: () => Promise<SessionInfo[]>;
  appendEntry: <T>(customType: string, data: T) => Promise<string>;
  sendMessage: (message: {
    role: "custom";
    customType: string;
    content: string;
    display?: boolean;
    details?: unknown;
    triggerTurn?: boolean;
  }) => Promise<void>;
  sendUserMessage: (content: string, options?: { source?: string }) => Promise<void>;
  sendToChild: (sessionId: number, content: string, options?: { source?: string }) => Promise<void>;
  pausing: <T>(reason: string, work: Promise<T> | (() => Promise<T>)) => Promise<T>;
  spawn: (request: SpawnSessionRequest) => Promise<SpawnSessionResult>;
  waitForResult: (
    sessionId: number,
    options?: { timeoutMs?: number; maxChars?: number },
  ) => Promise<SessionResultSummary>;
  finish: (sessionId?: number) => Promise<void>;
  fork: (entryId: string, options?: { position?: "before" | "at" }) => Promise<SessionInfo>;
  switchTo: (sessionId: number) => Promise<void>;
  navigateTree: (
    entryId: string,
    options?: { summarize?: boolean; customInstructions?: string },
  ) => Promise<void>;
  compact: (options?: { customInstructions?: string }) => Promise<{
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
  }>;
}

interface ContextAgentOptions {
  id: number;
  name: string;
  providerId: number;
  modelId: string;
  systemPrompt?: string;
  getModel: () => { provider: string; id: string; contextWindow: number } | undefined;
  registerTool: <TParams extends TSchema, TResult>(
    definition: ToolDefinition<TParams, TResult>,
  ) => void;
  unregisterTool: (name: string) => void;
  registerCommand?: (name: string, definition: ExtensionCommandDefinition) => void;
  unregisterCommand?: (name: string) => void;
  listTools: () => ToolInfo[];
  getTool: (name: string) => ToolInfo | undefined;
  findByTag: (tag: string) => Promise<MemberAgentInfo[]>;
  findByRole: (role: string) => Promise<MemberAgentInfo[]>;
  setModel: (provider: string, modelId: string) => Promise<void>;
  setThinkingLevel: (level: "none" | "low" | "medium" | "high") => void;
  getThinkingLevel: () => "none" | "low" | "medium" | "high";
}

type ContextDbOptions = ExtensionSqliteDatabase | undefined;

export interface ContextDependencies {
  sessionManager: SessionManager;
  db: Database;
  sessionRuntime: SessionRuntime;
}

export type Database = SupervisorDb;

interface ContextExtensionHost {
  emit(event: ExtensionEvent): void | Promise<void>;
  listTools(): ToolInfo[];
  on<T extends ExtensionEvent>(
    extensionId: string,
    event: T["type"],
    handler: (event: T, ctx: EventHandlerContext) => void | Promise<void>,
  ): () => void;
  registerTool<TParams extends TSchema, TResult>(
    extensionId: string,
    definition: ToolDefinition<TParams, TResult>,
  ): void;
  unregisterTool(extensionId: string, name: string): void;
  registerCommand(
    extensionId: string,
    name: string,
    definition: ExtensionCommandDefinition,
  ): void;
  unregisterCommand(extensionId: string, name: string): void;
}

/** Session-scoped context shared by every extension activated for that session. */
export class Context {
  readonly session: ContextSession;
  readonly agent: ContextAgent;
  readonly db: ContextDb;
  readonly project: { readonly cwd: string; readonly dir: string; getDir(): Promise<string> };
  readonly ui: {
    broadcast(event: BroadcastEvent): void;
    requestApproval(request: ApprovalRequest): Promise<ApprovalResult>;
  };
  readonly events: EventBus;
  readonly flow;
  readonly inject;
  readonly services: SessionExtensionServices;
  /** Internal session resource bridge used by built-in extensions. */
  readonly agentResource: SessionRuntime["resource"];

  private activeExtensionId: string | undefined;
  private extensionHost: ContextExtensionHost | undefined;
  private readonly logger: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    meta?: Record<string, unknown>,
  ) => void;
  private readonly commandExecutor: (
    command: string,
    args: string[],
    options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
  ) => Promise<ExecResult>;

  constructor({ sessionManager, db, sessionRuntime }: ContextDependencies) {
    const session = sessionManager.get(sessionRuntime.id);
    if (!session) throw new Error(`Session ${sessionRuntime.id} not found`);
    if (session.projectId == null) throw new Error(`Session ${session.id} has no project`);

    const agent = session.agentId == null ? undefined : sessionManager.getAgent(session.agentId);
    const harnessState = (
      sessionRuntime.harness as unknown as {
        agent: {
          state: {
            model: { id: string };
            systemPrompt?: string;
            tools?: AgentTool[];
          };
        };
      }
    ).agent.state;
    const model = harnessState.model;
    const extensionDb = createExtensionDatabase({
      sessionId: session.id,
      query: async <T>(sql: string, params: unknown[]) => db.db.prepare(sql).all(...params) as T[],
      queryOne: async <T>(sql: string, params: unknown[]) =>
        db.db.prepare(sql).get(...params) as T | undefined,
      sqlite: db.db,
    });
    const deps = buildExtensionDeps({
      runtime: sessionRuntime,
      manager: sessionManager,
      db,
      sessionId: session.id,
      projectId: session.projectId,
      listSessionTools: () => this.listSessionTools(harnessState.tools ?? []),
      emitExtensionEvent: (event) => this.extensionHost?.emit(event),
    });

    this.services = new SessionExtensionServices({
      sessionId: session.id,
      deps: {
        continueTurn: deps.continueTurn,
        getContextUsage: deps.getContextUsage,
        isIdle: deps.isIdle,
        isStreaming: deps.isStreaming,
        pausing: deps.pausing,
        broadcast: (event: Record<string, unknown>) => deps.broadcast(event as BroadcastEvent),
      },
    });
    this.agentResource = sessionRuntime.resource;

    const sessionTools: ContextSessionTools = {
      setPolicy: (policy) => this.services.tools.setPolicy(policy),
      getPolicy: () => this.services.tools.getPolicy(),
      beforeUse: (handler, options) => this.services.tools.beforeUse(handler, options),
      afterUse: (handler, options) => this.services.tools.afterUse(handler, options),
      enable: (name) => this.services.tools.enable(name),
      disable: (name, reason) => this.services.tools.disable(name, reason),
      setActive: async (names) => {
        this.services.tools.setActive(names);
        await deps.setActiveTools(names);
      },
      getActive: () => this.services.tools.getActiveToolNames(),
    };

    const sessionOptions: ContextSessionOptions = {
      id: session.id,
      cwd: session.cwd,
      dir: getSessionDir(session.projectId, session.id),
      isMain: session.parentId == null,
      isChild: session.parentId != null,
      getDir: deps.getSessionDir,
      isIdle: deps.isIdle,
      isStreaming: deps.isStreaming,
      getSignal: deps.getSignal,
      abort: deps.abort,
      waitForIdle: deps.waitForIdle,
      messages: {
        list: extensionDb.getMessages,
        get: extensionDb.getMessageById,
        tree: extensionDb.getMessageTree,
        currentBranch: extensionDb.getCurrentBranch,
        search: extensionDb.searchMessages,
        getMeta: extensionDb.getMessageMeta,
        setMeta: deps.setMessageMeta,
        patchMeta: deps.patchMessageMeta,
        setLabel: deps.setLabel,
        stats: extensionDb.getMessageStats,
        contextUsage: extensionDb.getContextUsage,
      },
      meta: {
        get: extensionDb.getSessionMeta,
        set: deps.setSessionMeta,
        patch: deps.patchSessionMeta,
      },
      workflow: {
        get: deps.getWorkflow,
        set: deps.setWorkflow,
        clear: deps.clearWorkflow,
      },
      tools: sessionTools,
      getParent: extensionDb.getParentSession,
      children: extensionDb.getChildSessions,
      appendEntry: deps.appendEntry,
      sendMessage: deps.sendMessage,
      sendUserMessage: deps.sendUserMessage,
      sendToChild: deps.sendToChild,
      pausing: deps.pausing,
      spawn: deps.spawnSession,
      waitForResult: async (targetSessionId, options) => {
        await deps.waitForSessionIdle(targetSessionId, { timeoutMs: options?.timeoutMs });
        return deps.getSessionResultSummary(targetSessionId, { maxChars: options?.maxChars });
      },
      finish: (targetSessionId) => deps.finishSession(targetSessionId ?? session.id),
      fork: deps.fork,
      switchTo: deps.switchSession,
      navigateTree: deps.navigateTree,
      compact: deps.compact,
    };
    const agentOptions: ContextAgentOptions = {
      id: agent?.id ?? session.id,
      name: agent?.name ?? "Session",
      providerId: agent?.providerId ?? 0,
      modelId: model.id,
      systemPrompt: harnessState.systemPrompt,
      getModel: deps.getModel,
      registerTool: (definition) =>
        this.requireExtensionHost().registerTool(this.requireActiveExtension(), definition),
      unregisterTool: (name) =>
        this.requireExtensionHost().unregisterTool(this.requireActiveExtension(), name),
      registerCommand: (name, definition) =>
        this.requireExtensionHost().registerCommand(
          this.requireActiveExtension(),
          name,
          definition,
        ),
      unregisterCommand: (name) =>
        this.requireExtensionHost().unregisterCommand(this.requireActiveExtension(), name),
      listTools: () => this.listSessionTools(harnessState.tools ?? []),
      getTool: (name) =>
        this.listSessionTools(harnessState.tools ?? []).find((tool) => tool.name === name),
      findByTag: deps.getMemberAgentsByTag,
      findByRole: deps.getMemberAgentsByRole,
      setModel: deps.setModel,
      setThinkingLevel: deps.setThinkingLevel,
      getThinkingLevel: deps.getThinkingLevel,
    };

    this.session = new ContextSession(sessionOptions);
    this.agent = new ContextAgent(agentOptions);
    this.db = new ContextDb(db.db);
    this.project = {
      cwd: session.cwd,
      dir: getProjectDir(session.projectId),
      getDir: deps.getProjectDir,
    };
    this.ui = {
      broadcast: deps.broadcast,
      requestApproval: (request) => this.services.uiApproval.requestApproval(request),
    };
    this.events = deps.eventBus;
    this.flow = {
      continue: (options?: ContinueTurnOptions) => this.services.flow.continue(options),
      pause: (reason?: string) => this.services.flow.pause(reason),
      resume: () => this.services.flow.resume(),
      acquireLock: (key: string, options?: { ttlMs?: number }) =>
        this.services.flow.acquireLock(key, options),
      usage: (options?: { since?: "session" | "lastTurn"; scope?: string }) =>
        this.services.flow.usage(options),
      startScope: (scope: string) => this.services.flow.startScope(scope),
      endScope: (scope: string) => this.services.flow.endScope(scope),
    };
    this.inject = {
      schedule: (input: ScheduleInjectionInput) => this.services.inject.schedule(input),
      clear: (variant: string) => this.services.inject.clear(variant),
      reattach: (
        variant: string,
        content: string,
        options?: Omit<ScheduleInjectionInput, "variant" | "content">,
      ) => this.services.inject.reattach(variant, content, options),
    };
    this.logger = deps.log;
    this.commandExecutor = deps.exec;
  }

  /** Internal bridge used by the session's extension runtime. */
  attachExtensionHost(host: ContextExtensionHost): void {
    if (this.extensionHost && this.extensionHost !== host) {
      throw new Error(`Context for session ${this.session.id} is already attached`);
    }
    this.extensionHost = host;
  }

  /** Run one extension with a temporary ownership marker on this session context. */
  async runExtension<T>(extensionId: string, run: () => T | Promise<T>): Promise<T> {
    const previous = this.activeExtensionId;
    this.activeExtensionId = extensionId;
    try {
      return await run();
    } finally {
      this.activeExtensionId = previous;
    }
  }

  on<T extends ExtensionEvent>(
    event: T["type"],
    handler: (event: T, ctx: EventHandlerContext) => void | Promise<void>,
  ): () => void {
    return this.requireExtensionHost().on(this.requireActiveExtension(), event, handler);
  }

  log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    this.logger(level, message, meta);
  }

  exec(
    command: string,
    args: string[],
    options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
  ): Promise<ExecResult> {
    return this.commandExecutor(command, args, options);
  }

  private listSessionTools(builtinTools: AgentTool[]): ToolInfo[] {
    const merged = new Map<string, ToolInfo>();
    for (const tool of builtinTools) {
      merged.set(tool.name, {
        name: tool.name,
        description: tool.description ?? tool.name,
        parameters: tool.parameters as TSchema,
        source: "builtin",
        definition: tool as unknown as ToolDefinition<TSchema, unknown>,
      });
    }
    for (const tool of this.extensionHost?.listTools() ?? []) merged.set(tool.name, tool);
    return [...merged.values()];
  }

  private requireActiveExtension(): string {
    if (!this.activeExtensionId) {
      throw new Error("Extension resources can only be registered during extension activation");
    }
    return this.activeExtensionId;
  }

  private requireExtensionHost(): ContextExtensionHost {
    if (!this.extensionHost) throw new Error("Context is not attached to an extension runtime");
    return this.extensionHost;
  }
}

/** Current session identity and session-domain operations. */
export class ContextSession {
  constructor(private readonly options: ContextSessionOptions) {}

  get id(): number {
    return this.options.id;
  }
  get cwd(): string {
    return this.options.cwd;
  }
  get dir(): string {
    return this.options.dir;
  }
  get isMain(): boolean {
    return this.options.isMain;
  }
  get isChild(): boolean {
    return this.options.isChild;
  }
  get signal(): AbortSignal | undefined {
    return this.options.getSignal();
  }
  get messages(): ContextSessionMessages {
    return this.options.messages;
  }
  get meta(): ContextSessionMeta {
    return this.options.meta;
  }
  get workflow(): ContextSessionOptions["workflow"] {
    return this.options.workflow;
  }
  get tools(): ContextSessionTools {
    return this.options.tools;
  }

  getDir(): Promise<string> {
    return this.options.getDir();
  }
  isIdle(): boolean {
    return this.options.isIdle();
  }
  isStreaming(): boolean {
    return this.options.isStreaming();
  }
  abort(): void {
    this.options.abort();
  }
  waitForIdle(): Promise<void> {
    return this.options.waitForIdle();
  }
  getParent(): Promise<SessionInfo | undefined> {
    return this.options.getParent();
  }
  children(): Promise<SessionInfo[]> {
    return this.options.children();
  }
  appendEntry<T>(customType: string, data: T): Promise<string> {
    return this.options.appendEntry(customType, data);
  }
  sendMessage(message: Parameters<ContextSessionOptions["sendMessage"]>[0]): Promise<void> {
    return this.options.sendMessage(message);
  }
  sendUserMessage(content: string, options?: { source?: string }): Promise<void> {
    return this.options.sendUserMessage(content, options);
  }
  sendToChild(sessionId: number, content: string, options?: { source?: string }): Promise<void> {
    return this.options.sendToChild(sessionId, content, options);
  }
  pausing<T>(reason: string, work: Promise<T> | (() => Promise<T>)): Promise<T> {
    return this.options.pausing(reason, work);
  }
  spawn(request: SpawnSessionRequest): Promise<SpawnSessionResult> {
    return this.options.spawn(request);
  }
  waitForResult(sessionId: number, options?: { timeoutMs?: number; maxChars?: number }) {
    return this.options.waitForResult(sessionId, options);
  }
  finish(sessionId?: number): Promise<void> {
    return this.options.finish(sessionId);
  }
  fork(entryId: string, options?: { position?: "before" | "at" }): Promise<SessionInfo> {
    return this.options.fork(entryId, options);
  }
  switchTo(sessionId: number): Promise<void> {
    return this.options.switchTo(sessionId);
  }
  navigateTree(
    entryId: string,
    options?: { summarize?: boolean; customInstructions?: string },
  ): Promise<void> {
    return this.options.navigateTree(entryId, options);
  }
  compact(options?: { customInstructions?: string }) {
    return this.options.compact(options);
  }
}

/** Current agent identity and agent-domain operations. */
export class ContextAgent {
  constructor(private readonly options: ContextAgentOptions) {}

  get id(): number {
    return this.options.id;
  }
  get name(): string {
    return this.options.name;
  }
  get providerId(): number {
    return this.options.providerId;
  }
  get modelId(): string {
    return this.options.modelId;
  }
  get systemPrompt(): string | undefined {
    return this.options.systemPrompt;
  }
  get model() {
    return this.options.getModel();
  }

  registerTool<TParams extends TSchema, TResult>(
    definition: ToolDefinition<TParams, TResult>,
  ): void {
    this.options.registerTool(definition);
  }
  unregisterTool(name: string): void {
    this.options.unregisterTool(name);
  }
  registerCommand(name: string, definition: ExtensionCommandDefinition): void {
    if (!this.options.registerCommand) throw new Error("Slash command registration is unavailable");
    this.options.registerCommand(name, definition);
  }
  unregisterCommand(name: string): void {
    this.options.unregisterCommand?.(name);
  }
  listTools(): ToolInfo[] {
    return this.options.listTools();
  }
  getTool(name: string): ToolInfo | undefined {
    return this.options.getTool(name);
  }
  findByTag(tag: string): Promise<MemberAgentInfo[]> {
    return this.options.findByTag(tag);
  }
  findByRole(role: string): Promise<MemberAgentInfo[]> {
    return this.options.findByRole(role);
  }
  setModel(provider: string, modelId: string): Promise<void> {
    return this.options.setModel(provider, modelId);
  }
  setThinkingLevel(level: "none" | "low" | "medium" | "high"): void {
    this.options.setThinkingLevel(level);
  }
  getThinkingLevel(): "none" | "low" | "medium" | "high" {
    return this.options.getThinkingLevel();
  }
}

/** Raw SQL access for advanced extension use cases. */
export class ContextDb {
  constructor(private readonly sqlite: ContextDbOptions) {}

  get available(): boolean {
    return this.sqlite !== undefined;
  }

  prepare(sql: string): ExtensionSqliteStatement {
    return this.getDatabase().prepare(sql);
  }

  query<T>(sql: string, params: unknown[] = []): T[] {
    return this.prepare(sql).all(...params) as T[];
  }

  queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
    return this.prepare(sql).get(...params) as T | undefined;
  }

  execute(sql: string, params: unknown[] = []): unknown {
    return this.prepare(sql).run(...params);
  }

  private getDatabase(): ExtensionSqliteDatabase {
    if (!this.sqlite) throw new Error("SQL access is not available in this context");
    return this.sqlite;
  }
}
