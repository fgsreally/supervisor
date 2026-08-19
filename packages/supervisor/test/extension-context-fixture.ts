import type { TSchema } from "typebox";
import {
  Context,
  ContextDb,
  SessionExtensionServices,
  type ToolPolicy,
} from "../src/extension/runtime/index.js";
import type {
  ApprovalRequest,
  BroadcastEvent,
  ContinueTurnOptions,
  EventBus,
  EventHandlerContext,
  ExecResult,
  ExtensionDatabase,
  ExtensionCommandDefinition,
  ExtensionEvent,
  ExtensionToolCallResult,
  MemberAgentInfo,
  ScheduleInjectionInput,
  SessionInfo,
  SessionResultSummary,
  SubagentStatusSnapshot,
  SpawnSessionRequest,
  SpawnSessionResult,
  ToolDefinition,
  ToolGuardHandler,
  ToolInfo,
  ToolResultHandler,
} from "../src/extension/index.js";
import type { CreateJobInput, JobRecord, UpdateJobInput } from "../src/core/jobs/jobs.js";
import type { SessionWorkflowState, WorkflowStatePatch } from "../src/extension/types.js";

function parseWorkflowState(value: unknown): SessionWorkflowState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stage =
    typeof (value as { stage?: unknown }).stage === "string"
      ? (value as { stage: string }).stage.trim()
      : "";
  return stage ? { stage, status: "working" } : null;
}

function applyWorkflowPatch(
  current: SessionWorkflowState | null,
  patch: WorkflowStatePatch,
): SessionWorkflowState {
  const stage = typeof patch.stage === "string" ? patch.stage.trim() : (current?.stage ?? "");
  return { stage, status: "working" };
}

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
    sendCustomMessage: (content: string) => Promise<string>;
    sendUserMessage: (content: string, options?: { source?: string }) => Promise<void>;
    sendToChild?: (
      sessionId: number,
      content: string,
      options?: { source?: string; background?: boolean; urgency?: "normal" | "urgent" },
    ) => Promise<void>;
    inspectChild?: (
      sessionId: number,
      options?: { maxChars?: number },
    ) => Promise<SubagentStatusSnapshot>;
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
    syncActiveTools: () => Promise<void>;
    getContextUsage: () => Promise<{ tokens: number | null }>;
  };
}

interface TestExtensionHost {
  emit(event: ExtensionEvent): void | Promise<void>;
  listTools(): ToolInfo[];
  setToolsActive?(names: string[], active: boolean): void;
  on<T extends ExtensionEvent>(
    extensionId: string,
    event: T["type"],
    handler: (event: T, context: EventHandlerContext) => void | Promise<void>,
  ): () => void;
  registerTool<TParams extends TSchema, TResult>(
    extensionId: string,
    definition: ToolDefinition<TParams, TResult>,
  ): void;
  unregisterTool(extensionId: string, name: string): void;
  registerCommand(extensionId: string, name: string, definition: ExtensionCommandDefinition): void;
  unregisterCommand(extensionId: string, name: string): void;
  callTool(name: string, params: unknown, signal?: AbortSignal): Promise<ExtensionToolCallResult>;
  removeResources(extensionId: string): void;
}

