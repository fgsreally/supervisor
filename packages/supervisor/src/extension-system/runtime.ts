/**
 * Supervisor Extension System - Runtime
 *
 * 扩展运行时，管理扩展的生命周期、事件处理、工具注册等
 */

import type { TSchema } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type {
  BroadcastEvent,
  EventBus,
  EventHandlerContext,
  ExecResult,
  ExtensionContext,
  ExtensionDatabase,
  ExtensionDefinition,
  ExtensionEvent,
  ExtensionRegistry,
  LoadedExtension,
  MessageEntry,
  MessageNode,
  SessionInfo,
  SpawnSessionRequest,
  SpawnSessionResult,
  ToolDefinition,
  ToolExecutionContext,
  ToolInfo,
} from "./types.js";
import shadowAgentExtension from "./extensions/shadow-agent/index.js";
import subagentExtension from "./extensions/subagent/index.js";
import { ExtensionSessionServices } from "./extension-session-services.js";

interface RuntimeOptions {
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
  // 外部依赖注入
  deps: {
    // 数据写入
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
    getMemberAgentsByTag: (tag: string) => Promise<import("./types.js").MemberAgentInfo[]>;
    getMemberAgentsByRole: (role: string) => Promise<import("./types.js").MemberAgentInfo[]>;
    spawnSession: (request: SpawnSessionRequest) => Promise<SpawnSessionResult>;
    waitForSessionIdle: (sessionId: number, options?: { timeoutMs?: number }) => Promise<void>;
    getSessionResultSummary: (
      sessionId: number,
      options?: { maxChars?: number },
    ) => Promise<import("./types.js").SessionResultSummary>;
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

    // Agent 控制
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

    // 模型控制
    setModel: (provider: string, modelId: string) => Promise<void>;
    setThinkingLevel: (level: "none" | "low" | "medium" | "high") => void;
    getThinkingLevel: () => "none" | "low" | "medium" | "high";
    getModel: () => { provider: string; id: string; contextWindow: number } | undefined;

    // 工具
    listSessionTools: () => ToolInfo[];
    emitExtensionEvent: (event: ExtensionEvent) => void | Promise<void>;

    // 执行
    exec: (
      command: string,
      args: string[],
      options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
    ) => Promise<ExecResult>;

    // 日志
    log: (
      level: "debug" | "info" | "warn" | "error",
      message: string,
      meta?: Record<string, unknown>,
    ) => void;

    // 广播
    broadcast: (event: BroadcastEvent) => void;

    // 事件总线
    eventBus: EventBus;

    continueTurn: (content: string, options?: { source?: string }) => Promise<void>;
    setActiveTools: (names: string[]) => Promise<void>;
    getContextUsage: () => Promise<{ tokens: number | null }>;
  };
}

/**
 * 创建扩展上下文
 */
type RegisterExtensionEvent = <T extends ExtensionEvent>(
  event: T["type"],
  handler: (event: T, ctx: EventHandlerContext) => void | Promise<void>,
) => () => void;

