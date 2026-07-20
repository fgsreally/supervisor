import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { SessionRuntime } from "../../core/session-runtime.js";
import type { SessionManager } from "../../core/session-manager.js";
import type { SupervisorDb } from "../../db/db.js";
import { ensureProjectDir, ensureSessionDir } from "../../core/session-files.js";
import { DEFAULT_SESSION_INPUT_LEVEL } from "../../core/session-input-queue.js";
import { execCommand } from "../../utils/exec.js";
import type {
  EventBus,
  ExecResult,
  ExtensionDatabase,
  ExtensionEvent,
  MemberAgentInfo,
  MessageEntry,
  MessageNode,
  SessionResultSummary,
  SessionInfo,
  SpawnSessionRequest,
  SpawnSessionResult,
  ToolInfo,
} from "../index.js";
import type { WorkflowStatePatch } from "../../core/session-workflow.js";

/**
 * 为 Extension 创建事件总线。
 * 使用 Node.js EventEmitter 实现同一 Agent 内的扩展间通信。
 */
export function createEventBus(): EventBus {
  const emitter = new EventEmitter();
  return {
    emit(event: string, data: unknown): void {
      emitter.emit(event, data);
    },
    on(event: string, handler: (data: unknown) => void): () => void {
      emitter.on(event, handler);
      return () => {
        emitter.off(event, handler);
      };
    },
    off(event: string, handler: (data: unknown) => void): void {
      emitter.off(event, handler);
    },
  };
}

/**
 * 构建 Extension 内部运行实现需要的依赖。
 * 将所有能力连接到 SessionRuntime、SessionManager 和 SupervisorDb。
 */