/** Build a Context-shaped test fixture without restoring the removed callback constructor API. */
export function createExtensionTestContext(options: RuntimeOptions): Context {
  const services = new SessionExtensionServices({
    sessionId: options.sessionId,
    deps: {
      continueTurn: options.deps.continueTurn,
      getContextUsage: options.deps.getContextUsage,
      isIdle: options.deps.isIdle,
      isStreaming: options.deps.isStreaming,
      pausing: options.deps.pausing,
      broadcast: (event) => options.deps.broadcast(event as BroadcastEvent),
    },
  });
  let activeExtensionId: string | undefined;
  let host: TestExtensionHost | undefined;
  let workflow = parseWorkflowState(options.sessionMeta?.workflow);
  let tasks: Array<{
    id: number;
    path: string;
    kind: "goal" | "plan";
    title: string | null;
    status: string | null;
    createdAt: number;
    updatedAt: number;
  }> = [];
  let currentTaskPath: string | null = null;
  let todos: Array<{
    id: number;
    title: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
    sortOrder: number;
  }> = [];
  const jobs = new Map<string, JobRecord>();
  const cancelHandlers = new Map<string, () => void | Promise<void>>();
  const inputHandlers = new Map<string, (input: string) => void | Promise<void>>();
  let nextJobId = 0;
  const requireHost = () => {
    if (!host) throw new Error("Test context is not attached");
    return host;
  };
  const requireExtension = () => {
    if (!activeExtensionId) throw new Error("No extension is active");
    return activeExtensionId;
  };

  const context = {
    session: {
      id: options.sessionId,
      cwd: options.cwd,
      dir: options.sessionDir,
      isMain: options.parentSessionId == null,
      isChild: options.parentSessionId != null,
      signal: options.deps.getSignal(),
      getDir: options.deps.getSessionDir,
      isIdle: options.deps.isIdle,
      isStreaming: options.deps.isStreaming,
      abort: options.deps.abort,
      waitForIdle: options.deps.waitForIdle,
      messages: {
        list: options.db.getMessages,
        get: options.db.getMessageById,
        tree: options.db.getMessageTree,
        currentBranch: options.db.getCurrentBranch,
        search: options.db.searchMessages,
        getMeta: options.db.getMessageMeta,
        setMeta: options.deps.setMessageMeta,
        patchMeta: options.deps.patchMessageMeta,
        setLabel: options.deps.setLabel,
        stats: options.db.getMessageStats,
        contextUsage: options.db.getContextUsage,
      },
      meta: {
        get: async () => options.sessionMeta ?? (await options.db.getSessionMeta()),
        set: options.deps.setSessionMeta,
        patch: options.deps.patchSessionMeta,
      },
      workflow: {
        get: async () => workflow,
        set: async (patch) => (workflow = applyWorkflowPatch(workflow, patch)),
        clear: async () => {
          workflow = null;
        },
      },
      tasks: {
        list: async () => tasks,
        upsert: async (input) => {
          const now = Date.now();
          const previous = tasks.find((task) => task.path === input.path);
          const task = {
            id: previous?.id ?? tasks.length + 1,
            path: input.path,
            kind: input.kind,
            title: input.title ?? previous?.title ?? null,
            status: input.status ?? previous?.status ?? null,
            createdAt: previous?.createdAt ?? now,
            updatedAt: now,
          };
          tasks = [...tasks.filter((item) => item.path !== input.path), task];
          await options.deps.patchSessionMeta({
            tasks: tasks.map(({ path, kind, title, status }) => ({ path, kind, title, status })),
          });
          return task;
        },
        remove: async (path) => {
          const found = tasks.some((task) => task.path === path);
          tasks = tasks.filter((task) => task.path !== path);
          await options.deps.patchSessionMeta({
            tasks: tasks.map(({ path, kind, title, status }) => ({ path, kind, title, status })),
          });
          return found;
        },
        getCurrentPath: async () => currentTaskPath,
        setCurrentPath: async (path) => {
          currentTaskPath = path;
          await options.deps.patchSessionMeta({ currentTask: path });
        },
      },
      todos: {
        list: async () => todos,
        replace: async (nextTodos) => {
          todos = nextTodos.map((todo, index) => ({ ...todo, id: index + 1, sortOrder: index }));
          await options.deps.patchSessionMeta({
            todos: todos.map(({ title, status }) => ({ title, status })),
          });
          return todos;
        },
      },
      tools: {
        setPolicy: (policy: ToolPolicy) => services.tools.setPolicy(policy),
        getPolicy: () => services.tools.getPolicy(),
        beforeUse: (handler: ToolGuardHandler, toolOptions?: { priority?: number }) =>
          services.tools.beforeUse(handler, toolOptions),
        afterUse: (handler: ToolResultHandler, toolOptions?: { priority?: number }) =>
          services.tools.afterUse(handler, toolOptions),
        activate: async (names: string[]) => {
          requireHost().setToolsActive?.(names, true);
          services.tools.activate(names);
          await options.deps.syncActiveTools();
        },
        deactivate: async (names: string[]) => {
          requireHost().setToolsActive?.(names, false);
          services.tools.deactivate(names);
          await options.deps.syncActiveTools();
        },
        enable: (name: string) => services.tools.enable(name),
        disable: (name: string, reason?: string) => services.tools.disable(name, reason),
      },
      setCwd: async (path: string) => {
        options.cwd = path;
      },
      appendSystemPrompt: async (content: string) => {
        const fragment = content.trim();
        if (!fragment) return;
        const current = options.agent.systemPrompt ?? "";
        if (current.includes(fragment)) return;
        options.agent.systemPrompt = current ? `${current}\n\n${fragment}` : fragment;
      },
      upsertSystemPromptBlock: async (id: string, content: string) => {
        const key = id.trim();
        const fragment = content.trim();
        if (!key || !fragment) return;
        const start = `<!-- ext-sys:${key} -->`;
        const end = `<!-- /ext-sys:${key} -->`;
        const block = `${start}\n${fragment}\n${end}`;
        const current = options.agent.systemPrompt ?? "";
        const marked = new RegExp(
          `${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`,
          "g",
        );
        const base = current.replace(marked, "").trim();
        options.agent.systemPrompt = base ? `${base}\n\n${block}` : block;
      },
      getParent: options.db.getParentSession,
      children: options.db.getChildSessions,
      appendEntry: options.deps.appendEntry,
      sendMessage: options.deps.sendMessage,
      sendCustomMessage: options.deps.sendCustomMessage,
      sendUserMessage: options.deps.sendUserMessage,
      sendToChild: options.deps.sendToChild ?? (async () => {}),
      inspectChild:
        options.deps.inspectChild ??
        (async (sessionId) => ({
          sessionId,
          parentId: options.sessionId,
          status: "idle",
          result: "",
          truncated: false,
          queuedInputCount: 0,
          lastActiveAt: Date.now(),
        })),
      pausing: options.deps.pausing,
      spawn: options.deps.spawnSession,
      waitForResult: async (
        sessionId: number,
        resultOptions?: { timeoutMs?: number; maxChars?: number },
      ) => {
        await options.deps.waitForSessionIdle(sessionId, { timeoutMs: resultOptions?.timeoutMs });
        return options.deps.getSessionResultSummary(sessionId, {
          maxChars: resultOptions?.maxChars,
        });
      },
      finish: (sessionId?: number) => options.deps.finishSession(sessionId ?? options.sessionId),
      fork: options.deps.fork,
      switchTo: options.deps.switchSession,
      navigateTree: options.deps.navigateTree,
      compact: options.deps.compact,
      on<T extends ExtensionEvent>(
        event: T["type"],
        handler: (event: T, eventContext: EventHandlerContext) => void | Promise<void>,
      ) {
        requireHost().on(requireExtension(), event, handler);
      },
    },
    policies: {
      disable: () => {},
      isDisabled: () => false,
    },
    agent: {
      ...options.agent,
      model: options.deps.getModel(),
      registerTool: <TParams extends TSchema, TResult>(
        definition: ToolDefinition<TParams, TResult>,
      ) => requireHost().registerTool(requireExtension(), definition),
      unregisterTool: (name: string) => requireHost().unregisterTool(requireExtension(), name),
      activate: async (names: string[]) => {
        requireHost().setToolsActive?.(names, true);
        services.tools.activate(names);
        await options.deps.syncActiveTools();
      },
      deactivate: async (names: string[]) => {
        requireHost().setToolsActive?.(names, false);
        services.tools.deactivate(names);
        await options.deps.syncActiveTools();
      },
      registerCommand: (name: string, definition: ExtensionCommandDefinition) =>
        requireHost().registerCommand(requireExtension(), name, definition),
      unregisterCommand: (name: string) =>
        requireHost().unregisterCommand(requireExtension(), name),
      registerSlash: (name: string, definition: ExtensionCommandDefinition) =>
        requireHost().registerCommand(requireExtension(), name, definition),
      unregisterSlash: (name: string) => requireHost().unregisterCommand(requireExtension(), name),
      listTools: () => options.deps.listSessionTools(),
      getTool: (name: string) => options.deps.listSessionTools().find((tool) => tool.name === name),
      findByTag: options.deps.getMemberAgentsByTag,
      findByRole: options.deps.getMemberAgentsByRole,
      setModel: options.deps.setModel,
      setThinkingLevel: options.deps.setThinkingLevel,
      getThinkingLevel: options.deps.getThinkingLevel,
    },
    tools: {
      list: () => requireHost().listTools(),
      get: (name: string) =>
        requireHost()
          .listTools()
          .find((tool) => tool.name === name),
      call: (name: string, params: unknown, callOptions?: { signal?: AbortSignal }) =>
        requireHost().callTool(name, params, callOptions?.signal),
    },
    jobs: {
      create: async (input: CreateJobInput) => {
        const now = Date.now();
        const status = input.status ?? "queued";
        const job: JobRecord = {
          id: `job-${++nextJobId}`,
          sessionId: options.sessionId,
          kind: input.kind,
          name: input.name,
          label: input.label ?? input.name,
          status,
          executionMode: input.executionMode ?? "inline",
          capabilities: input.capabilities ?? [],
          output: input.output ?? "",
          metadata: input.metadata ?? {},
          createdAt: now,
          ...(status === "running" ? { startedAt: now } : {}),
        };
        jobs.set(job.id, job);
        return job;
      },
      get: async (id: string) => jobs.get(id),
      list: async (listOptions?: { limit?: number; kind?: string }) =>
        [...jobs.values()]
          .filter((job) => !listOptions?.kind || job.kind === listOptions.kind)
          .slice(0, listOptions?.limit ?? jobs.size),
      update: async (id: string, patch: UpdateJobInput) => {
        const job = jobs.get(id);
        if (!job) throw new Error(`Job ${id} not found`);
        const updated = {
          ...job,
          ...patch,
          metadata: patch.metadata ? { ...job.metadata, ...patch.metadata } : job.metadata,
          ...(patch.status &&
          ["succeeded", "failed", "cancelled", "interrupted"].includes(patch.status)
            ? { finishedAt: Date.now() }
            : {}),
        } as JobRecord;
        jobs.set(id, updated);
        return updated;
      },
      cancel: async (id: string) => {
        await cancelHandlers.get(id)?.();
        const job = jobs.get(id);
        if (!job) throw new Error(`Job ${id} not found`);
        const updated = { ...job, status: "cancelled", finishedAt: Date.now() } as JobRecord;
        jobs.set(id, updated);
        return updated;
      },
      input: async (id: string, input: string) => {
        const handler = inputHandlers.get(id);
        if (!handler) throw new Error(`Job ${id} does not accept input`);
        await handler(input);
      },
      setCancelHandler: (id: string, handler: () => void | Promise<void>) => {
        cancelHandlers.set(id, handler);
      },
      setInputHandler: (id: string, handler: (input: string) => void | Promise<void>) => {
        inputHandlers.set(id, handler);
      },
    },
    db: new ContextDb(options.db.sqlite),
    project: {
      cwd: options.cwd,
      dir: options.projectDir,
      getDir: options.deps.getProjectDir,
    },
    ui: {
      broadcast: options.deps.broadcast,
      requestApproval: (request: ApprovalRequest) => services.uiApproval.requestApproval(request),
    },
    events: options.deps.eventBus,
    flow: {
      continue: (flowOptions?: ContinueTurnOptions) => services.flow.continue(flowOptions),
      pause: (reason?: string) => services.flow.pause(reason),
      resume: () => services.flow.resume(),
      acquireLock: (key: string, lockOptions?: { ttlMs?: number }) =>
        services.flow.acquireLock(key, lockOptions),
      usage: (usageOptions?: { since?: "session" | "lastTurn"; scope?: string }) =>
        services.flow.usage(usageOptions),
      startScope: (scope: string) => services.flow.startScope(scope),
      endScope: (scope: string) => services.flow.endScope(scope),
    },
    inject: {
      schedule: (input: ScheduleInjectionInput) => services.inject.schedule(input),
      clear: (variant: string) => services.inject.clear(variant),
      reattach: (
        variant: string,
        content: string,
        injectOptions?: Omit<ScheduleInjectionInput, "variant" | "content">,
      ) => services.inject.reattach(variant, content, injectOptions),
    },
    services,
    attachExtensionHost(nextHost: TestExtensionHost) {
      host = nextHost;
    },
    async runExtension<T>(extensionId: string, run: () => T | Promise<T>): Promise<T> {
      const previous = activeExtensionId;
      activeExtensionId = extensionId;
      try {
        return await run();
      } finally {
        activeExtensionId = previous;
      }
    },
    runExtensionSync<T>(extensionId: string, run: () => T): T {
      const previous = activeExtensionId;
      activeExtensionId = extensionId;
      try {
        return run();
      } finally {
        activeExtensionId = previous;
      }
    },
    removeExtensionResources(extensionId: string) {
      requireHost().removeResources(extensionId);
    },
    on<T extends ExtensionEvent>(
      event: T["type"],
      handler: (event: T, eventContext: EventHandlerContext) => void | Promise<void>,
    ) {
      return requireHost().on(requireExtension(), event, handler);
    },
    log: options.deps.log,
    exec: options.deps.exec,
  };

  return context as unknown as Context;
}
