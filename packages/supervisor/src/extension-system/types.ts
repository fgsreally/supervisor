/**
 * Supervisor Extension System - Types
 *
 * 新的扩展系统设计，完全面向 HTTP/多会话架构
 */

import type { Static, TSchema } from "typebox";
import type { ToolPolicy } from "./tool-policy.js";
import type {
  ApprovalRequest,
  ApprovalResult,
  ContinueTurnOptions,
  ContinueTurnResult,
  ScheduleInjectionInput,
  ToolGuardHandler,
  ToolResultHandler,
  TurnFlowLock,
  TurnUsage,
} from "./extension-session-services.js";

// ============================================================================
// Extension Entry
// ============================================================================

export interface ExtensionDefinition {
  /** 扩展名称（用于标识和日志） */
  name: string;

  /** 初始化函数 */
  setup(context: ExtensionContext): (() => void) | void | Promise<(() => void) | undefined>;
}

export type ExtensionFactory = () => ExtensionDefinition | Promise<ExtensionDefinition>;

// ============================================================================
// Extension Context
// ============================================================================

export interface ExtensionContext {
  // ==================== 核心对象 API ====================

  readonly extension: ExtensionInstance;
  readonly session: SupervisorSessionFacade;
  readonly agent: SupervisorAgentFacade;
  readonly project: SupervisorProjectFacade;
  readonly runtime: SupervisorRuntimeFacade;
  readonly tools: SupervisorToolRegistryFacade;
  readonly ui: SupervisorUiFacade;
  readonly system: SupervisorSystemFacade;

  /** Turn-boundary injections (plan/goal reminders). */
  readonly inject: TurnInjectorFacade;

  // ==================== 会话信息 ====================

  /** 当前会话 ID */
  readonly sessionId: number;

  /** 当前工作目录 */
  readonly cwd: string;

  /** Current session-owned directory for extension private files. */
  readonly sessionDir: string;

  /** Current project-owned directory for project-level extension files. */
  readonly projectDir: string;

  /** Ensure and return the current session-owned directory. */
  getSessionDir(): Promise<string>;

  /** Ensure and return the current project-owned directory. */
  getProjectDir(): Promise<string>;

  /** 当前模型信息 */
  readonly model:
    | {
        provider: string;
        id: string;
        contextWindow: number;
      }
    | undefined;

  /** Agent 是否空闲（不在流式输出中） */
  isIdle(): boolean;

  /** 当前 Agent 是否正在流式输出 */
  isStreaming(): boolean;

  /** 中止信号（仅在 Agent 运行时存在） */
  signal: AbortSignal | undefined;

  /** 中止当前 Agent 操作 */
  abort(): void;

  // ==================== 数据库访问（只读） ====================

  /**
   * 数据库查询接口
   * 所有查询自动限制在当前会话范围
   */
  readonly db: ExtensionDatabase;

  // ==================== 数据写入 ====================

  /**
   * 添加自定义 entry（用于状态持久化）
   * 写入 messages 表，type="custom"
   */
  appendEntry<T>(customType: string, data: T): Promise<string>;

  /**
   * 发送消息到会话
   * 触发 Agent 响应（如果 triggerTurn=true）
   */
  sendMessage(message: {
    role: "custom";
    customType: string;
    content: string;
    display?: boolean;
    details?: unknown;
    triggerTurn?: boolean;
  }): Promise<void>;

  /**
   * 发送用户消息
   * 等效于用户输入，触发 Agent 响应
   */
  sendUserMessage(content: string): Promise<void>;
  sendUserMessage(content: string, options?: { source?: string }): Promise<void>;

  getMemberAgentsByTag(tag: string): Promise<MemberAgentInfo[]>;

  pausing<T>(reason: string, work: Promise<T> | (() => Promise<T>)): Promise<T>;

  /**
   * 设置会话元数据
   * 合并到 sessions.meta JSON 字段
   */
  setSessionMeta(meta: Record<string, unknown>): Promise<void>;

  /**
   * 更新会话元数据（补丁）
   */
  patchSessionMeta(patch: Record<string, unknown>): Promise<Record<string, unknown>>;

  /**
   * 设置消息元数据
   * 合并到 messages.meta JSON 字段
   */
  setMessageMeta(messageId: string, meta: Record<string, unknown>): Promise<void>;