function createExtensionContext(
  extensionName: string,
  registry: ExtensionRegistry,
  options: RuntimeOptions,
  registerOn: RegisterExtensionEvent,
  services: ExtensionSessionServices,
): ExtensionContext {
  const { sessionId, parentSessionId, cwd, sessionDir, projectDir, agent, db, deps } = options;
  const isChildSession = parentSessionId !== null && parentSessionId !== undefined;

  // 本地工具注册（仅对当前扩展可见）
  const localTools = new Map<string, ToolDefinition<TSchema, unknown>>();
  const registerTool = <TParams extends TSchema, TResult>(
    definition: ToolDefinition<TParams, TResult>,
  ) => {
    localTools.set(definition.name, definition as ToolDefinition<TSchema, unknown>);
    registry.tools.set(definition.name, {
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      source: "extension",
      extensionName,
      definition: definition as ToolDefinition<TSchema, unknown>,
    });
  };
  const toolRegistry = {
    register: registerTool,
    list: () => deps.listSessionTools(),
    get: (name: string) => deps.listSessionTools().find((tool) => tool.name === name),
  };
  const sessionRuntime = {
    isIdle: deps.isIdle,
    isStreaming: deps.isStreaming,
    get signal() {
      return deps.getSignal();
    },
    abort: deps.abort,
    waitForIdle: deps.waitForIdle,
  };
  const session = {
    id: sessionId,
    cwd,
    dir: sessionDir,
    messages: {
      list: db.getMessages,
      get: db.getMessageById,
      tree: db.getMessageTree,
      currentBranch: db.getCurrentBranch,
      search: db.searchMessages,
      getMeta: db.getMessageMeta,
      setMeta: deps.setMessageMeta,
      patchMeta: deps.patchMessageMeta,
      setLabel: deps.setLabel,
      stats: db.getMessageStats,
      contextUsage: db.getContextUsage,
    },
    members: {
      byTag: deps.getMemberAgentsByTag,
      byRole: deps.getMemberAgentsByRole,
    },
    meta: {
      get: db.getSessionMeta,
      set: deps.setSessionMeta,
      patch: deps.patchSessionMeta,
    },
    runtime: sessionRuntime,
    isMain: !isChildSession,
    isChild: isChildSession,
    getDir: deps.getSessionDir,
    getParent: db.getParentSession,
    children: db.getChildSessions,
    appendEntry: deps.appendEntry,
    sendMessage: deps.sendMessage,
    sendUserMessage: deps.sendUserMessage,
    sendParentMsg: deps.sendParentMsg,
    pausing: deps.pausing,
    spawn: deps.spawnSession,
    waitForResult: async (
      targetSessionId: number,
      options?: { timeoutMs?: number; maxChars?: number },
    ) => {
      await deps.waitForSessionIdle(targetSessionId, { timeoutMs: options?.timeoutMs });
      return deps.getSessionResultSummary(targetSessionId, { maxChars: options?.maxChars });
    },
    finish: (targetSessionId?: number) => deps.finishSession(targetSessionId ?? sessionId),
    fork: deps.fork,
    switchTo: deps.switchSession,
    navigateTree: deps.navigateTree,
    compact: deps.compact,
    tools: {
      setPolicy: (policy) => services.tools.setPolicy(policy),
      getPolicy: () => services.tools.getPolicy(),
      beforeUse: (handler, opts) => services.tools.beforeUse(handler, opts),
      afterUse: (handler, opts) => services.tools.afterUse(handler, opts),
      enable: (name) => services.tools.enable(name),
      disable: (name, reason) => services.tools.disable(name, reason),
      setActive: async (names) => {
        services.tools.setActive(names);
        await deps.setActiveTools(names);
      },
      getActive: () => services.tools.getActiveToolNames(),
    },
  };
  const project = {
    cwd,
    dir: projectDir,
    getDir: deps.getProjectDir,
  };
  const agentFacade = {
    ...agent,
    get model() {
      return deps.getModel();
    },
    tools: toolRegistry,
    setModel: deps.setModel,
    setThinkingLevel: deps.setThinkingLevel,
    getThinkingLevel: deps.getThinkingLevel,
  };
  const injectFacade = {
    schedule: (input) => services.inject.schedule(input),
    clear: (variant) => services.inject.clear(variant),
    reattach: (variant, content, opts) => services.inject.reattach(variant, content, opts),
  };
  const flowFacade = {
    continue: (opts) => services.flow.continue(opts),
    pause: (reason) => services.flow.pause(reason),
    resume: () => services.flow.resume(),
    acquireLock: (key, opts) => services.flow.acquireLock(key, opts),
    usage: (opts) => services.flow.usage(opts),
    startScope: (scope) => services.flow.startScope(scope),
    endScope: (scope) => services.flow.endScope(scope),
  };
  const runtime = {
    on: registerOn,
    exec: deps.exec,
    log: deps.log,
    events: deps.eventBus,
    flow: flowFacade,
    inject: injectFacade,
  };
  const ui = {
    broadcast: deps.broadcast,
    requestApproval: (request) => services.uiApproval.requestApproval(request),
  };
  const system = {
    db,
  };

  const ctx: ExtensionContext = {
    extension: {
      name: extensionName,
    },
    session,
    agent: agentFacade,
    project,
    runtime,
    tools: toolRegistry,
    ui,
    system,
    inject: injectFacade,

    // 会话信息
    sessionId,
    cwd,
    sessionDir,
    projectDir,
    getSessionDir: deps.getSessionDir,
    getProjectDir: deps.getProjectDir,
    get model() {
      return deps.getModel();
    },
    isIdle: deps.isIdle,
    isStreaming: deps.isStreaming,
    get signal() {
      return deps.getSignal();
    },
    abort: deps.abort,

    // 数据库访问
    db,

    // 数据写入
    appendEntry: deps.appendEntry,
    sendMessage: deps.sendMessage,
    sendUserMessage: deps.sendUserMessage,
    getMemberAgentsByTag: deps.getMemberAgentsByTag,
    pausing: deps.pausing,
    setSessionMeta: deps.setSessionMeta,
    patchSessionMeta: deps.patchSessionMeta,
    setMessageMeta: deps.setMessageMeta,
    patchMessageMeta: deps.patchMessageMeta,
    setLabel: deps.setLabel,

    // 事件绑定（与 ExtensionRuntime.emit 同一套处理器）
    on: registerOn,

    // 工具注册
    registerTool,

    getAllTools: () => deps.listSessionTools(),
    getToolByName: (name: string) => deps.listSessionTools().find((tool) => tool.name === name),

    // 会话控制
    fork: deps.fork,
    switchSession: deps.switchSession,
    navigateTree: deps.navigateTree,
    compact: deps.compact,
    waitForIdle: deps.waitForIdle,

    // 模型控制
    setModel: deps.setModel,
    setThinkingLevel: deps.setThinkingLevel,
    getThinkingLevel: deps.getThinkingLevel,

    // 工具方法
    exec: deps.exec,
    log: deps.log,
    broadcast: deps.broadcast,

    // 事件总线
    events: deps.eventBus,
  };

  return ctx;
}

