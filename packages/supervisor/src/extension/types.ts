/**
 * Supervisor Extension System - Types
 *
 * 新的扩展系统设计，完全面向 HTTP/多会话架构
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Static, TSchema } from "typebox";
import type { CreateJobInput, JobRecord, UpdateJobInput } from "../core/jobs/jobs.js";
import type { WatsonRunResult } from "../core/agent/watson.js";
import type {
  AgentBackendType,
  AgentExternalConfig,
  SessionAvatar,
  SessionCreationMethod,
  SessionStatus,
  SessionTaskKind,
  SessionTodoStatus,
  ToolsPreset,
} from "../types.js";
import type { SessionBranchType } from "../core/session/session-history.js";

/**
 * Thin session-stage view, replacing the former meta.workflow { stage, status }.
 * Backed by SessionManager.getStage/setStage (sessions.stage column).
 */
export interface SessionWorkflowState {
  stage: string;
  status: "working";
}

export interface WorkflowStatePatch {
  stage?: string | null;
  [key: string]: unknown;
}

/** Extension-facing view of a task stored in sessions.meta. */
export interface SessionTaskInfo {
  id: number;
  path: string;
  kind: SessionTaskKind;
  title: string | null;
  status: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Extension-facing view of a todo stored in sessions.meta. */
export interface SessionTodoInfo {
  id: number;
  title: string;
  status: SessionTodoStatus;
  taskKey: string | null;
  dependsOn: string[];
  childSessionId: number | null;
  sortOrder: number;
}

// ============================================================================
// Extension Entry
// ============================================================================

export type ExtensionCleanup = () => void | Promise<void>;
export type SessionSetupReason = "create" | "restore";

export type SessionRemoveReason = "delete" | "achieve" | "replace" | "shutdown";

export type UiMenuSurface = "session" | "message";

export interface UiMenuDescriptor {
  id: string;
  surface: UiMenuSurface;
  label: string;
  icon?: string;
  order?: number;
}

export interface SessionExtensionDefinition {
  /** 扩展名称（用于标识和日志） */
  name: string;
  /** Agent-level UI menu descriptors; listed without attaching a Session runtime. */
  menus?: readonly UiMenuDescriptor[];