  /**
   * 更新消息元数据（补丁）
   */
  patchMessageMeta(
    messageId: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;

  /**
   * 设置 entry 标签
   */
  setLabel(entryId: string, label: string | undefined): Promise<void>;

  // ==================== 事件绑定 ====================

  /**
   * 绑定事件处理器
   * 返回解绑函数
   */
  on<T extends ExtensionEvent>(
    event: T["type"],
    handler: (event: T, ctx: EventHandlerContext) => void | Promise<void>,
  ): () => void;

  // ==================== 工具注册 ====================

  /**
   * 注册 LLM 可调用的工具
   * 工具对所有会话可见（全局注册）
   */
  registerTool<TParams extends TSchema, TResult>(
    definition: ToolDefinition<TParams, TResult>,
  ): void;

  /** 当前会话可用工具（内置 + 扩展，扩展同名覆盖内置） */
  getAllTools(): ToolInfo[];

  /** 按名称获取工具信息 */
  getToolByName(name: string): ToolInfo | undefined;

  // ==================== 会话控制 ====================

  /**
   * Fork 当前会话
   * 创建新会话，复制到指定 entry
   */
  fork(entryId: string, options?: { position?: "before" | "at" }): Promise<SessionInfo>;

  /**
   * 切换会话
   * 当前扩展上下文切换到新会话
   */
  switchSession(sessionId: number): Promise<void>;

  /**
   * 导航消息树
   * 改变当前 leaf_id，等效于回到历史节点
   */
  navigateTree(
    entryId: string,
    options?: {
      summarize?: boolean;
      customInstructions?: string;
    },
  ): Promise<void>;

  /**
   * 压缩上下文
   */
  compact(options?: { customInstructions?: string }): Promise<{
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
  }>;

  /**
   * 等待 Agent 空闲
   */
  waitForIdle(): Promise<void>;

  // ==================== 模型控制 ====================

  /**
   * 设置当前模型
   */
  setModel(provider: string, modelId: string): Promise<void>;

  /**
   * 设置思考级别
   */
  setThinkingLevel(level: "none" | "low" | "medium" | "high"): void;

  /**
   * 获取当前思考级别
   */
  getThinkingLevel(): "none" | "low" | "medium" | "high";

  // ==================== 工具方法 ====================

  /**
   * 执行系统命令
   */
  exec(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      timeout?: number;
      signal?: AbortSignal;
    },
  ): Promise<ExecResult>;

  /**
   * 日志记录
   */
  log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    meta?: Record<string, unknown>,
  ): void;

  /**
   * 发送 WebSocket 通知（广播给所有连接的客户端）
   */
  broadcast(event: BroadcastEvent): void;

  // ==================== 共享事件总线 ====================

  /**
   * 跨扩展通信的事件总线
   */
  events: EventBus;
}

// ============================================================================
// Core Object Facades
// ============================================================================

export interface ExtensionInstance {
  readonly name: string;
}

export interface SupervisorSessionFacade {
  readonly id: number;
  readonly cwd: string;
  readonly dir: string;
  readonly messages: SupervisorSessionMessagesFacade;
  readonly members: SupervisorSessionMembersFacade;
  readonly meta: SupervisorSessionMetaFacade;
  readonly runtime: SupervisorSessionRuntimeFacade;
  readonly isMain: boolean;
  readonly isChild: boolean;
  getDir(): Promise<string>;
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
  sendParentMsg(
    content: string,
    options?: { level?: number },
  ): Promise<void>;
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
    options?: {
      summarize?: boolean;
      customInstructions?: string;
    },
  ): Promise<void>;
  compact(options?: { customInstructions?: string }): Promise<{
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
  }>;
  readonly tools: SupervisorSessionToolSetFacade;
}

export interface SupervisorSessionToolSetFacade {
  setPolicy(policy: ToolPolicy): void;
  getPolicy(): ToolPolicy;
  beforeUse(handler: ToolGuardHandler, options?: { priority?: number }): () => void;
  afterUse(handler: ToolResultHandler, options?: { priority?: number }): () => void;
  enable(name: string): void;
  disable(name: string, reason?: string): void;
  setActive(names: string[]): Promise<void>;
  getActive(): string[] | null;
}

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

