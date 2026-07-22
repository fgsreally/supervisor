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
  SpawnSessionRequest,
  SpawnSessionResult,
  ToolDefinition,
  ToolGuardHandler,
  ToolInfo,
  ToolResultHandler,
} from "../src/extension/index.js";
import { applyWorkflowPatch, parseWorkflowState } from "../src/core/session-workflow.js";

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
    sendToChild?: (
      sessionId: number,
      content: string,
      options?: { source?: string },
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

interface TestExtensionHost {
  emit(event: ExtensionEvent): void | Promise<void>;
  listTools(): ToolInfo[];
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
      tools: {
        setPolicy: (policy: ToolPolicy) => services.tools.setPolicy(policy),
        getPolicy: () => services.tools.getPolicy(),
        beforeUse: (handler: ToolGuardHandler, toolOptions?: { priority?: number }) =>
          services.tools.beforeUse(handler, toolOptions),
        afterUse: (handler: ToolResultHandler, toolOptions?: { priority?: number }) =>
          services.tools.afterUse(handler, toolOptions),
        enable: (name: string) => services.tools.enable(name),
        disable: (name: string, reason?: string) => services.tools.disable(name, reason),
        setActive: async (names: string[]) => {
          services.tools.setActive(names);
          await options.deps.setActiveTools(names);
        },
        getActive: () => services.tools.getActiveToolNames(),
      },
      getParent: options.db.getParentSession,
      children: options.db.getChildSessions,
      appendEntry: options.deps.appendEntry,
      sendMessage: options.deps.sendMessage,
      sendUserMessage: options.deps.sendUserMessage,
      sendToChild: options.deps.sendToChild ?? (async () => {}),
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
    },
    agent: {
      ...options.agent,
      model: options.deps.getModel(),
      registerTool: <TParams extends TSchema, TResult>(
        definition: ToolDefinition<TParams, TResult>,
      ) => requireHost().registerTool(requireExtension(), definition),
      unregisterTool: (name: string) => requireHost().unregisterTool(requireExtension(), name),
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