/**
 * 扩展运行时
 */
export class ExtensionRuntime {
  private handlers = new Map<string, Set<(event: unknown, ctx: EventHandlerContext) => unknown>>();
  private extensions: LoadedExtension[] = [];
  private registry: ExtensionRegistry;
  private options: RuntimeOptions;
  readonly services: ExtensionSessionServices;
  private turnId = 0;

  constructor(options: RuntimeOptions) {
    this.options = options;
    this.services = new ExtensionSessionServices({
      sessionId: options.sessionId,
      deps: {
        continueTurn: options.deps.continueTurn,
        getContextUsage: options.deps.getContextUsage,
        isIdle: options.deps.isIdle,
        isStreaming: options.deps.isStreaming,
        pausing: options.deps.pausing,
        broadcast: options.deps.broadcast,
      },
    });
    this.registry = {
      extensions: this.extensions,
      tools: new Map(),
      getTool: (name: string) => this.registry.tools.get(name)?.definition,
      getAllTools: () => Array.from(this.registry.tools.values()),
    };
    this.registerBuiltinExtensions();
  }

  private registerBuiltinExtensions(): void {
    const loadBuiltin = (definition: ExtensionDefinition, path: string): void => {
      const loaded: LoadedExtension = {
        name: definition.name,
        path,
        resolvedPath: path,
        source: "builtin",
        handlers: new Map(),
        tools: new Map(),
      };
      const ctx = createExtensionContext(
        definition.name,
        this.registry,
        this.options,
        this.on.bind(this),
        this.services,
      );
      const cleanup = definition.setup(ctx);
      if (typeof cleanup === "function") {
        loaded.cleanup = cleanup;
      }
      this.extensions.push(loaded);
    };

    if (typeof this.options.sessionMeta?.shadowOf === "number") {
      loadBuiltin(shadowAgentExtension, "builtin:shadow-child");
    }
    if (this.options.parentSessionId === null) {
      loadBuiltin(subagentExtension, "builtin:subagent");
    }
  }