export interface SupervisorSessionMessagesFacade {
  list(options?: {
    limit?: number;
    offset?: number;
    role?: "user" | "assistant" | "tool" | "custom";
    parentId?: string | null;
    entryType?: "message" | "custom" | "fork" | "label";
  }): Promise<MessageEntry[]>;
  get(id: string): Promise<MessageEntry | undefined>;
  tree(leafId?: string): Promise<MessageNode[]>;
  currentBranch(): Promise<MessageEntry[]>;
  search(
    query: string,
    options?: {
      limit?: number;
      role?: "user" | "assistant" | "tool";
    },
  ): Promise<SearchResult[]>;
  getMeta(messageId: string): Promise<Record<string, unknown>>;
  setMeta(messageId: string, meta: Record<string, unknown>): Promise<void>;
  patchMeta(messageId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  setLabel(entryId: string, label: string | undefined): Promise<void>;
  stats(): Promise<{
    total: number;
    user: number;
    assistant: number;
    tool: number;
    custom: number;
  }>;
  contextUsage(): Promise<{
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  }>;
}

export interface SupervisorSessionMembersFacade {
  byTag(tag: string): Promise<MemberAgentInfo[]>;
  byRole(role: string): Promise<MemberAgentInfo[]>;
}

export interface SupervisorSessionMetaFacade {
  get(): Promise<Record<string, unknown>>;
  set(meta: Record<string, unknown>): Promise<void>;
  patch(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface SupervisorSessionRuntimeFacade {
  isIdle(): boolean;
  isStreaming(): boolean;
  readonly signal: AbortSignal | undefined;
  abort(): void;
  waitForIdle(): Promise<void>;
}

export interface SupervisorAgentFacade {
  readonly id: number;
  readonly name: string;
  readonly providerId: number;
  readonly modelId: string;
  readonly systemPrompt?: string;
  readonly model:
    | {
        provider: string;
        id: string;
        contextWindow: number;
      }
    | undefined;
  readonly tools: SupervisorToolRegistryFacade;
  setModel(provider: string, modelId: string): Promise<void>;
  setThinkingLevel(level: "none" | "low" | "medium" | "high"): void;
  getThinkingLevel(): "none" | "low" | "medium" | "high";
}

export interface SupervisorProjectFacade {
  readonly cwd: string;
  readonly dir: string;
  getDir(): Promise<string>;
}

export interface SupervisorRuntimeFacade {
  on<T extends ExtensionEvent>(
    event: T["type"],
    handler: (event: T, ctx: EventHandlerContext) => void | Promise<void>,
  ): () => void;
  exec(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      timeout?: number;
      signal?: AbortSignal;
    },
  ): Promise<ExecResult>;
  log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    meta?: Record<string, unknown>,
  ): void;
  readonly events: EventBus;
  readonly flow: TurnFlowFacade;
  readonly inject: TurnInjectorFacade;
}

export interface SupervisorToolRegistryFacade {
  register<TParams extends TSchema, TResult>(definition: ToolDefinition<TParams, TResult>): void;
  list(): ToolInfo[];
  get(name: string): ToolInfo | undefined;
}

export interface SupervisorUiFacade {
  broadcast(event: BroadcastEvent): void;
  requestApproval(request: ApprovalRequest): Promise<ApprovalResult>;
}

export interface SupervisorSystemFacade {
  readonly db: ExtensionDatabase;
}

// ============================================================================
// Database Access
// ============================================================================

export interface ExtensionDatabase {
  readonly sessions: ExtensionSessionsDatabase;
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

export interface ExtensionSessionsDatabase {
  get(sessionId: number): Promise<SessionInfo | undefined>;
  childrenOf(sessionId: number): Promise<SessionInfo[]>;
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
      result: unknown;
      isError: boolean;
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

export interface MessageEntry {
  id: string;
  entryId: string;
  type: "message" | "custom" | "fork" | "label";
  role?: "user" | "assistant" | "tool" | "custom";
  content?: string;
  customType?: string;
  parentId: string | null;
  meta: Record<string, unknown>;
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
// Extension Runtime State
// ============================================================================

export interface LoadedExtension {
  name: string;
  path: string;
  resolvedPath: string;
  source: "global" | "project" | "builtin";
  handlers: Map<string, Set<(...args: unknown[]) => unknown>>;
  tools: Map<string, ToolDefinition<TSchema, unknown>>;
  cleanup?: () => void;
}

export interface ExtensionRegistry {
  extensions: LoadedExtension[];
  tools: Map<string, ToolInfo>;
  getTool(name: string): ToolDefinition<TSchema, unknown> | undefined;
  getAllTools(): ToolInfo[];
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

// ============================================================================
// Runtime Options
// ============================================================================

export interface RuntimeOptions {
  sessionId: number;
  parentSessionId?: number | null;
  sessionMeta?: Record<string, unknown>;
  cwd: string;
  sessionDir: string;
  projectDir: string;
  agent: {
    id: number;
    name: string;
    providerId: number;
    modelId: string;
    systemPrompt?: string;
  };
  db: ExtensionDatabase;
  deps: {
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
    sendParentMsg: (
      content: string,
      options?: { level?: number },
    ) => Promise<void>;
    getSessionDir: () => Promise<string>;
    getProjectDir: () => Promise<string>;
    getMemberAgentsByTag: (tag: string) => Promise<MemberAgentInfo[]>;
    getMemberAgentsByRole: (role: string) => Promise<MemberAgentInfo[]>;
    spawnSession: (request: SpawnSessionRequest) => Promise<SpawnSessionResult>;
    waitForSessionIdle: (sessionId: number, options?: { timeoutMs?: number }) => Promise<void>;
    getSessionResultSummary: (
      sessionId: number,
      options?: { maxChars?: number },
    ) => Promise<SessionResultSummary>;
    finishSession: (sessionId: number) => Promise<void>;
    pausing: <T>(reason: string, work: Promise<T> | (() => Promise<T>)) => Promise<T>;
    setSessionMeta: (meta: Record<string, unknown>) => Promise<void>;
    patchSessionMeta: (patch: Record<string, unknown>) => Promise<Record<string, unknown>>;
    setMessageMeta: (messageId: string, meta: Record<string, unknown>) => Promise<void>;
    patchMessageMeta: (
      messageId: string,
      patch: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    setLabel: (entryId: string, label: string | undefined) => Promise<void>;
    isIdle: () => boolean;
    isStreaming: () => boolean;
    getSignal: () => AbortSignal | undefined;
    abort: () => void;
    waitForIdle: () => Promise<void>;
    fork: (entryId: string, options?: { position?: "before" | "at" }) => Promise<SessionInfo>;
    switchSession: (sessionId: number) => Promise<void>;
    navigateTree: (
      entryId: string,
      options?: { summarize?: boolean; customInstructions?: string },
    ) => Promise<void>;
    compact: (options?: { customInstructions?: string }) => Promise<{
      summary: string;
      firstKeptEntryId: string;
      tokensBefore: number;
    }>;
    setModel: (provider: string, modelId: string) => Promise<void>;
    setThinkingLevel: (level: "none" | "low" | "medium" | "high") => void;
    getThinkingLevel: () => "none" | "low" | "medium" | "high";
    getModel: () => { provider: string; id: string; contextWindow: number } | undefined;
    listSessionTools: () => ToolInfo[];
    emitExtensionEvent: (event: ExtensionEvent) => void | Promise<void>;
    exec: (
      command: string,
      args: string[],
      options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
    ) => Promise<ExecResult>;
    log: (
      level: "debug" | "info" | "warn" | "error",
      message: string,
      meta?: Record<string, unknown>,
    ) => void;
    broadcast: (event: BroadcastEvent) => void;
    eventBus: EventBus;
    continueTurn: (content: string, options?: { source?: string }) => Promise<void>;
    setActiveTools: (names: string[]) => Promise<void>;
    getContextUsage: () => Promise<{ tokens: number | null }>;
  };
}

// ============================================================================
// Database Adapter Options
// ============================================================================

export interface DbAdapterOptions {
  sessionId: number;
  query: <T>(sql: string, params: unknown[]) => Promise<T[]>;
  queryOne: <T>(sql: string, params: unknown[]) => Promise<T | undefined>;
  sqlite?: ExtensionSqliteDatabase;
}

// ============================================================================
// Replaced Session Context
// ============================================================================

export interface ReplacedSessionContext {
  sendMessage: (message: string, options?: unknown) => Promise<void>;
  sendUserMessage: (content: string, options?: unknown) => Promise<void>;
}