export function buildExtensionDeps(deps: {
  runtime: SessionRuntime;
  manager: SessionManager;
  db: SupervisorDb;
  sessionId: number;
  projectId: number;
  listSessionTools: () => ToolInfo[];
  emitExtensionEvent: (event: ExtensionEvent) => void | Promise<void>;
}): RuntimeDeps {
  const { runtime, manager, db, sessionId, projectId, listSessionTools, emitExtensionEvent } = deps;
  const eventBus = createEventBus();

  return {
    // ── Data writing ─────────────────────────────────────────────
    appendEntry: async <T>(customType: string, data: T) => {
      const entryId = randomUUID();
      db.db
        .prepare(
          `INSERT INTO messages (entry_id, session_id, parent_entry_id, type, payload, meta, is_old, message_role, search_text, created_at)
					 VALUES (?, ?, ?, 'custom', ?, '{}', 0, 'custom', ?, ?)`,
        )
        .run(entryId, sessionId, null, JSON.stringify(data), customType, Date.now());
      db.db
        .prepare("UPDATE sessions SET leaf_id = ?, last_active_at = ? WHERE id = ?")
        .run(entryId, Date.now(), sessionId);
      void emitExtensionEvent({
        type: "message.custom",
        customType,
        messageId: entryId,
        entryId,
        content: JSON.stringify(data),
        display: false,
        details: data,
        timestamp: Date.now(),
      });
      return entryId;
    },

    sendMessage: async (message) => {
      const entryId = randomUUID();
      const payload = JSON.stringify({
        id: entryId,
        type: "message",
        role: "custom",
        customType: message.customType,
        content: message.content,
        details: message.details,
        display: message.display,
        parentId: null,
      });
      db.db
        .prepare(
          `INSERT INTO messages (entry_id, session_id, parent_entry_id, type, payload, meta, is_old, message_role, search_text, created_at)
					 VALUES (?, ?, NULL, 'message', ?, '{}', 0, 'custom', ?, ?)`,
        )
        .run(entryId, sessionId, payload, message.content, Date.now());
      db.db
        .prepare("UPDATE sessions SET leaf_id = ?, last_active_at = ? WHERE id = ?")
        .run(entryId, Date.now(), sessionId);

      void emitExtensionEvent({
        type: "message.custom",
        customType: message.customType,
        messageId: entryId,
        entryId,
        content: message.content,
        display: message.display ?? true,
        details: message.details,
        timestamp: Date.now(),
      });

      if (message.triggerTurn) {
        void runtime
          .prompt(`[Extension:${message.customType}]\n${message.content}`)
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[ext] sendMessage prompt error:`, msg);
          });
      }
    },

    sendUserMessage: async (
      content: string,
      options?: { source?: string; level?: number; origin?: string },
    ) => {
      await manager.submitSessionInput(sessionId, {
        message: content,
        level: options?.level ?? DEFAULT_SESSION_INPUT_LEVEL,
        source: options?.source,
        origin: options?.origin,
      });
    },

    sendToChild: async (
      targetSessionId: number,
      content: string,
      options?: { source?: string },
    ) => {
      const child = manager.get(targetSessionId);
      if (!child || child.parentId !== sessionId || child.branchType !== "subagent") {
        throw new Error(`Session ${targetSessionId} is not a direct subagent of ${sessionId}`);
      }
      await manager.submitSessionInput(targetSessionId, {
        message: content,
        level: DEFAULT_SESSION_INPUT_LEVEL,
        source: options?.source ?? `extension:parent:${sessionId}`,
      });
    },

    continueTurn: async (content: string, options?: { source?: string }) => {
      const state = await runtime.getState();
      if (state.isStreaming) {
        manager.followUp(sessionId, content, options?.source);
        return;
      }
      await manager.prompt(sessionId, content, undefined, options?.source);
    },

    setActiveTools: async (names: string[]) => {
      await runtime.setActiveTools(names);
    },

    getContextUsage: async () => {
      const row = db.db
        .prepare(
          `SELECT m.payload as usage
           FROM messages m
           WHERE m.session_id = ? AND m.message_role = 'assistant'
           ORDER BY m.created_at DESC LIMIT 1`,
        )
        .get(sessionId) as { usage?: string } | undefined;
      if (!row?.usage) return { tokens: null };
      try {
        const usage = JSON.parse(row.usage) as { totalTokens?: number; output?: number };
        return { tokens: usage.totalTokens ?? usage.output ?? null };
      } catch {
        return { tokens: null };
      }
    },

    getSessionDir: async () => ensureSessionDir(projectId, sessionId),
    getProjectDir: async () => ensureProjectDir(projectId),

    getMemberAgentsByTag: async (tag: string): Promise<MemberAgentInfo[]> => {
      return manager.listMemberAgentsByTag(sessionId, tag).map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        providerId: agent.providerId,
        modelId: agent.modelId,
        toolsPreset: agent.toolsPreset,
        role: agent.member.role,
        tags: agent.member.tags,
      }));
    },

    getMemberAgentsByRole: async (role: string): Promise<MemberAgentInfo[]> => {
      const members = db.listMembers(sessionId).filter((member) => member.role === role);
      return members
        .map((member) => {
          const agent = manager.getAgent(member.agentId);
          if (!agent) return undefined;
          return {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            providerId: agent.providerId,
            modelId: agent.modelId,
            toolsPreset: agent.toolsPreset,
            role: member.role,
            tags: member.tags,
          };
        })
        .filter((agent): agent is MemberAgentInfo => agent !== undefined);
    },

    spawnSession: async (request: SpawnSessionRequest): Promise<SpawnSessionResult> => {
      const current = manager.get(sessionId);
      if (!current) {
        throw new Error(`Current session ${sessionId} not found`);
      }
      const agent = request.agentId ? manager.getAgent(request.agentId) : undefined;
      if (request.agentId && !agent) {
        throw new Error(`Agent ${request.agentId} not found`);
      }
      const spawned = await manager.spawn({
        parentId: request.parentId ?? undefined,
        projectId,
        cwd: request.cwd ?? current.cwd,
        agentId: request.agentId ?? null,
        instructions: request.instructions,
        systemPrompt: request.systemPrompt,
        meta: request.meta,
      });
      return {
        sessionId: spawned.id,
        parentId: spawned.parentId,
        status: spawned.status,
        agentId: spawned.agentId,
        agentName: agent?.name,
      };
    },

    waitForSessionIdle: async (
      targetSessionId: number,
      options?: { timeoutMs?: number },
    ): Promise<void> => {
      await manager.waitForSessionIdle(targetSessionId, options);
    },

    getSessionResultSummary: async (
      targetSessionId: number,
      options?: { maxChars?: number },
    ): Promise<SessionResultSummary> => {
      const maxChars = options?.maxChars ?? 20000;
      const row = db.get(targetSessionId);
      if (!row) throw new Error(`Session ${targetSessionId} not found`);
      const message = db.db
        .prepare(
          `SELECT payload
           FROM messages
           WHERE session_id = ? AND message_role = 'assistant'
           ORDER BY created_at DESC
           LIMIT 1`,
        )
        .get(targetSessionId) as { payload?: string } | undefined;
      let result = "";
      if (message?.payload) {
        try {
          const payload = JSON.parse(message.payload) as {
            message?: { content?: unknown };
            content?: unknown;
          };
          const content = payload.message?.content ?? payload.content;
          if (typeof content === "string") {
            result = content;
          } else if (Array.isArray(content)) {
            result = content
              .map((part) => {
                if (typeof part === "string") return part;
                if (part && typeof part === "object" && "text" in part) {
                  const text = (part as { text?: unknown }).text;
                  return typeof text === "string" ? text : "";
                }
                return "";
              })
              .filter(Boolean)
              .join("\n");
          }
        } catch {
          result = message.payload;
        }
      }
      const truncated = result.length > maxChars;
      return {
        sessionId: targetSessionId,
        status: row.status,
        result: truncated ? result.slice(0, maxChars) : result,
        truncated,
      };
    },

    finishSession: async (targetSessionId: number): Promise<void> => {
      if (!db.get(targetSessionId)) throw new Error(`Session ${targetSessionId} not found`);
      db.updateStatus(targetSessionId, "finished");
    },

    pausing: async <T>(reason: string, work: Promise<T> | (() => Promise<T>)): Promise<T> => {
      const before = db.get(sessionId)?.status;
      db.updateStatus(sessionId, "waiting_user");
      try {
        const result = typeof work === "function" ? await work() : await work;
        return result;
      } finally {
        const current = db.get(sessionId)?.status;
        if (current === "waiting_user") {
          db.updateStatus(sessionId, before === "running" ? "running" : "idle");
        }
        if (reason.trim()) {
          // Kept visible in logs; pausing is intentionally stateful via session status.
          console.debug(`[ext] pausing resolved [${sessionId}]: ${reason}`);
        }
      }
    },

    setSessionMeta: async (meta: Record<string, unknown>) => {
      manager.setMeta(sessionId, meta);
    },

    patchSessionMeta: async (patch: Record<string, unknown>) => {
      return manager.updateMeta(sessionId, patch);
    },

    getWorkflow: async () => manager.getWorkflow(sessionId),

    setWorkflow: async (patch: WorkflowStatePatch) => manager.setWorkflow(sessionId, patch),

    clearWorkflow: async () => manager.clearWorkflow(sessionId),

    setMessageMeta: async (messageId: string, meta: Record<string, unknown>) => {
      db.setMessageMeta(sessionId, messageId, meta);
    },

    patchMessageMeta: async (messageId: string, patch: Record<string, unknown>) => {
      return db.updateMessageMeta(sessionId, messageId, patch);
    },

    setLabel: async (entryId: string, label: string | undefined) => {
      if (label) {
        db.db
          .prepare(
            `INSERT INTO messages (entry_id, session_id, parent_entry_id, type, payload, meta, is_old, created_at)
						 VALUES (?, ?, ?, 'label', ?, '{}', 0, ?)`,
          )
          .run(
            randomUUID(),
            sessionId,
            entryId,
            JSON.stringify({ type: "label", targetId: entryId, label }),
            Date.now(),
          );
      }
    },

    // ── Agent control ────────────────────────────────────────────
    isIdle: () => {
      const state = db.get(sessionId);
      return (
        state?.status === "idle" ||
        state?.status === "finish" ||
        state?.status === "finished" ||
        state?.status === "starting"
      );
    },

    isStreaming: () => {
      const state = db.get(sessionId);
      return state?.status === "running" || state?.status === "waiting_user";
    },

    getSignal: () => {
      // Extension 自己的 AbortSignal，不是 Harness 内部信号。
      return undefined;
    },

    abort: () => {
      void runtime.abort();
    },

    waitForIdle: async () => {
      await runtime["harness"]?.waitForIdle();
    },

    fork: async (entryId: string, options?: { position?: "before" | "at" }) => {
      const forked = await manager.fork(sessionId, entryId, {
        position: options?.position,
      });
      const session = db.get(forked.id);
      if (!session) throw new Error(`Forked session ${forked.id} not found`);
      return {
        id: session.id,
        cwd: session.cwd,
        messageCount: 0,
        createdAt: session.created_at,
        lastActiveAt: session.last_active_at ?? session.created_at,
      };
    },

    switchSession: async (_targetSessionId: number) => {
      // Session-scoped: switching the extension context is a no-op for now
      // 每个 Agent 会话都有自己的 Extension，因此这里不切换实例。
      // 跨会话通信应使用事件总线。
    },

    navigateTree: async (
      _entryId: string,
      _options?: { summarize?: boolean; customInstructions?: string },
    ) => {
      // TODO: implement navigateTree for extensions when the use case arises
    },

    compact: async (options?: { customInstructions?: string }) => {
      const messages = await runtime.getMessages();
      const messageCount = messages.filter((entry) => entry.type === "message").length;
      const beforeEvent = {
        type: "compact.before" as const,
        customInstructions: options?.customInstructions,
        messageCount,
        cancel: false,
      };
      await emitExtensionEvent(beforeEvent);
      if (beforeEvent.cancel) {
        throw new Error("Compaction cancelled by extension");
      }

      const result = await runtime.compact(options?.customInstructions);
      await emitExtensionEvent({
        type: "compact.after",
        summary: result.summary,
        removedCount: Math.max(0, messageCount - 1),
        remainingCount: 1,
        summaryEntryId: result.firstKeptEntryId,
      });
      return {
        summary: result.summary,
        firstKeptEntryId: result.firstKeptEntryId,
        tokensBefore: result.tokensBefore,
      };
    },

    // ── Model control ────────────────────────────────────────────
    setModel: async (provider: string, modelId: string) => {
      const previous = runtime.harness.agent.state.model;
      await runtime.setModel(provider, modelId);
      await emitExtensionEvent({
        type: "model.change",
        provider,
        modelId,
        previousProvider: previous.provider,
        previousModelId: previous.id,
      });
    },

    setThinkingLevel: (level: "none" | "low" | "medium" | "high") => {
      void manager.setThinkingLevel(sessionId, level as unknown as ThinkingLevel);
    },

    getThinkingLevel: () => {
      const level = db.get(sessionId)?.thinking_level ?? runtime.harness.agent.state.thinkingLevel;
      if (level === "low" || level === "medium" || level === "high") return level;
      return "none";
    },

    getModel: () => {
      try {
        const state = db.get(sessionId);
        if (!state) return undefined;
        const meta = typeof state.meta === "string" ? JSON.parse(state.meta) : state.meta;
        const config = meta?.runtimeConfig as { provider?: string; modelId?: string } | undefined;
        if (config?.provider && config?.modelId) {
          return {
            provider: config.provider,
            id: config.modelId,
            contextWindow: 128000,
          };
        }
      } catch {
        // ignore
      }
      return undefined;
    },

    // ── Tools ────────────────────────────────────────────────────
    listSessionTools,
    emitExtensionEvent,

    // ── Execution ────────────────────────────────────────────────
    exec: async (
      command: string,
      args: string[],
      options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
    ): Promise<ExecResult> => {
      const cwd = options?.cwd ?? process.cwd();
      const result = await execCommand(command, args, cwd, {
        timeout: options?.timeout,
        signal: options?.signal,
      });
      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        code: result.code ?? 0,
        killed: result.killed ?? false,
        duration: 0,
      };
    },

    // ── Logging ──────────────────────────────────────────────────
    log: (
      level: "debug" | "info" | "warn" | "error",
      message: string,
      meta?: Record<string, unknown>,
    ) => {
      const prefix = `[ext]`;
      if (level === "error") console.error(prefix, message, meta ?? "");
      else if (level === "warn") console.warn(prefix, message, meta ?? "");
      else console.log(prefix, message, meta ?? "");
    },

    // ── Broadcast ────────────────────────────────────────────────
    broadcast: (_event: { type: string; [key: string]: unknown }) => {
      // TODO: wire to SSE event stream for connected Web UI clients
    },

    // ── Event bus ────────────────────────────────────────────────
    eventBus,
  };
}

type RuntimeDeps = {
  appendEntry: <T>(customType: string, data: T) => Promise<string>;
  sendMessage: (message: {
    role: "custom";
    customType: string;
    content: string;
    display?: boolean;
    details?: unknown;
    triggerTurn?: boolean;
  }) => Promise<void>;
  sendUserMessage: (
    content: string,
    options?: { source?: string; origin?: string },
  ) => Promise<void>;
  sendToChild: (sessionId: number, content: string, options?: { source?: string }) => Promise<void>;
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
  getWorkflow: () => Promise<import("../../core/session-workflow.js").SessionWorkflowState | null>;
  setWorkflow: (
    patch: WorkflowStatePatch,
  ) => Promise<import("../../core/session-workflow.js").SessionWorkflowState>;
  clearWorkflow: () => Promise<void>;
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
  broadcast: (event: { type: string; [key: string]: unknown }) => void;
  eventBus: EventBus;
  continueTurn: (content: string, options?: { source?: string }) => Promise<void>;
  setActiveTools: (names: string[]) => Promise<void>;
  getContextUsage: () => Promise<{ tokens: number | null }>;
};
// ============================================================================

interface DbAdapterOptions {
  sessionId: number;
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
    getChildSessions: async (): Promise<SessionInfo[]> => {
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
        [sessionId],
      );

      return rows.map((row) => ({
        id: Number(row.id),
        name: JSON.parse(row.meta || "{}").name as string | undefined,
        cwd: row.cwd,
        messageCount: row.message_count,
        createdAt: row.created_at,
        lastActiveAt: row.last_active_at,
      }));
    },

    getParentSession: async (): Promise<SessionInfo | undefined> => {
      const row = await queryOne<{
        parent_id: number | null;
        cwd: string;
        meta: string;
        created_at: number;
        last_active_at: number;
        message_count: number;
      }>(
        `SELECT p.id as parent_id, p.cwd, p.meta, p.created_at, p.last_active_at,
          (SELECT COUNT(*) FROM messages m WHERE m.session_id = p.id) as message_count
         FROM sessions s
         JOIN sessions p ON p.id = s.parent_id
         WHERE s.id = ?`,
        [sessionId],
      );

      if (row?.parent_id == null) return undefined;

      return {
        id: Number(row.parent_id),
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
