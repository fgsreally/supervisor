import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { SupervisorSessionRuntime } from "../core/session-runtime.js";
import type { SessionManager } from "../core/session-manager.js";
import type { SupervisorDb } from "../db/db.js";
import { ensureProjectDir, ensureSessionDir } from "../core/session-files.js";
import { execCommand } from "../utils/exec.js";
import { mergeSessionToolInfos } from "./extension-event-bridge.js";
import type {
  EventBus,
  ExecResult,
  ExtensionEvent,
  MemberAgentInfo,
  SessionResultSummary,
  SessionInfo,
  SpawnSessionRequest,
  SpawnSessionResult,
  ToolInfo,
} from "./types.js";

/**
 * Build the EventBus for ExtensionRuntime.
 * Uses a simple Node.js EventEmitter for cross-extension communication.
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
 * Build the deps object required by ExtensionRuntime.
 * All stubs are replaced with real implementations bridging to
 * SupervisorSessionRuntime, SessionManager, and SupervisorDb.
 */
export function buildExtensionDeps(deps: {
  runtime: SupervisorSessionRuntime;
  manager: SessionManager;
  db: SupervisorDb;
  sessionId: number;
  projectId: number;
  listSessionTools: () => ToolInfo[];
  emitExtensionEvent: (event: ExtensionEvent) => void | Promise<void>;
}): RuntimeDeps {
  const { runtime, manager, db, sessionId, projectId, listSessionTools, emitExtensionEvent } = deps;
  const eventBus = createEventBus();
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

    sendUserMessage: async (content: string, options?: { source?: string }) => {
      const state = await runtime.getState();
      if (state.isStreaming) {
        manager.followUp(sessionId, content, options?.source);
        return;
      }
      await manager.prompt(sessionId, content, undefined, options?.source);
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
      const timeoutMs = options?.timeoutMs ?? 30 * 60 * 1000;
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        const row = db.get(targetSessionId);
        if (!row) throw new Error(`Session ${targetSessionId} not found`);
        if (
          row.status !== "starting" &&
          row.status !== "running" &&
          row.status !== "waiting_user"
        ) {
          return;
        }
        await sleep(250);
      }
      throw new Error(`Timed out waiting for session ${targetSessionId}`);
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
      db.setMeta(sessionId, meta);
    },

    patchSessionMeta: async (patch: Record<string, unknown>) => {
      return db.updateMeta(sessionId, patch);
    },

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
      // ExtensionRuntime's own AbortSignal (not the harness internal one)
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

    switchSession: async (_targetSessionId: string) => {
      // Session-scoped: switching the extension context is a no-op for now
      // because each session creates its own ExtensionRuntime.
      // For cross-session communication, use the event bus instead.
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
  sendUserMessage: (content: string, options?: { source?: string }) => Promise<void>;
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
  switchSession: (sessionId: string) => Promise<void>;
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
};