  /**
   * 绑定事件处理器
   */
  on<T extends ExtensionEvent>(
    event: T["type"],
    handler: (event: T, ctx: EventHandlerContext) => void | Promise<void>,
  ): () => void {
    const handlers = this.handlers.get(event) ?? new Set();
    handlers.add(handler as (event: unknown, ctx: EventHandlerContext) => unknown);
    this.handlers.set(event, handlers);

    return () => {
      handlers.delete(handler as (event: unknown, ctx: EventHandlerContext) => unknown);
    };
  }

  /**
   * 触发事件
   */
  async emit<T extends ExtensionEvent>(event: T): Promise<void> {
    const handlers = this.handlers.get(event.type);
    if (!handlers || handlers.size === 0) return;

    const eventCtx: EventHandlerContext = {
      sessionId: this.options.sessionId,
      timestamp: Date.now(),
    };

    for (const handler of handlers) {
      try {
        await handler(event, eventCtx);
      } catch (err) {
        this.options.deps.log("error", `Event handler failed for ${event.type}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * 加载扩展
   */
  async loadExtension(definition: ExtensionDefinition, path: string): Promise<void> {
    const loaded: LoadedExtension = {
      name: definition.name,
      path,
      resolvedPath: path,
      source: path.includes("node_modules")
        ? "builtin"
        : path.startsWith(process.cwd())
          ? "project"
          : "global",
      handlers: new Map(),
      tools: new Map(),
    };

    // 创建扩展上下文
    const ctx = createExtensionContext(
      definition.name,
      this.registry,
      this.options,
      this.on.bind(this),
      this.services,
    );

    // 调用 setup
    try {
      const cleanup = await definition.setup(ctx);
      if (cleanup) {
        loaded.cleanup = cleanup;
      }
    } catch (err) {
      this.options.deps.log("error", `Extension ${definition.name} setup failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    this.extensions.push(loaded);
    this.options.deps.log("info", `Extension ${definition.name} loaded`);
    await this.options.deps.emitExtensionEvent({
      type: "extension.reload",
      reason: "auto",
    });
  }

  /**
   * 卸载所有扩展
   */
  async unloadAll(): Promise<void> {
    for (const ext of this.extensions) {
      if (ext.cleanup) {
        try {
          await ext.cleanup();
        } catch (err) {
          this.options.deps.log("error", `Extension ${ext.name} cleanup failed`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    this.extensions = [];
    this.handlers.clear();
    this.registry.tools.clear();
  }

  /**
   * 获取工具定义
   */
  getTool(name: string): ToolDefinition<TSchema, unknown> | undefined {
    return this.registry.getTool(name);
  }

  /**
   * 获取所有工具（仅扩展注册表）
   */
  getAllTools(): ToolInfo[] {
    return this.registry.getAllTools();
  }

  registerPackagedTool(
    packageId: string,
    tool: AgentTool,
    pausing?: { message: string },
  ): void {
    const definition: ToolDefinition<TSchema, unknown> = {
      name: tool.name,
      description: tool.description ?? tool.name,
      parameters: tool.parameters as TSchema,
      execute: async (params, context) => {
        const run = () => tool.execute(context.toolCallId, params, context.signal);
        const result = pausing
          ? await this.options.deps.pausing(pausing.message, run)
          : await run();
        return result as {
          content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>;
          details?: unknown;
          isError?: boolean;
        };
      },
    };

    this.registry.tools.set(tool.name, {
      name: tool.name,
      description: tool.description ?? tool.name,
      parameters: tool.parameters as TSchema,
      source: "builtin",
      extensionName: packageId,
      definition,
    });
  }

  logPackagedToolWarning(toolId: string, error: unknown): void {
    this.options.deps.log("warn", `packaged tool ${toolId} skipped`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  getToolExecutionSession(): { id: string; cwd: string } {
    return { id: String(this.options.sessionId), cwd: this.options.cwd };
  }

  /**
   * 执行工具
   */
  async executeTool(
    name: string,
    params: unknown,
    context: ToolExecutionContext,
  ): Promise<{
    content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>;
    details?: unknown;
    isError?: boolean;
  }> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }

    return await tool.execute(params, context);
  }

  async checkToolBeforeCall(
    toolCallId: string,
    name: string,
    args: unknown,
  ): Promise<{ block: boolean; reason?: string }> {
    const event = {
      type: "tool.before_call" as const,
      toolCallId,
      name,
      args,
      entryId: "",
      block: undefined as { reason: string } | undefined,
    };

    const handlers = this.handlers.get("tool.before_call");
    if (handlers) {
      const eventCtx: EventHandlerContext = {
        sessionId: this.options.sessionId,
        timestamp: Date.now(),
      };
      for (const handler of handlers) {
        try {
          await handler(event, eventCtx);
        } catch (err) {
          this.options.deps.log("error", "tool.before_call handler failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (event.block) {
      return { block: true, reason: event.block.reason };
    }

    const decision = await this.services.tools.checkBeforeCall({ toolCallId, name, args });
    if (!decision.allow) {
      return { block: true, reason: decision.reason };
    }
    return { block: false };
  }

  async runToolAfterHandlers(
    toolCallId: string,
    name: string,
    args: unknown,
    result: unknown,
    setResult: (next: unknown) => void,
  ): Promise<void> {
    await this.services.tools.runAfterCall({ toolCallId, name, args, result }, setResult);
  }

  applyTurnInjections<T extends { role: string }>(messages: T[]): T[] {
    return this.services.inject.applyToMessages(messages as never) as T[];
  }

  onTurnStarted(): number {
    this.turnId += 1;
    this.services.inject.onTurnStart();
    return this.turnId;
  }

  onTurnEnded(usage?: { input?: number; output?: number; totalTokens?: number }): number {
    this.services.flow.onTurnEnded(usage);
    this.services.inject.onAssistantTurnEnd();
    return this.turnId;
  }

  onStepEnded(usage?: { input?: number; output?: number; totalTokens?: number }): void {
    this.services.flow.onStepEnded(usage);
  }
}

// ============================================================================
// Database Implementation
// ============================================================================

interface DbAdapterOptions {
  sessionId: number;
  query: <T>(sql: string, params: unknown[]) => Promise<T[]>;
  // 底层数据库访问
  query: <T>(sql: string, params: unknown[]) => Promise<T[]>;
  queryOne: <T>(sql: string, params: unknown[]) => Promise<T | undefined>;
  sqlite?: ExtensionDatabase["sqlite"];
}

/**
 * 创建数据库访问对象
 */
export function createExtensionDatabase(options: DbAdapterOptions): ExtensionDatabase {
  const { sessionId, query, queryOne, sqlite } = options;

  return {
    sessions: {
      get: async (targetSessionId: number) => {
        const row = await queryOne<{
          id: number;
          cwd: string;
          meta: string;
          created_at: number;
          last_active_at: number;
          message_count: number;
        }>(
          `SELECT s.id, s.cwd, s.meta, s.created_at, s.last_active_at,
            (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
           FROM sessions s
           WHERE s.id = ?`,
          [targetSessionId],
        );
        if (!row) return undefined;
        return {
          id: row.id,
          name: JSON.parse(row.meta || "{}").name as string | undefined,
          cwd: row.cwd,
          messageCount: row.message_count,
          createdAt: row.created_at,
          lastActiveAt: row.last_active_at ?? row.created_at,
        };
      },
      childrenOf: async (targetSessionId: number) => {
        const rows = await query<{
          id: number;
          cwd: string;
          meta: string;
          created_at: number;
          last_active_at: number;
          message_count: number;
        }>(
          `SELECT s.id, s.cwd, s.meta, s.created_at, s.last_active_at,
            (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
           FROM sessions s
           WHERE s.parent_id = ?
           ORDER BY s.created_at ASC`,
          [targetSessionId],
        );
        return rows.map((row) => ({
          id: row.id,
          name: JSON.parse(row.meta || "{}").name as string | undefined,
          cwd: row.cwd,
          messageCount: row.message_count,
          createdAt: row.created_at,
          lastActiveAt: row.last_active_at ?? row.created_at,
        }));
      },
    },
    sqlite,

    // 消息查询
    getMessages: async (opts = {}) => {
      const { limit = 100, offset = 0, role, parentId, entryType } = opts;

      let sql = `
        SELECT
          m.entry_id as entryId,
          m.entry_id as id,
          m.type,
          m.message_role as role,
          m.payload as content,
          m.parent_entry_id as parentId,
          m.meta,
          m.created_at as createdAt
        FROM messages m
        WHERE m.session_id = ?
      `;
      const params: unknown[] = [sessionId];

      if (role) {
        sql += " AND m.message_role = ?";
        params.push(role);
      }

      if (parentId !== undefined) {
        sql += parentId === null ? " AND m.parent_entry_id IS NULL" : " AND m.parent_entry_id = ?";
        if (parentId !== null) params.push(parentId);
      }

      if (entryType) {
        sql += " AND m.type = ?";
        params.push(entryType);
      }

      sql += " ORDER BY m.created_at DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const rows = await query<{
        id: string;
        entryId: string;
        type: string;
        role?: string;
        content?: string;
        customType?: string;
        parentId: string | null;
        meta: string;
        createdAt: number;
      }>(sql, params);

      return rows.map((row) => ({
        id: row.id,
        entryId: row.entryId,
        type: row.type as "message" | "custom" | "fork" | "label",
        role: row.role as "user" | "assistant" | "tool" | "custom" | undefined,
        content: row.content,
        customType: row.customType,
        parentId: row.parentId,
        meta: JSON.parse(row.meta || "{}"),
        createdAt: row.createdAt,
      }));
    },

    getMessageById: async (id: string) => {
      const row = await queryOne<{
        id: string;
        entryId: string;
        type: string;
        role?: string;
        content?: string;
        customType?: string;
        parentId: string | null;
        meta: string;
        createdAt: number;
      }>(
        `SELECT
          m.entry_id as entryId, m.entry_id as id, m.type, m.message_role as role,
          m.payload as content, m.parent_entry_id as parentId, m.meta, m.created_at as createdAt
        FROM messages m
        WHERE m.session_id = ? AND m.entry_id = ?`,
        [sessionId, id],
      );

      if (!row) return undefined;

      return {
        id: row.id,
        entryId: row.entryId,
        type: row.type as "message" | "custom" | "fork" | "label",
        role: row.role as "user" | "assistant" | "tool" | "custom" | undefined,
        content: row.content,
        customType: row.customType,
        parentId: row.parentId,
        meta: JSON.parse(row.meta || "{}"),
        createdAt: row.createdAt,
      };
    },

    getMessageTree: async (_leafId?: string) => {
      // 简化的树形结构查询
      const messages = await query<{
        id: string;
        entryId: string;
        type: string;
        role?: string;
        content?: string;
        parentId: string | null;
        meta: string;
        createdAt: number;
      }>(
        `SELECT
          m.entry_id as entryId, m.entry_id as id, m.type, m.message_role as role,
          m.payload as content, m.parent_entry_id as parentId, m.meta, m.created_at as createdAt
        FROM messages m
        WHERE m.session_id = ?
        ORDER BY m.created_at ASC`,
        [sessionId],
      );

      const nodeMap = new Map<string, MessageNode>();
      const rootNodes: MessageNode[] = [];

      for (const row of messages) {
        const node: MessageNode = {
          id: row.id,
          entryId: row.entryId,
          type: row.type as "message" | "custom" | "fork" | "label",
          role: row.role as "user" | "assistant" | "tool" | "custom" | undefined,
          content: row.content,
          parentId: row.parentId,
          meta: JSON.parse(row.meta || "{}"),
          createdAt: row.createdAt,
          children: [],
        };
        nodeMap.set(row.id, node);
      }

      for (const node of nodeMap.values()) {
        if (node.parentId && nodeMap.has(node.parentId)) {
          nodeMap.get(node.parentId)!.children.push(node);
        } else {
          rootNodes.push(node);
        }
      }

      return rootNodes;
    },

    getCurrentBranch: async () => {
      // 获取当前分支（从根到当前叶子）
      const session = await queryOne<{ leaf_id: string | null }>(
        "SELECT leaf_id FROM sessions WHERE id = ?",
        [sessionId],
      );

      if (!session?.leaf_id) {
        return [];
      }

      // 递归获取父节点链
      const branch: MessageEntry[] = [];
      let currentId: string | null = session.leaf_id;

      while (currentId) {
        interface MessageRow {
          id: string;
          entryId: string;
          type: string;
          role?: string;
          content?: string;
          parentId: string | null;
          meta: string;
          createdAt: number;
        }
        const message: MessageRow | undefined = await queryOne<MessageRow>(
          `SELECT
            m.entry_id as entryId, m.entry_id as id, m.type, m.message_role as role,
            m.payload as content, m.parent_entry_id as parentId, m.meta, m.created_at as createdAt
          FROM messages m
          WHERE m.session_id = ? AND m.entry_id = ?`,
          [sessionId, currentId],
        );

        if (!message) break;

        branch.unshift({
          id: message.id,
          entryId: message.entryId,
          type: message.type as "message" | "custom" | "fork" | "label",
          role: message.role as "user" | "assistant" | "tool" | "custom" | undefined,
          content: message.content,
          parentId: message.parentId,
          meta: JSON.parse(message.meta || "{}"),
          createdAt: message.createdAt,
        });

        currentId = message.parentId;
      }

      return branch;
    },

    searchMessages: async (
      searchQuery: string,
      opts: { limit?: number; role?: "user" | "assistant" | "tool" } = {},
    ) => {
      const { limit = 20, role } = opts;

      let sql = `
        SELECT
          m.entry_id as messageId,
          m.entry_id as entryId,
          m.message_role as role,
          m.payload as content,
          m.search_text as highlight,
          1.0 as score
        FROM messages m
        WHERE m.session_id = ? AND m.search_text LIKE ?
      `;
      const params: unknown[] = [sessionId, `%${searchQuery}%`];

      if (role) {
        sql += " AND m.message_role = ?";
        params.push(role);
      }

      sql += " ORDER BY m.created_at DESC LIMIT ?";
      params.push(limit);

      const rows = await query<{
        messageId: string;
        entryId: string;
        role: string;
        content: string;
        highlight: string;
        score: number;
      }>(sql, params);

      return rows.map((row) => ({
        messageId: row.messageId,
        entryId: row.entryId,
        role: row.role,
        content: row.content,
        highlight: row.highlight || row.content,
        score: row.score,
      }));
    },

    // 自定义 Entry 查询
    getCustomEntries: async <T>(
      customType: string,
      opts: { limit?: number; offset?: number } = {},
    ) => {
      const { limit = 100, offset = 0 } = opts;

      const rows = await query<{
        id: string;
        payload: string;
        created_at: number;
      }>(
        `SELECT m.entry_id as id, m.payload, m.created_at
         FROM messages m
         WHERE m.session_id = ? AND m.type = 'custom' AND m.custom_type = ?
         ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
        [sessionId, customType, limit, offset],
      );

      return rows.map((row) => ({
        id: row.id,
        data: JSON.parse(row.payload) as T,
        createdAt: row.created_at,
        entryId: row.id,
      }));
    },

    getLatestCustomEntry: async <T>(customType: string) => {
      const row = await queryOne<{
        id: string;
        payload: string;
        created_at: number;
      }>(
        `SELECT m.entry_id as id, m.payload, m.created_at
         FROM messages m
         WHERE m.session_id = ? AND m.type = 'custom' AND m.custom_type = ?
         ORDER BY m.created_at DESC LIMIT 1`,
        [sessionId, customType],
      );

      if (!row) return undefined;

      return {
        id: row.id,
        data: JSON.parse(row.payload) as T,
        createdAt: row.created_at,
        entryId: row.id,
      };
    },

    // 会话元数据
    getSessionMeta: async () => {
      const row = await queryOne<{ meta: string }>("SELECT meta FROM sessions WHERE id = ?", [
        sessionId,
      ]);
      return row ? JSON.parse(row.meta || "{}") : {};
    },

    getMessageMeta: async (messageId: string) => {
      const row = await queryOne<{ meta: string }>(
        "SELECT meta FROM messages WHERE session_id = ? AND entry_id = ?",
        [sessionId, messageId],
      );
      return row ? JSON.parse(row.meta || "{}") : {};
    },

    // 会话树结构
    getChildSessions: async () => {
      const rows = await query<{
        id: string;
        cwd: string;
        meta: string;
        created_at: number;
        last_active_at: number;
        message_count: number;
      }>(
        `SELECT s.id, s.cwd, s.meta, s.created_at, s.last_active_at,
          (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
         FROM sessions s
         WHERE s.parent_id = ?
         ORDER BY s.created_at ASC`,
        [sessionId],
      );

      return rows.map((row) => ({
        id: row.id,
        name: JSON.parse(row.meta || "{}").name as string | undefined,
        cwd: row.cwd,
        messageCount: row.message_count,
        createdAt: row.created_at,
        lastActiveAt: row.last_active_at,
      }));
    },

    getParentSession: async () => {
      const row = await queryOne<{
        parent_id: string;
        cwd: string;
        meta: string;
        created_at: number;
        last_active_at: number;
        message_count: number;
      }>(
        `SELECT s.parent_id, s.cwd, s.meta, s.created_at, s.last_active_at,
          (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.parent_id) as message_count
         FROM sessions s
         WHERE s.id = ?`,
        [sessionId],
      );

      if (!row?.parent_id) return undefined;

      return {
        id: row.parent_id,
        name: JSON.parse(row.meta || "{}").name as string | undefined,
        cwd: row.cwd,
        messageCount: row.message_count,
        createdAt: row.created_at,
        lastActiveAt: row.last_active_at,
      };
    },

    // 统计信息
    getMessageStats: async () => {
      const rows = await query<{
        message_role: string;
        count: number;
      }>(
        `SELECT message_role, COUNT(*) as count
         FROM messages
         WHERE session_id = ?
         GROUP BY message_role`,
        [sessionId],
      );

      const stats = { total: 0, user: 0, assistant: 0, tool: 0, custom: 0 };
      for (const row of rows) {
        const count = row.count;
        stats.total += count;
        if (row.message_role === "user") stats.user += count;
        else if (row.message_role === "assistant") stats.assistant += count;
        else if (row.message_role === "tool") stats.tool += count;
        else if (row.message_role === "custom") stats.custom += count;
      }

      return stats;
    },

    getContextUsage: async () => {
      // 获取最新的 assistant 消息中的 usage
      const row = await queryOne<{
        usage: string;
      }>(
        `SELECT m.payload as usage
         FROM messages m
         WHERE m.session_id = ? AND m.message_role = 'assistant'
         ORDER BY m.created_at DESC LIMIT 1`,
        [sessionId],
      );

      // 获取模型配置
      const _session = await queryOne<{
        model_id: string;
      }>(
        `SELECT a.model_id
         FROM sessions s
         JOIN agents a ON s.agent_id = a.id
         WHERE s.id = ?`,
        [sessionId],
      );

      // 默认 context window
      const contextWindow = 128000;

      if (!row?.usage) {
        return { tokens: null, contextWindow, percent: null };
      }

      try {
        const usage = JSON.parse(row.usage);
        const tokens = usage.totalTokens || usage.output || 0;
        return {
          tokens,
          contextWindow,
          percent: (tokens / contextWindow) * 100,
        };
      } catch {
        return { tokens: null, contextWindow, percent: null };
      }
    },
  };
}