  /** 初始化函数 */
  setup(context: ExtensionContext): ExtensionCleanup | void | Promise<void | ExtensionCleanup>;
}

export interface AgentExtensionDefinition {
  name: string;
  readonly scope: "agent";
  menus?: readonly UiMenuDescriptor[];
  setup(context: AgentExtensionContext): ExtensionCleanup | void | Promise<void | ExtensionCleanup>;
}

/** Legacy/session-scoped extension definition retained for compatibility. */
export type ExtensionDefinition = SessionExtensionDefinition;
export type AnyExtensionDefinition = SessionExtensionDefinition | AgentExtensionDefinition;

export interface ScheduleInjectionInput {
  variant: string;
  content: string;
  priority?: number;
  dedupeAfterTurns?: number;
}

export interface ContinueTurnOptions {
  prompt?: string;
  origin?: string;
  dedupeKey?: string;
}

export interface ContinueTurnResult {
  queued: boolean;
  reason?: string;
}

export interface TurnUsage {
  turns: number;
  tokens: number;
  wallClockMs: number;
  contextTokens: number | null;
}

export interface TurnFlowLock {
  key: string;
  release(): void;
}

export type ApprovalAction = "approve" | "approve_session" | "reject" | "revise";

export interface ApprovalOption {
  label: string;
  description?: string;
}

export interface ApprovalRequest {
  kind: string;
  title: string;
  body: string;
  options?: ApprovalOption[];
  actions?: ApprovalAction[];
}

export type ApprovalResult =
  | { action: "approve"; selectedOption?: string }
  | { action: "approve_session"; selectedOption?: string }
  | { action: "reject" }
  | { action: "revise"; feedback: string };

export interface ToolResourceAccess {
  kind: "file";
  mode: "read" | "write";
  pattern: string;
}

export type ToolDecision = { allow: true } | { allow: false; reason: string };
export interface ToolCallInfo {
  name: string;
  args: unknown;
}

export type ToolGuardHandler = (
  call: ToolCallInfo & { toolCallId: string },
) => Promise<ToolDecision | void> | ToolDecision | void;

export type ToolResultHandler = (
  call: ToolCallInfo & {
    toolCallId: string;
    result: unknown;
    setResult: (next: unknown) => void;
  },
) => Promise<void> | void;

export interface ExtensionSessionMessages {
  list: ExtensionDatabase["getMessages"];
  get(messageId: string): Promise<ExtensionMessage | undefined>;
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

export interface SessionData {
  id: number;
  projectId: number | null;
  parentId: number | null;
  status: SessionStatus;
  thinkingLevel: "none" | "low" | "medium" | "high";
  cwd: string;
  leafId: string | null;
  agentId: number | null;
  spawnType: SessionBranchType | null;
  creationMethod: SessionCreationMethod;
  title: string | null;
  systemPrompt: string | null;
  avatar: SessionAvatar | null;
  isBuiltin: boolean;
  pinned: boolean;
  muted: boolean;
  unread: number;
  externalSessionId: string | null;
  errorMsg: string | null;
  stage: string | null;
  shadowEnabled: boolean;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface AgentData {
  id: number;
  name: string;
  description: string | null;
  avatar: string | null;
  providerId: number | null;
  backendType: AgentBackendType;
  modelId: number | null;
  systemPrompt: string | null;
  toolsPreset: ToolsPreset | null;
  homeDir: string | null;
  isBuiltin: boolean;
  externalConfig: AgentExternalConfig | null;
  permissionRules: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectData {
  id: number;
  name: string;
  description: string | null;
  cwd: string;
  homeDir: string;
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDataFacade {
  get(): Promise<SessionData>;
  set(data: SessionData): Promise<SessionData>;
  patch(patch: Partial<SessionData>): Promise<SessionData>;
}

export interface SessionMetaFacade {
  get(): Promise<Record<string, unknown>>;
  set(meta: Record<string, unknown>): Promise<void>;
  patch(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface MessageMetaFacade {
  get(): Promise<MessageMeta>;
  set(meta: MessageMeta): Promise<void>;
  patch(patch: Record<string, unknown>): Promise<MessageMeta>;
}

export interface AgentDataFacade {
  get(): Promise<AgentData>;
  set(data: AgentData): Promise<AgentData>;
  patch(patch: Partial<AgentData>): Promise<AgentData>;
}

export interface AgentMetaFacade {
  get(): Promise<Record<string, unknown>>;
  set(meta: Record<string, unknown>): Promise<void>;
  patch(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface ProjectDataFacade {
  get(): Promise<ProjectData>;
  set(data: ProjectData): Promise<ProjectData>;
  patch(patch: Partial<ProjectData>): Promise<ProjectData>;
}

export interface ExtensionSession {
  readonly id: number;
  readonly projectId: number | null;
  readonly parentId: number | null;
  readonly status: SessionStatus;
  readonly thinkingLevel: "none" | "low" | "medium" | "high";
  readonly cwd: string;
  readonly leafId: string | null;
  readonly agentId: number | null;
  readonly spawnType: SessionBranchType | null;
  readonly creationMethod: SessionCreationMethod;
  readonly title: string | null;
  readonly systemPrompt: string | null;
  readonly avatar: SessionAvatar | null;
  readonly isBuiltin: boolean;
  readonly pinned: boolean;
  readonly muted: boolean;
  readonly unread: number;
  readonly externalSessionId: string | null;
  readonly errorMsg: string | null;
  readonly stage: string | null;
  readonly shadowEnabled: boolean;
  readonly createdAt: Date;
  readonly lastActiveAt: Date;
  readonly dir: string;
  readonly isMain: boolean;
  readonly isChild: boolean;
  readonly signal: AbortSignal | undefined;
  readonly messages: ExtensionSessionMessages;
  readonly data: SessionDataFacade;
  readonly meta: SessionMetaFacade;
  readonly workflow: {
    get(): Promise<SessionWorkflowState | null>;
    set(patch: WorkflowStatePatch): Promise<SessionWorkflowState>;
    clear(): Promise<void>;
  };
  /** Goal/Plan task artifacts backed by sessions.meta. */
  readonly tasks: {
    list(): Promise<SessionTaskInfo[]>;
    upsert(input: {
      path: string;
      kind: SessionTaskKind;
      title?: string | null;
      status?: string | null;
    }): Promise<SessionTaskInfo>;
    remove(path: string): Promise<boolean>;
    getCurrentPath(): Promise<string | null>;
    setCurrentPath(path: string | null): Promise<void>;
  };
  /** Session todo list backed by sessions.meta. */
  readonly todos: {
    list(): Promise<SessionTodoInfo[]>;
    replace(
      todos: Array<{
        id?: string;
        title: string;
        status: SessionTodoStatus;
        dependsOn?: string[];
        sessionId?: number;
      }>,
    ): Promise<SessionTodoInfo[]>;
  };
  readonly activity: {
    touch(): void;
  };
  /** Named session policies (not extensions). Call from session.setup. */
  readonly policy: {
    active(id: string): void;
  };
  checkpoint(label?: string): Promise<unknown>;
  rewindToEntry(entryId: string): Promise<void>;
  readonly agent: AgentDataFacade | null;
  setMeta(meta: Record<string, unknown>): Promise<void>;
  patchMeta(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Project belonging to this Session. */
  readonly project: SupervisorProjectFacade;
  /** Session-scoped prompt injection. */
  readonly inject: TurnInjectorFacade;
  readonly tools: {
    beforeUse(handler: ToolGuardHandler, options?: { priority?: number }): () => void;
    afterUse(handler: ToolResultHandler, options?: { priority?: number }): () => void;
    activate(names: string[]): Promise<void>;
    deactivate(names: string[]): Promise<void>;
    enable(name: string): void;
    disable(name: string, reason?: string): void;
  };
  on<K extends SessionExtensionEvent["type"]>(
    event: K,
    handler: (
      event: Extract<SessionExtensionEvent, { type: K }>,
      ctx: EventHandlerContext,
    ) => void | Promise<void>,
    options?: ExtensionEventHandlerOptions,
  ): void;
  getDir(): Promise<string>;
  /** Update session working directory (e.g. after worktree create). */
  setCwd(path: string): Promise<void>;
  /**
   * Append text to this session's live system prompt overlay (not persisted to DB).
   * No-op when `content` is empty or already present (idempotent).
   */
  appendSystemPrompt(content: string): Promise<void>;
  /**
   * Upsert a named block into the session system prompt overlay (not persisted to DB).
   * Replaces any previous block with the same `id` (marker-wrapped).
   */
  upsertSystemPromptBlock(id: string, content: string): Promise<void>;
  isIdle(): boolean;
  isStreaming(): boolean;
  abort(): void;
  waitForIdle(): Promise<void>;
  getParent(): Promise<SessionInfo | undefined>;
  children(): Promise<SessionInfo[]>;
  appendEntry<T>(customType: string, data: T): Promise<string>;
  sendMessage(message: {
    role: "custom";
    customType: string;
    content: string;
    display?: boolean;
    details?: unknown;
    triggerTurn?: boolean;
  }): Promise<void>;
  /**
   * Timeline-only custom message for the user (date-divider style).
   * Never enters the LLM context.
   */
  sendCustomMessage(content: string, options?: { createdAt?: number }): Promise<string>;
  sendUserMessage(content: string, options?: { source?: string; origin?: string }): Promise<void>;
  sendToChild(
    sessionId: number,
    content: string,
    options?: {
      source?: string;
      background?: boolean;
      urgency?: "normal" | "urgent";
    },
  ): Promise<void>;
  inspectChild(sessionId: number, options?: { maxChars?: number }): Promise<SubagentStatusSnapshot>;
  pausing<T>(reason: string, work: Promise<T> | (() => Promise<T>)): Promise<T>;
  spawn(request: SpawnSessionRequest): Promise<SpawnSessionResult>;
  waitForResult(
    sessionId: number,
    options?: { timeoutMs?: number; maxChars?: number },
  ): Promise<SessionResultSummary>;
  finish(sessionId?: number): Promise<void>;
  fork(entryId: string, options?: { position?: "before" | "at" }): Promise<SessionInfo>;
  switchTo(sessionId: number): Promise<void>;
  navigateTree(
    entryId: string,
    options?: { summarize?: boolean; customInstructions?: string },
  ): Promise<void>;
  compact(options?: { customInstructions?: string }): Promise<{
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
  }>;
}

export interface ExtensionAgent {
  readonly id: number;
  readonly name: string;
  readonly providerId: number;
  readonly modelId: string;
  /** `native` for Pi agents; Codex / Claude / ACP backends otherwise. */
  readonly backendType: string;
  readonly systemPrompt: string | undefined;
  readonly model: { provider: string; id: string; contextWindow: number } | undefined;
  registerTool<TParams extends TSchema, TResult>(
    definition: ToolDefinition<TParams, TResult>,
  ): void;
  unregisterTool(name: string): void;
  /** Mark registered tools as model-visible (sent to the LLM). */
  activate(names: string[]): Promise<void>;
  /** Mark registered tools as hidden from the LLM (does not unregister). */
  deactivate(names: string[]): Promise<void>;
  registerCommand(name: string, definition: ExtensionCommandDefinition): void;
  unregisterCommand(name: string): void;
  registerSlash(name: string, definition: ExtensionSlashDefinition): void;
  unregisterSlash(name: string): void;
  listTools(): ToolInfo[];
  getTool(name: string): ToolInfo | undefined;
  /** Legacy lookup; session subagents no longer carry tags, so this returns an empty list. */
  findByTag(tag: string): Promise<MemberAgentInfo[]>;
  /** `spawned` resolves the Agent IDs in `sessions.meta.subagentIds`. */
  findByRole(role: string): Promise<MemberAgentInfo[]>;
  setModel(provider: string, modelId: string): Promise<void>;
  setThinkingLevel(level: "none" | "low" | "medium" | "high"): void;
  getThinkingLevel(): "none" | "low" | "medium" | "high";
}

export interface AgentExtensionAgent extends Omit<ExtensionAgent, "activate" | "deactivate"> {
  readonly data: AgentDataFacade;
  readonly meta: AgentMetaFacade;
  on(
    event: "session.setup",
    handler: (
      session: ExtensionSession,
      reason: SessionSetupReason,
    ) => void | ExtensionCleanup | Promise<void | ExtensionCleanup>,
    options?: ExtensionEventHandlerOptions,
  ): void;
  on(
    event: "session.remove",
    handler: (
      session: ExtensionSession,
      reason: SessionRemoveReason,
    ) => void | ExtensionCleanup | Promise<void | ExtensionCleanup>,
    options?: ExtensionEventHandlerOptions,
  ): void;
}

export type ExtensionSlashSource = "skill" | "prompt" | "custom";
export type ExtensionSlashArguments =
  | { type: "none" }
  | { type: "text"; required?: boolean; placeholder?: string };
export type ExtensionSlashResult =
  | { type: "handled"; message?: string }
  | { type: "prompt"; prompt: string }
  | { type: "error"; message: string };

interface ExtensionSlashBase {
  description?: string;
  source?: ExtensionSlashSource;
  icon?: string;
  arguments?: ExtensionSlashArguments;
}

export type ExtensionSlashDefinition = ExtensionSlashBase &
  (
    | { template: string | ((args: string) => string | Promise<string>); handler?: never }
    | {
        handler(
          args: string,
          context: { sessionId: number; cwd: string },
        ): ExtensionSlashResult | void | Promise<ExtensionSlashResult | void>;
        template?: never;
      }
  );

/** @deprecated Use ExtensionSlashDefinition. */
export type ExtensionCommandDefinition = ExtensionSlashDefinition;

export interface ExtensionCommandInfo {
  name: string;
  description?: string;
  extensionName: string;
  definition: ExtensionSlashDefinition;
}

export interface ExtensionRawDatabase {
  readonly available: boolean;
  prepare(sql: string): ExtensionSqliteStatement;
  query<T>(sql: string, params?: unknown[]): T[];
  queryOne<T>(sql: string, params?: unknown[]): T | undefined;
  execute(sql: string, params?: unknown[]): unknown;
}

// ============================================================================
// Extension Context
// ============================================================================

export interface ExtensionContext {
  /** 当前扩展实例元信息 */

  /** 会话域：当前会话身份 + spawn / 消息 / meta 等操作 */
  readonly session: ExtensionSession;
  /** Extension-to-extension capability registry for this Session. */
  readonly capabilities: {
    provide<T>(name: string, api: T): void;
    get<T>(name: string): T | undefined;
  };
  /** @deprecated Prefer session.policy.active; kept for agent.meta.disabledPolicies. */
  readonly policies: {
    disable(id: string): void;
    isDisabled(id: string): boolean;
  };

  /** Agent 域：当前 agent 身份 + 工具注册 / 查找等操作 */
  readonly agent: ExtensionAgent;

  /** Session-scoped registry for dynamically invoking tools registered by any extension. */
  readonly tools: ExtensionToolFacade;

  /** System-level execution records used by extensions; not an LLM tool surface. */
  readonly jobs: ExtensionJobFacade;

  /** 项目域：工作区与项目级目录 */
  readonly project: SupervisorProjectFacade;

  /** UI：广播、审批 */
  readonly ui: SupervisorUiFacade;

  /** Raw SQL access. Extensions using it are responsible for database integrity. */
  readonly db: ExtensionRawDatabase;

  /** 订阅扩展事件，返回解绑函数 */
  on<K extends ExtensionEvent["type"]>(
    event: K,
    handler: (
      event: Extract<ExtensionEvent, { type: K }>,
      ctx: EventHandlerContext,
    ) => void | Promise<void>,
    options?: ExtensionEventHandlerOptions,
  ): () => void;

  /** 写日志 */
  log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    meta?: Record<string, unknown>,
  ): void;

  /** 执行系统命令 */
  exec(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      timeout?: number;
      signal?: AbortSignal;
    },
  ): Promise<ExecResult>;

  /** 扩展间事件总线 */
  readonly events: EventBus;

  /** Turn 流程控制 */
  readonly flow: TurnFlowFacade;

  /** Turn 边界注入（plan/goal 等） */
  readonly inject: TurnInjectorFacade;

  /**
   * 华生：内部助手 runner（AgentHarness + 简单工具 + 助手模型）。
   * 不创建用户 session；可用于项目解析、清理等，支持 structured 结果。
   */
  readonly watson: {
    run<Schema extends TSchema>(options: {
      kind: string;
      prompt: string;
      mode: "simple" | "agent";
      cwd?: string;
      systemPrompt?: string;
      injectSystem?: string;
      toolsPreset?: "coding" | "readonly" | "none";
      extraTools?: AgentTool[];
      resultSchema: Schema;
    }): Promise<WatsonRunResult<Static<Schema>>>;
    run(options: {
      kind: string;
      prompt: string;
      mode: "simple" | "agent";
      cwd?: string;
      systemPrompt?: string;
      injectSystem?: string;
      toolsPreset?: "coding" | "readonly" | "none";
      extraTools?: AgentTool[];
    }): Promise<WatsonRunResult>;
  };
}

export interface AgentExtensionContext {
  readonly agent: AgentExtensionAgent;
  readonly policies: ExtensionContext["policies"];
  readonly capabilities: ExtensionContext["capabilities"];
  readonly db: ExtensionRawDatabase;
  readonly ui: SupervisorUiFacade;
  readonly events: EventBus;
  readonly watson: ExtensionContext["watson"];
  log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    meta?: Record<string, unknown>,
  ): void;
  exec(
    command: string,
    args: string[],
    options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
  ): Promise<ExecResult>;
}

export interface ExtensionToolCallResult<TResult = unknown> {
  content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>;
  details?: TResult;
  isError?: boolean;
}

export interface ExtensionToolFacade {
  list(): ToolInfo[];
  get(name: string): ToolInfo | undefined;
  call<TResult = unknown>(
    name: string,
    params: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<ExtensionToolCallResult<TResult>>;
}

/** Session-scoped access to Supervisor's system-level execution registry (running work units). */
export interface ExtensionJobFacade {
  create(input: CreateJobInput): Promise<JobRecord>;
  get(id: string): Promise<JobRecord | undefined>;
  list(options?: { limit?: number; kind?: string }): Promise<JobRecord[]>;
  update(id: string, patch: UpdateJobInput): Promise<JobRecord>;
  cancel(id: string): Promise<JobRecord>;
  input(id: string, input: string): Promise<void>;
  setCancelHandler(id: string, handler: () => void | Promise<void>): void;
  setInputHandler(id: string, handler: (input: string) => void | Promise<void>): void;
}

// ============================================================================
// Core Object Facades
// ============================================================================

/** 当前会话身份 + 会话域操作（融合） */
export interface TurnInjectorFacade {
  schedule(input: ScheduleInjectionInput): void;
  clear(variant: string): void;
  reattach(
    variant: string,
    content: string,
    options?: Omit<ScheduleInjectionInput, "variant" | "content">,
  ): void;
}

export interface TurnFlowFacade {
  continue(options?: ContinueTurnOptions): Promise<ContinueTurnResult>;
  pause(reason?: string): Promise<void>;
  resume(): Promise<void>;
  acquireLock(key: string, options?: { ttlMs?: number }): Promise<TurnFlowLock | null>;
  usage(options?: { since?: "session" | "lastTurn"; scope?: string }): Promise<TurnUsage>;
  startScope(scope: string): void;
  endScope(scope: string): void;
}

export interface SupervisorProjectFacade {
  readonly data: ProjectDataFacade;
  readonly cwd: string;
  readonly dir: string;
  getDir(): Promise<string>;
}

export interface SupervisorUiFacade {
  broadcast(event: BroadcastEvent): void;
  requestApproval(request: ApprovalRequest): Promise<ApprovalResult>;
  registerMenu(menu: UiMenuDefinition): () => void;
}

export interface UiMenuContext {
  sessionId: number;
  entryId?: string;
}

export interface UiMenuResult {
  message?: string;
  refresh?: boolean;
  action?: "select-agent-for-fork";
}

export interface UiMenuDefinition {
  id: string;
  surface: UiMenuSurface;
  label: string;
  icon?: string;
  order?: number;
  visible?: (context: UiMenuContext) => boolean | Promise<boolean>;
  action: (context: UiMenuContext) => UiMenuResult | void | Promise<UiMenuResult | void>;
}

// ============================================================================
// Database Access
// ============================================================================

export interface ExtensionDatabase {
  readonly sqlite?: ExtensionSqliteDatabase;

  // ----- 消息查询 -----

  /** 查询当前会话的消息列表 */
  getMessages(options?: {
    limit?: number;
    offset?: number;
    role?: "user" | "assistant" | "tool" | "custom";
    parentId?: string | null;
    entryType?: "message" | "custom" | "fork" | "label";
  }): Promise<MessageEntry[]>;

  /** 根据 ID 获取单条消息 */
  getMessageById(id: string): Promise<MessageEntry | undefined>;

  /** 获取消息树结构 */
  getMessageTree(leafId?: string): Promise<MessageNode[]>;

  /** 获取当前分支（从根到叶子） */
  getCurrentBranch(): Promise<MessageEntry[]>;

  /** 全文搜索消息内容 */
  searchMessages(
    query: string,
    options?: {
      limit?: number;
      role?: "user" | "assistant" | "tool";
    },
  ): Promise<SearchResult[]>;

  // ----- 自定义 Entry 查询 -----

  /** 查询特定类型的自定义 entry */
  getCustomEntries<T>(
    customType: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ): Promise<
    Array<{
      id: string;
      data: T;
      createdAt: number;
      entryId: string;
    }>
  >;

  /** 获取最近的自定义 entry */
  getLatestCustomEntry<T>(customType: string): Promise<
    | {
        id: string;
        data: T;
        createdAt: number;
        entryId: string;
      }
    | undefined
  >;

  // ----- 会话元数据 -----

  /** 获取当前会话元数据 */
  getSessionMeta(): Promise<Record<string, unknown>>;

  /** 获取特定消息的元数据 */
  getMessageMeta(messageId: string): Promise<Record<string, unknown>>;

  // ----- 会话树结构 -----

  /** 获取子会话列表 */
  getChildSessions(): Promise<SessionInfo[]>;

  /** 获取父会话信息 */
  getParentSession(): Promise<SessionInfo | undefined>;

  // ----- 统计信息 -----

  /** 获取消息统计 */
  getMessageStats(): Promise<{
    total: number;
    user: number;
    assistant: number;
    tool: number;
    custom: number;
  }>;

  /** 获取当前上下文使用量 */
  getContextUsage(): Promise<{
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  }>;
}

export interface SpawnSessionRequest {
  parentId?: number | null;
  cwd?: string;
  agentId?: number | null;
  instructions?: string;
  systemPrompt?: string;
  meta?: Record<string, unknown>;
}

export interface SpawnSessionResult {
  sessionId: number;
  parentId: number | null;
  status: string;
  agentId: number | null;
  agentName?: string;
  agentBackend?: string;
}

export interface SessionResultSummary {
  sessionId: number;
  status: string;
  result: string;
  truncated: boolean;
}

export interface SubagentStatusSnapshot extends SessionResultSummary {
  parentId: number;
  agentName?: string;
  agentBackend?: string;
  queuedInputCount: number;
  lastActiveAt: number;
}

export interface ExtensionSqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

export interface ExtensionSqliteDatabase {
  prepare(sql: string): ExtensionSqliteStatement;
}

// ============================================================================
// Events
// ============================================================================

export type ExtensionEventHandlerMode = "sync" | "async";

export interface ExtensionEventHandlerOptions {
  /** Higher runs first. Default 0. */
  priority?: number;
  /** sync (default): await before pipeline continues; async: fire-and-forget. */
  mode?: ExtensionEventHandlerMode;
}

export type ExtensionEvent =
  // ==================== 会话生命周期 ====================
  | {
      /** Service teardown before achieve (stop / uninstall). */
      type: "session.before_complete";
      sessionId: number;
    }
  | {
      /** Git merge + worktree cleanup after commit on achieve. */
      type: "session.achieve";
      sessionId: number;
    }
  | {
      /** Teardown before session row is deleted. */
      type: "session.before_delete";
      sessionId: number;
    }
  | {
      type: "session.before_sync";
      sessionId: number;
    }
  | {
      type: "session.after_sync";
      sessionId: number;
    }
  | {
      type: "session.services_wake";
      sessionId: number;
    }
  | {
      type: "session.end";
      reason: "shutdown" | "switch" | "error";
      sessionId: number;
      nextSessionId?: string;
    }
  | {
      /** Shadow is about to run; extensions may add submit_result fields. */
      type: "shadow.start";
      sessionId: number;
      startedAt: number;
      checkpointId: string;
      placeholderEntryId: string;
      submitResultProperties: Record<string, TSchema>;
    }
  | {
      /** Shadow has updated its own result; extensions may process their fields asynchronously. */
      type: "shadow.completed";
      sessionId: number;
      startedAt: number;
      checkpointId: string;
      placeholderEntryId: string;
      checkpoint: {
        gitRef: string | null;
        gitHead: string | null;
      };
      result: {
        message?: string;
        level?: "error" | "warning" | "info";
        shadowMemory?: {
          action: "append" | "replace";
          content: string;
        };
        suggestedQuestions?: string[];
        title?: string;
        extensions: Record<string, unknown>;
      };
    }
  | {
      type: "workflow.stage_changed";
      sessionId: number;
      from: string | null;
      to: string | null;
      workflow: SessionWorkflowState | null;
    }
  | {
      type: "workflow.status_changed";
      sessionId: number;
      stage: string;
      from: SessionWorkflowState["status"] | null;
      to: SessionWorkflowState["status"];
      workflow: SessionWorkflowState;
    }

  // ==================== 消息流 ====================
  | {
      type: "message.user";
      text: string;
      messageId: string;
      entryId: string;
      timestamp: number;
    }
  | {
      type: "message.assistant";
      messageId: string;
      entryId: string;
      content: MessageContent[];
      model?: string;
      usage?: {
        input: number;
        output: number;
        totalTokens: number;
      };
      stopReason?: string;
      timestamp: number;
    }
  | {
      type: "message.tool_call";
      toolCallId: string;
      name: string;
      args: unknown;
      entryId: string;
      timestamp: number;
    }
  | {
      type: "message.tool_result";
      toolCallId: string;
      toolName?: string;
      result: unknown;
      isError: boolean;
      messageId: string;
      entryId: string;
      timestamp: number;
    }
  | {
      type: "message.custom";
      customType: string;
      messageId: string;
      entryId: string;
      content: string;
      display: boolean;
      details?: unknown;
      timestamp: number;
    }

  // ==================== Agent 状态 ====================
  | {
      type: "agent.start";
      messageId: string;
      entryId: string;
      timestamp: number;
    }
  | {
      type: "agent.end";
      messageId: string;
      entryId: string;
      stopReason: string;
      timestamp: number;
      /** Full agent message list at end of turn (supervisor harness bridge). */
      messages?: unknown[];
    }
  | {
      type: "agent.error";
      error: string;
      messageId?: string;
      timestamp: number;
    }
  | {
      type: "agent.abort";
      reason: "user" | "timeout" | "error";
      timestamp: number;
    }

  // ==================== Turn / Step ====================
  | {
      type: "turn.started";
      turnId: number;
      timestamp: number;
    }
  | {
      type: "turn.ended";
      turnId: number;
      reason?: string;
      durationMs?: number;
      usage?: {
        input?: number;
        output?: number;
        totalTokens?: number;
      };
      timestamp: number;
    }
  | {
      type: "step.ended";
      turnId: number;
      usage?: {
        input?: number;
        output?: number;
        totalTokens?: number;
      };
      timestamp: number;
    }

  // ==================== 工具执行 ====================
  | {
      type: "tool.before_call";
      toolCallId: string;
      name: string;
      args: unknown;
      entryId: string;
      /** 可以修改 args 或抛出错误阻止执行 */
      block?: { reason: string };
    }
  | {
      type: "tool.after_call";
      toolCallId: string;
      name: string;
      args: unknown;
      result: {
        content: Array<{ type: string; text?: string }>;
        isError: boolean;
        duration: number;
        details?: unknown;
      };
      entryId: string;
      /** 可以修改 result */
      setResult?: (result: unknown) => void;
    }

  // ==================== 压缩 ====================
  | {
      type: "compact.before";
      customInstructions?: string;
      messageCount: number;
      /** 可以取消压缩 */
      cancel?: boolean;
    }
  | {
      type: "compact.after";
      summary: string;
      removedCount: number;
      remainingCount: number;
      summaryEntryId: string;
    }

  // ==================== 模型变更 ====================
  | {
      type: "model.change";
      provider: string;
      modelId: string;
      previousProvider?: string;
      previousModelId?: string;
    }

  // ==================== HTTP/WebSocket 特定 ====================
  | {
      type: "http.request";
      method: string;
      path: string;
      headers: Record<string, string>;
      clientId: string;
    }
  | {
      type: "http.response";
      status: number;
      clientId: string;
    }
  | {
      type: "ws.connect";
      clientId: string;
      clientInfo?: {
        ip: string;
        userAgent?: string;
      };
    }
  | {
      type: "ws.disconnect";
      clientId: string;
      reason?: string;
    }
  | {
      type: "ws.message";
      clientId: string;
      message: unknown;
    }

  // ==================== 扩展系统 ====================
  | {
      type: "extension.reload";
      reason: "user" | "auto";
    }
  | {
      type: "extension.error";
      extensionName: string;
      error: string;
    };

/** Events emitted by one loaded Session runtime. Agent lifecycle uses AgentExtensionAgent.on. */
export type SessionExtensionEvent = ExtensionEvent;

/** 事件处理器上下文 */
export interface EventHandlerContext {
  /** 当前会话 ID */
  sessionId: number;

  /** 事件时间戳 */
  timestamp: number;

  /** 阻止默认行为（仅适用于支持的事件） */
  preventDefault?: () => void;

  /** 标记事件已处理 */
  handled?: boolean;
}

// ============================================================================
// Tool Types
// ============================================================================

export interface ToolDefinition<TParams extends TSchema, TResult> {
  name: string;
  description: string;
  parameters: TParams;

  /**
   * Whether the tool is model-visible after registration.
   * Defaults to true when omitted.
   */
  active?: boolean;

  /** 可选：工具提示片段（用于系统提示） */
  promptSnippet?: string;

  /** 可选：工具使用指南 */
  promptGuidelines?: string[];

  /** 可选：执行模式 */
  executionMode?: "sequential" | "parallel";

  execute: (
    params: Static<TParams>,
    context: ToolExecutionContext,
  ) => Promise<{
    content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>;
    details?: TResult;
    isError?: boolean;
  }>;
}

export interface ToolExecutionContext {
  toolCallId: string;
  session: {
    id: string;
    cwd: string;
  };
  signal?: AbortSignal;
  reportProgress: (progress: { message?: string; percent?: number; details?: unknown }) => void;
}

export interface ToolInfo {
  name: string;
  description: string;
  parameters: TSchema;
  source: "builtin" | "extension";
  extensionName?: string;
  /** Model-visible when true. Only active tools are sent to the LLM. */
  active: boolean;
  definition: ToolDefinition<TSchema, unknown>;
}

// ============================================================================
// Session Types
// ============================================================================

export interface SessionInfo {
  id: number;
  name?: string;
  cwd: string;
  messageCount: number;
  createdAt: number;
  lastActiveAt: number;
}

export interface MemberAgentInfo {
  id: number;
  name: string;
  description: string | null;
  providerId: number | null;
  modelId: string | null;
  toolsPreset: string | null;
  tags: string[];
  role: string;
  backendType: string;
}

// ============================================================================
// Message Types
// ============================================================================

/** A file owned by Supervisor and rendered below the message that references it. */
export interface MessageAsset {
  /** The dedicated directory that contains `path`. */
  scope: "project" | "agent" | "session";
  /** POSIX-style path relative to the selected scope directory. */
  path: string;
  name?: string;
  mediaType?: string;
}

export interface MessageMeta extends Record<string, unknown> {
  assets?: MessageAsset[];
  /** Whether the user has seen this message. Assistant replies start as unread when no UI is watching. */
  read?: boolean;
}

export interface MessageEntry {
  id: string;
  entryId: string;
  type: "message" | "custom" | "fork" | "label";
  role?: "user" | "assistant" | "tool" | "custom";
  content?: string;
  customType?: string;
  parentId: string | null;
  meta: MessageMeta;
  createdAt: number;
}

export interface ExtensionMessage extends Omit<MessageEntry, "meta"> {
  meta: MessageMetaFacade;
}

export interface MessageNode extends MessageEntry {
  children: MessageNode[];
}

export interface MessageContent {
  type: "text" | "toolCall" | "thinking";
  text?: string;
  name?: string;
  arguments?: unknown;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchResult {
  messageId: string;
  entryId: string;
  role: string;
  content: string;
  highlight: string;
  score: number;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
  duration: number;
}

export type BroadcastEvent =
  | { type: "tool_progress"; toolCallId: string; percent: number; message?: string }
  | { type: "agent_thinking"; text: string }
  | {
      type: "message_meta_updated";
      messageId: string;
      meta: Record<string, unknown>;
      timestamp: number;
    }
  | { type: "custom"; [key: string]: unknown };

export interface EventBus {
  emit(event: string, data: unknown): void;
  on(event: string, handler: (data: unknown) => void): () => void;
  off(event: string, handler: (data: unknown) => void): void;
}

// ============================================================================
// Loader Types
// ============================================================================

export interface LoadExtensionResult {
  definition: AnyExtensionDefinition;
  path: string;
  resolvedPath: string;
  error?: string;
}

export interface LoadExtensionsResult {
  extensions: LoadExtensionResult[];
  errors: Array<{ path: string; error: string }>;
}
