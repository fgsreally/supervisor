/**
 * Supervisor Extension System - Types
 *
 * 新的扩展系统设计，完全面向 HTTP/多会话架构
 */

import type { Static, TSchema } from "typebox";
import type { SessionWorkflowState, WorkflowStatePatch } from "../core/session-workflow.js";

// ============================================================================
// Extension Entry
// ============================================================================

export interface ExtensionDefinition {
  /** 扩展名称（用于标识和日志） */
  name: string;

  /** 初始化函数 */
  setup(
    context: ExtensionContext,
  ): (() => void | Promise<void>) | void | Promise<void | (() => void | Promise<void>)>;
}

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

export type ApprovalAction = "approve" | "reject" | "revise";

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

export interface ExtensionSession {
  readonly id: number;
  readonly cwd: string;
  readonly dir: string;
  readonly isMain: boolean;
  readonly isChild: boolean;
  readonly signal: AbortSignal | undefined;
  readonly messages: ExtensionSessionMessages;
  readonly meta: {
    get(): Promise<Record<string, unknown>>;
    set(meta: Record<string, unknown>): Promise<void>;
    patch(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  readonly workflow: {
    get(): Promise<SessionWorkflowState | null>;
    set(patch: WorkflowStatePatch): Promise<SessionWorkflowState>;
    clear(): Promise<void>;
  };
  readonly tools: {
    beforeUse(handler: ToolGuardHandler, options?: { priority?: number }): () => void;
    afterUse(handler: ToolResultHandler, options?: { priority?: number }): () => void;
    enable(name: string): void;
    disable(name: string, reason?: string): void;
    setActive(names: string[]): Promise<void>;
    getActive(): string[] | null;
  };
  getDir(): Promise<string>;
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
  sendUserMessage(content: string, options?: { source?: string }): Promise<void>;
  sendToChild(sessionId: number, content: string, options?: { source?: string }): Promise<void>;
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
  readonly systemPrompt: string | undefined;
  readonly model: { provider: string; id: string; contextWindow: number } | undefined;
  registerTool<TParams extends TSchema, TResult>(
    definition: ToolDefinition<TParams, TResult>,
  ): void;
  unregisterTool(name: string): void;
  registerCommand(name: string, definition: ExtensionCommandDefinition): void;
  unregisterCommand(name: string): void;
  listTools(): ToolInfo[];
  getTool(name: string): ToolInfo | undefined;
  findByTag(tag: string): Promise<MemberAgentInfo[]>;
  findByRole(role: string): Promise<MemberAgentInfo[]>;
  setModel(provider: string, modelId: string): Promise<void>;
  setThinkingLevel(level: "none" | "low" | "medium" | "high"): void;
  getThinkingLevel(): "none" | "low" | "medium" | "high";
}

export interface ExtensionCommandDefinition {
  description?: string;
  handler(args: string): void | Promise<void>;
}

export interface ExtensionCommandInfo {
  name: string;
  description?: string;
  extensionName: string;
  definition: ExtensionCommandDefinition;
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

  /** Agent 域：当前 agent 身份 + 工具注册 / 查找等操作 */
  readonly agent: ExtensionAgent;

  /** 项目域：工作区与项目级目录 */
  readonly project: SupervisorProjectFacade;

  /** UI：广播、审批 */
  readonly ui: SupervisorUiFacade;

  /** Raw SQL access. Extensions using it are responsible for database integrity. */
  readonly db: ExtensionRawDatabase;

  /** 订阅扩展事件，返回解绑函数 */
  on<T extends ExtensionEvent>(
    event: T["type"],
    handler: (event: T, ctx: EventHandlerContext) => void | Promise<void>,
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
  readonly cwd: string;
  readonly dir: string;
  getDir(): Promise<string>;
}

export interface SupervisorUiFacade {
  broadcast(event: BroadcastEvent): void;
  requestApproval(request: ApprovalRequest): Promise<ApprovalResult>;
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
}

export interface SessionResultSummary {
  sessionId: number;
  status: string;
  result: string;
  truncated: boolean;
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

export type ExtensionEvent =
  // ==================== 会话生命周期 ====================
  | {
      type: "session.start";
      reason: "startup" | "fork" | "switch";
      sessionId: number;
      parentSessionId?: string;
    }
  | {
      /** Fired after session DB row exists, before harness spawn (worktree setup). */
      type: "session.prepare";
      sessionId: number;
      parentSessionId?: string;
      cwd: string;
      toolsPreset: "coding" | "readonly" | "none";
      agentDisplayName?: string;
      meta?: Record<string, unknown>;
    }
  | {
      /** Fired before merge/cleanup on POST /sessions/:id/complete. */
      type: "session.before_complete";
      sessionId: number;
    }
  | {
      type: "session.end";
      reason: "shutdown" | "switch" | "error";
      sessionId: number;
      nextSessionId?: string;
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
  providerId: number;
  modelId: string | null;
  toolsPreset: string | null;
  tags: string[];
  role: string;
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
  definition: ExtensionDefinition;
  path: string;
  resolvedPath: string;
  error?: string;
}

export interface LoadExtensionsResult {
  extensions: LoadExtensionResult[];
  errors: Array<{ path: string; error: string }>;
}
