import type { AgentHarness, AgentTool } from "@earendil-works/pi-agent-core";
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
  ExtensionEventHandlerOptions,
  UiMenuDefinition,
  ExtensionToolCallResult,
  ExtensionSqliteDatabase,
  ExtensionSqliteStatement,
  MemberAgentInfo,
  SessionInfo,
  SessionResultSummary,
  SubagentStatusSnapshot,
  ScheduleInjectionInput,
  SpawnSessionRequest,
  SpawnSessionResult,
  ToolDefinition,
  ExtensionCommandDefinition,
  ToolGuardHandler,
  ToolInfo,
  ToolResultHandler,
  ExtensionContext,
} from "../index.js";
import { getProjectDir, getSessionDir } from "../../core/session/session-files.js";
import type { SessionManager } from "../../core/session/session-manager.js";
import type { ManagedSessionRuntime } from "../../core/session/managed-session-runtime.js";
import type { AgentResource } from "../../agent/runtime-resources.js";
import { readHarnessTools } from "../../core/agent/harness-compat.js";
import {
  touchSessionActivity,
  applySessionActivityPolicy,
} from "../../core/session/session-activity.js";
import { runWatson } from "../../core/agent/watson.js";
import type {
  SessionTaskInfo,
  SessionTodoInfo,
  SessionWorkflowState,
  SessionDataFacade,
  SessionMetaFacade,
  MessageMetaFacade,
  ExtensionMessage,
  SessionData,
  AgentDataFacade,
  AgentMetaFacade,
  AgentData,
  WorkflowStatePatch,
} from "../types.js";
import type { SessionTaskKind, SessionTodoStatus } from "../../types.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nativeHarness(runtime: ManagedSessionRuntime): AgentHarness | undefined {
  const harness = (runtime as { harness?: AgentHarness }).harness;
  return harness ?? undefined;
}

function nativeResource(
  runtime: ManagedSessionRuntime,
  fallback?: AgentResource,
): AgentResource | undefined {
  return fallback ?? (runtime as { resource?: AgentResource }).resource;
}

/** Replace or insert a marker-wrapped system-prompt block. Empty content removes the block. */
export function upsertMarkedSystemPromptBlock(
  current: string,
  id: string,
  content: string,
): string {
  const start = `<!-- ext-sys:${id} -->`;
  const end = `<!-- /ext-sys:${id} -->`;
  const marked = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "g");
  let base = current.replace(marked, "").trim();
  if (id === "service") {
    base = stripMarkdownSection(base, "## 项目服务");
  }
  const fragment = content.trim();
  if (!fragment) return base;
  const block = `${start}\n${fragment}\n${end}`;
  return base ? `${base}\n\n${block}` : block;
}

function stripMarkdownSection(text: string, heading: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === heading) {
      skipping = true;
      continue;
    }
    if (skipping && /^##\s/.test(trimmed)) skipping = false;
    if (!skipping) out.push(line);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ContextSessionMessages {
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
  activate(names: string[]): Promise<void>;
  deactivate(names: string[]): Promise<void>;
  enable(name: string): void;
  disable(name: string, reason?: string): void;
}

interface ContextSessionOptions {
  record: SessionData;
  id: number;
  getCwd: () => string;
  setCwd: (path: string) => Promise<void>;
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
  data: SessionDataFacade;
  meta: SessionMetaFacade;
  workflow: {
    get(): Promise<SessionWorkflowState | null>;
    set(patch: WorkflowStatePatch): Promise<SessionWorkflowState>;
    clear(): Promise<void>;
  };
  tasks: {
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
  todos: {
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
  activity: { touch: () => void };
  policy: { active: (id: string) => void };
  project: ExtensionContext["project"];
  agent: AgentDataFacade | null;
  inject: ExtensionContext["inject"];
  tools: ContextSessionTools;
  on<K extends ExtensionEvent["type"]>(
    event: K,
    handler: (
      event: Extract<ExtensionEvent, { type: K }>,
      ctx: EventHandlerContext,
    ) => void | Promise<void>,
    options?: ExtensionEventHandlerOptions,
  ): () => void;
  appendSystemPrompt: (content: string) => Promise<void>;
  upsertSystemPromptBlock: (id: string, content: string) => Promise<void>;
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
  sendCustomMessage: (content: string, options?: { createdAt?: number }) => Promise<string>;
  sendUserMessage: (
    content: string,
    options?: { source?: string; origin?: string },
  ) => Promise<void>;
  sendToChild: (
    sessionId: number,
    content: string,
    options?: { source?: string; background?: boolean; urgency?: "normal" | "urgent" },
  ) => Promise<void>;
  inspectChild: (
    sessionId: number,
    options?: { maxChars?: number },
  ) => Promise<SubagentStatusSnapshot>;
  pausing: <T>(reason: string, work: Promise<T> | (() => Promise<T>)) => Promise<T>;
  spawn: (request: SpawnSessionRequest) => Promise<SpawnSessionResult>;
  waitForResult: (
    sessionId: number,
    options?: { timeoutMs?: number; maxChars?: number },
  ) => Promise<SessionResultSummary>;
  finish: (sessionId?: number) => Promise<void>;
  checkpoint: (label?: string) => Promise<unknown>;
  rewindToEntry: (entryId: string) => Promise<void>;
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
  backendType: string;
  systemPrompt?: string;
  getSystemPrompt?: () => string | undefined;
  getModel: () => { provider: string; id: string; contextWindow: number } | undefined;
  registerTool: <TParams extends TSchema, TResult>(
    definition: ToolDefinition<TParams, TResult>,
  ) => void;
  unregisterTool: (name: string) => void;
  activate: (names: string[]) => Promise<void>;
  deactivate: (names: string[]) => Promise<void>;
  registerCommand?: (name: string, definition: ExtensionCommandDefinition) => void;
  unregisterCommand?: (name: string) => void;
  listTools: () => ToolInfo[];
  getTool: (name: string) => ToolInfo | undefined;
  findByTag: (tag: string) => Promise<MemberAgentInfo[]>;
  findByRole: (role: string) => Promise<MemberAgentInfo[]>;
  setModel: (provider: string, modelId: string) => Promise<void>;
  setThinkingLevel: (level: "none" | "low" | "medium" | "high") => void;
  getThinkingLevel: () => "none" | "low" | "medium" | "high";
  data: AgentDataFacade;
  meta: AgentMetaFacade;
}

type ContextDbOptions = ExtensionSqliteDatabase | undefined;

export interface ContextDependencies {
  sessionManager: SessionManager;
  db: Database;
  sessionRuntime: ManagedSessionRuntime;
  resource?: AgentResource;
}

export type Database = SupervisorDb;

interface ContextExtensionHost {
  emit(event: ExtensionEvent): void | Promise<void>;
  listTools(): ToolInfo[];
  setToolsActive(names: string[], active: boolean): void;
  on<K extends ExtensionEvent["type"]>(
    extensionId: string,
    event: K,
    handler: (
      event: Extract<ExtensionEvent, { type: K }>,
      ctx: EventHandlerContext,
    ) => void | Promise<void>,
    options?: ExtensionEventHandlerOptions,
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

/** Session-scoped context shared by every extension activated for that session. */
export class Context {
  private readonly sessionManager: SessionManager;
  readonly session: ContextSession;
  readonly policies: ExtensionContext["policies"];
  readonly capabilities: ExtensionContext["capabilities"];
  readonly agent: ContextAgent;
  readonly tools: {
    list(): ToolInfo[];
    get(name: string): ToolInfo | undefined;
    call<TResult = unknown>(
      name: string,
      params: unknown,
      options?: { signal?: AbortSignal },
    ): Promise<ExtensionToolCallResult<TResult>>;
  };
  readonly jobs: import("../types.js").ExtensionJobFacade;
  readonly db: ContextDb;
  readonly project: ExtensionContext["project"];
  readonly ui: {
    broadcast(event: BroadcastEvent): void;
    requestApproval(request: ApprovalRequest): Promise<ApprovalResult>;
    registerMenu(menu: UiMenuDefinition): () => void;
  };
  readonly events: EventBus;
  readonly flow;
  readonly inject;
  readonly services: SessionExtensionServices;
  /** Internal session resource bridge used by built-in extensions. */
  readonly agentResource: AgentResource;
  readonly watson: ExtensionContext["watson"];

  private activeExtensionId: string | undefined;
  private readonly extensionCleanups = new Map<string, Set<() => void>>();
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
  private readonly disabledPolicies: Set<string>;
  private readonly capabilityApis = new Map<string, unknown>();

  constructor({ sessionManager, db, sessionRuntime, resource }: ContextDependencies) {
    this.sessionManager = sessionManager;
    const session = sessionManager.get(sessionRuntime.id);
    if (!session) throw new Error(`Session ${sessionRuntime.id} not found`);
    if (session.projectId == null) throw new Error(`Session ${session.id} has no project`);

    const agent = session.agentId == null ? undefined : sessionManager.getAgent(session.agentId);
    this.disabledPolicies = new Set(
      Array.isArray(agent?.meta.disabledPolicies)
        ? agent.meta.disabledPolicies.filter((id): id is string => typeof id === "string")
        : [],
    );
    this.policies = {
      disable: (id) => this.disabledPolicies.add(id),
      isDisabled: (id) => this.disabledPolicies.has(id),
    };
    this.capabilities = {
      provide: (name, api) => {
        this.capabilityApis.set(name, api);
      },
      get: <T>(name: string) => this.capabilityApis.get(name) as T | undefined,
    };
    const projectRow = db.getProject(session.projectId);
    if (!projectRow) throw new Error(`Project ${session.projectId} not found`);
    const harness = nativeHarness(sessionRuntime);
    const agentResource = nativeResource(sessionRuntime, resource);
    if (!agentResource) throw new Error(`Session ${session.id} has no agent resource`);
    const model = harness?.getModel() ?? {
      id: agent?.name ?? "external",
      provider: agent?.backendType ?? "external",
    };
    const getSystemPrompt = () => sessionManager.composeLiveSystemPrompt(session.id);
    const listHarnessTools = () => (harness ? readHarnessTools(harness) : []);
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
      listSessionTools: () => this.listSessionTools(listHarnessTools()),
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
    this.agentResource = agentResource;

    const sessionTools: ContextSessionTools = {
      setPolicy: (policy) => this.services.tools.setPolicy(policy),
      getPolicy: () => this.services.tools.getPolicy(),
      beforeUse: (handler, options) =>
        this.trackExtensionCleanup(this.services.tools.beforeUse(handler, options)),
      afterUse: (handler, options) =>
        this.trackExtensionCleanup(this.services.tools.afterUse(handler, options)),
      activate: async (names) => {
        this.requireExtensionHost().setToolsActive(names, true);
        await deps.syncActiveTools();
      },
      deactivate: async (names) => {
        this.requireExtensionHost().setToolsActive(names, false);
        await deps.syncActiveTools();
      },
      enable: (name) => this.services.tools.enable(name),
      disable: (name, reason) => this.services.tools.disable(name, reason),
    };

    const sessionState = { cwd: session.cwd };
    const projectFacade: ExtensionContext["project"] = {
      data: {
        get: async () => {
          const project = db.getProject(session.projectId!);
          if (!project) throw new Error(`Project ${session.projectId} not found`);
          return project;
        },
        set: async (data) => {
          const project = db.updateProject(session.projectId!, {
            name: data.name,
            description: data.description,
            cwd: data.cwd,
            homeDir: data.homeDir,
            meta: data.meta,
          });
          return project;
        },
        patch: async (patch) => db.updateProject(session.projectId!, patch),
      },
      cwd: projectRow.cwd,
      dir: getProjectDir(session.projectId),
      getDir: deps.getProjectDir,
    };
    const injectFacade: ExtensionContext["inject"] = {
      schedule: (input: ScheduleInjectionInput) => this.services.inject.schedule(input),
      clear: (variant: string) => this.services.inject.clear(variant),
      reattach: (variant, content, options) =>
        this.services.inject.reattach(variant, content, options),
    };

    const agentData = agent
      ? {
          get: async () => {
            const current = db.getAgent(agent.id);
            if (!current) throw new Error(`Agent ${agent.id} not found`);
            const { meta: _meta, ...resultData } = current;
            return resultData;
          },
          set: async (data: AgentData) => {
            const current = db.updateAgent(agent.id, {
              name: data.name,
              description: data.description,
              avatar: data.avatar,
              backend_type: data.backendType,
              model_id: data.modelId,
              system_prompt: data.systemPrompt,
              tools_preset: data.toolsPreset,
              home_dir: data.homeDir,
              is_builtin: data.isBuiltin ? 1 : 0,
              external_config: data.externalConfig ? JSON.stringify(data.externalConfig) : null,
              permission_rules: JSON.stringify(data.permissionRules),
            });
            const { meta: _meta, ...resultData } = current;
            return resultData;
          },
          patch: async (patch: Partial<AgentData>) => {
            const current = db.updateAgent(agent.id, {
              name: patch.name,
              description: patch.description,
              avatar: patch.avatar,
              backend_type: patch.backendType,
              model_id: patch.modelId,
              system_prompt: patch.systemPrompt,
              tools_preset: patch.toolsPreset,
              home_dir: patch.homeDir,
              is_builtin: patch.isBuiltin === undefined ? undefined : patch.isBuiltin ? 1 : 0,
              external_config:
                patch.externalConfig === undefined
                  ? undefined
                  : patch.externalConfig
                    ? JSON.stringify(patch.externalConfig)
                    : null,
              permission_rules:
                patch.permissionRules === undefined
                  ? undefined
                  : JSON.stringify(patch.permissionRules),
            });
            const { meta: _meta, ...resultData } = current;
            return resultData;
          },
        }
      : undefined;
    const agentMeta = agent
      ? {
          get: async () => db.getAgent(agent.id)?.meta ?? {},
          set: async (meta: Record<string, unknown>) => {
            db.setAgentMeta(agent.id, meta);
          },
          patch: async (patch: Record<string, unknown>) => db.updateAgentMeta(agent.id, patch),
        }
      : undefined;

    const sessionOptions: ContextSessionOptions = {
      id: session.id,
      record: (() => {
        const { meta: _meta, currentTask: _currentTask, ...data } = session;
        return data;
      })(),
      getCwd: () => sessionState.cwd,
      setCwd: async (path: string) => {
        db.updateCwd(session.id, path);
        sessionState.cwd = path;
      },
      dir: getSessionDir(session.projectId, session.id),
      isMain: session.parentId == null || session.spawnType === "fork",
      isChild: session.parentId != null && session.spawnType !== "fork",
      getDir: deps.getSessionDir,
      appendSystemPrompt: async (content: string) => {
        sessionManager.appendSystemPromptOverlay(session.id, content);
      },
      upsertSystemPromptBlock: async (id: string, content: string) => {
        sessionManager.upsertSystemPromptBlockOverlay(session.id, id, content);
      },
      isIdle: deps.isIdle,
      isStreaming: deps.isStreaming,
      getSignal: deps.getSignal,
      abort: deps.abort,
      waitForIdle: deps.waitForIdle,
      messages: {
        list: extensionDb.getMessages,
        get: async (messageId) => {
          const message = await extensionDb.getMessageById(messageId);
          if (!message) return undefined;
          const meta: MessageMetaFacade = {
            get: async () => extensionDb.getMessageMeta(messageId),
            set: async (nextMeta) => deps.setMessageMeta(messageId, nextMeta),
            patch: (patch) => deps.patchMessageMeta(messageId, patch),
          };
          return { ...message, meta };
        },
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
      data: {
        get: deps.getSessionData,
        set: deps.setSessionData,
        patch: deps.patchSessionData,
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
      tasks: {
        list: deps.listTasks,
        upsert: deps.upsertTask,
        remove: deps.deleteTask,
        getCurrentPath: deps.getCurrentTaskPath,
        setCurrentPath: deps.setCurrentTaskPath,
      },
      todos: {
        list: deps.listTodos,
        replace: deps.setTodos,
      },
      activity: { touch: () => touchSessionActivity(db, session.id) },
      policy: {
        active: (id: string) => {
          if (id === "session-activity") {
            applySessionActivityPolicy(this.session);
          }
        },
      },
      project: projectFacade,
      agent: agentData ?? null,
      inject: injectFacade,
      tools: sessionTools,
      on: (event, handler, options) => this.on(event, handler, options),
      getParent: extensionDb.getParentSession,
      children: extensionDb.getChildSessions,
      appendEntry: deps.appendEntry,
      sendMessage: deps.sendMessage,
      sendCustomMessage: deps.sendCustomMessage,
      sendUserMessage: deps.sendUserMessage,
      sendToChild: deps.sendToChild,
      inspectChild: deps.inspectChild,
      pausing: deps.pausing,
      spawn: deps.spawnSession,
      waitForResult: async (targetSessionId, options) => {
        await deps.waitForSessionIdle(targetSessionId, { timeoutMs: options?.timeoutMs });
        return deps.getSessionResultSummary(targetSessionId, { maxChars: options?.maxChars });
      },
      finish: (targetSessionId) => deps.finishSession(targetSessionId ?? session.id),
      checkpoint: (label) =>
        sessionManager.createCheckpoint(session.id, label ? { label } : undefined),
      rewindToEntry: async (entryId) => {
        await sessionManager.rewindToEntry(session.id, entryId);
      },
      fork: deps.fork,
      switchTo: deps.switchSession,
      navigateTree: deps.navigateTree,
      compact: deps.compact,
    };
    const agentOptions: ContextAgentOptions = {
      id: agent?.id ?? session.id,
      name: agent?.name ?? "Session",
      providerId: agent?.providerId ?? 0,
      modelId: String(model.id),
      backendType: agent?.backendType ?? "native",
      systemPrompt: getSystemPrompt(),
      getSystemPrompt,
      getModel: deps.getModel,
      registerTool: (definition) =>
        this.requireExtensionHost().registerTool(this.requireActiveExtension(), definition),
      unregisterTool: (name) =>
        this.requireExtensionHost().unregisterTool(this.requireActiveExtension(), name),
      activate: async (names) => {
        this.requireExtensionHost().setToolsActive(names, true);
        await deps.syncActiveTools();
      },
      deactivate: async (names) => {
        this.requireExtensionHost().setToolsActive(names, false);
        await deps.syncActiveTools();
      },
      registerCommand: (name, definition) =>
        this.requireExtensionHost().registerCommand(
          this.requireActiveExtension(),
          name,
          definition,
        ),
      unregisterCommand: (name) =>
        this.requireExtensionHost().unregisterCommand(this.requireActiveExtension(), name),
      listTools: () => this.listSessionTools(listHarnessTools()),
      getTool: (name) =>
        this.listSessionTools(listHarnessTools()).find((tool) => tool.name === name),
      findByTag: deps.getMemberAgentsByTag,
      findByRole: deps.getMemberAgentsByRole,
      setModel: deps.setModel,
      setThinkingLevel: deps.setThinkingLevel,
      getThinkingLevel: deps.getThinkingLevel,
      data: agentData ?? {
        get: async () => {
          throw new Error("Agent data is unavailable");
        },
        set: async () => {
          throw new Error("Agent data is unavailable");
        },
        patch: async () => {
          throw new Error("Agent data is unavailable");
        },
      },
      meta: agentMeta ?? {
        get: async () => ({}),
        set: async () => {},
        patch: async () => ({}),
      },
    };

    this.session = new ContextSession(sessionOptions);
    this.agent = new ContextAgent(agentOptions);
    this.tools = {
      list: () => this.requireExtensionHost().listTools(),
      get: (name) =>
        this.requireExtensionHost()
          .listTools()
          .find((tool) => tool.name === name),
      call: async <TResult = unknown>(
        name: string,
        params: unknown,
        options?: { signal?: AbortSignal },
      ) =>
        (await this.requireExtensionHost().callTool(
          name,
          params,
          options?.signal,
        )) as ExtensionToolCallResult<TResult>,
    };
    this.jobs = {
      create: async (input) => sessionManager.jobs.create(session.id, input),
      get: async (id) => {
        const job = sessionManager.jobs.get(id);
        return job?.sessionId === session.id ? job : undefined;
      },
      list: async (options) => sessionManager.jobs.list(session.id, options),
      update: async (id, patch) => {
        const job = sessionManager.jobs.get(id);
        if (!job || job.sessionId !== session.id) throw new Error(`Job ${id} not found`);
        return sessionManager.jobs.update(id, patch);
      },
      cancel: async (id) => {
        const job = sessionManager.jobs.get(id);
        if (!job || job.sessionId !== session.id) throw new Error(`Job ${id} not found`);
        return sessionManager.jobs.cancel(id);
      },
      input: async (id, input) => {
        const job = sessionManager.jobs.get(id);
        if (!job || job.sessionId !== session.id) throw new Error(`Job ${id} not found`);
        return sessionManager.jobs.input(id, input);
      },
      setCancelHandler: (id, handler) => {
        const job = sessionManager.jobs.get(id);
        if (!job || job.sessionId !== session.id) throw new Error(`Job ${id} not found`);
        sessionManager.jobs.setCancelHandler(id, handler);
      },
      setInputHandler: (id, handler) => {
        const job = sessionManager.jobs.get(id);
        if (!job || job.sessionId !== session.id) throw new Error(`Job ${id} not found`);
        sessionManager.jobs.setInputHandler(id, handler);
      },
    };
    this.db = new ContextDb(db.db);
    // Project cwd is the project root (e.g. D:\myproject\lizi), NOT the session
    // worktree / default supervisor data dir. Worktree creation keys off this.
    this.project = projectFacade;
    this.ui = {
      broadcast: deps.broadcast,
      requestApproval: (request) => this.services.uiApproval.requestApproval(request),
      registerMenu: (menu) => {
        const owner = this.requireActiveExtension();
        const agentId = session.agentId;
        if (agentId == null) return () => {};
        const registered = this.sessionManager.registerUiMenu(agentId, owner, menu);
        return this.trackExtensionCleanup(registered);
      },
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
    this.inject = injectFacade;
    this.logger = deps.log;
    this.commandExecutor = deps.exec;
    this.watson = {
      run: ((options: {
        kind: string;
        prompt: string;
        mode: "simple" | "agent";
        cwd?: string;
        systemPrompt?: string;
        injectSystem?: string;
        toolsPreset?: "coding" | "readonly" | "none";
        extraTools?: AgentTool[];
        resultSchema?: TSchema;
      }) =>
        runWatson({
          mode: options.mode,
          cwd: options.cwd?.trim() || session.cwd,
          kind: options.kind,
          prompt: options.prompt,
          systemPrompt: options.systemPrompt,
          injectSystem: options.injectSystem,
          ...(options.mode === "agent"
            ? { toolsPreset: options.toolsPreset, extraTools: options.extraTools }
            : {}),
          ...(options.resultSchema ? { resultSchema: options.resultSchema } : {}),
        })) as ExtensionContext["watson"]["run"],
    };
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

  /** Synchronous ownership scope used while installing Agent-level registrations. */
  runExtensionSync<T>(extensionId: string, run: () => T): T {
    const previous = this.activeExtensionId;
    this.activeExtensionId = extensionId;
    try {
      return run();
    } finally {
      this.activeExtensionId = previous;
    }
  }

  /** Internal cleanup used when an Agent-owned Session scope detaches. */
  removeExtensionResources(extensionId: string): void {
    const cleanups = this.extensionCleanups.get(extensionId);
    if (cleanups) {
      this.extensionCleanups.delete(extensionId);
      for (const cleanup of cleanups) cleanup();
    }
    this.requireExtensionHost().removeResources(extensionId);
  }

  on<K extends ExtensionEvent["type"]>(
    event: K,
    handler: (
      event: Extract<ExtensionEvent, { type: K }>,
      ctx: EventHandlerContext,
    ) => void | Promise<void>,
    options?: ExtensionEventHandlerOptions,
  ): () => void {
    return this.requireExtensionHost().on(this.requireActiveExtension(), event, handler, options);
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
        active: this.services.tools.isActive(tool.name),
        definition: tool as unknown as ToolDefinition<TSchema, unknown>,
      });
    }
    for (const tool of this.extensionHost?.listTools() ?? []) merged.set(tool.name, tool);
    return [...merged.values()];
  }

  private trackExtensionCleanup(cleanup: () => void): () => void {
    const extensionId = this.requireActiveExtension();
    const cleanups = this.extensionCleanups.get(extensionId) ?? new Set<() => void>();
    let active = true;
    const tracked = () => {
      if (!active) return;
      active = false;
      cleanups.delete(tracked);
      cleanup();
    };
    cleanups.add(tracked);
    this.extensionCleanups.set(extensionId, cleanups);
    return tracked;
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
    return this.options.record.id;
  }
  get projectId() {
    return this.options.record.projectId;
  }
  get parentId() {
    return this.options.record.parentId;
  }
  get status() {
    return this.options.record.status;
  }
  get thinkingLevel() {
    return this.options.record.thinkingLevel;
  }
  get leafId() {
    return this.options.record.leafId;
  }
  get agentId() {
    return this.options.record.agentId;
  }
  get spawnType() {
    return this.options.record.spawnType;
  }
  get creationMethod() {
    return this.options.record.creationMethod;
  }
  get title() {
    return this.options.record.title;
  }
  get systemPrompt() {
    return this.options.record.systemPrompt;
  }
  get avatar() {
    return this.options.record.avatar;
  }
  get isBuiltin() {
    return this.options.record.isBuiltin;
  }
  get pinned() {
    return this.options.record.pinned;
  }
  get muted() {
    return this.options.record.muted;
  }
  get unread() {
    return this.options.record.unread;
  }
  get externalSessionId() {
    return this.options.record.externalSessionId;
  }
  get errorMsg() {
    return this.options.record.errorMsg;
  }
  get stage() {
    return this.options.record.stage;
  }
  get shadowEnabled() {
    return this.options.record.shadowEnabled;
  }
  get createdAt() {
    return this.options.record.createdAt;
  }
  get lastActiveAt() {
    return this.options.record.lastActiveAt;
  }
  get agent() {
    return this.options.agent;
  }
  get data() {
    return this.options.data;
  }
  get meta() {
    return this.options.meta;
  }
  setMeta(meta: Record<string, unknown>) {
    return this.options.meta.set(meta);
  }
  patchMeta(patch: Record<string, unknown>) {
    return this.options.meta.patch(patch);
  }

  get cwd(): string {
    return this.options.getCwd();
  }
  get dir(): string {
    return this.options.dir;
  }
  async setCwd(path: string): Promise<void> {
    await this.options.setCwd(path);
  }
  appendSystemPrompt(content: string): Promise<void> {
    return this.options.appendSystemPrompt(content);
  }
  upsertSystemPromptBlock(id: string, content: string): Promise<void> {
    return this.options.upsertSystemPromptBlock(id, content);
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
  on<K extends ExtensionEvent["type"]>(
    event: K,
    handler: (
      event: Extract<ExtensionEvent, { type: K }>,
      ctx: EventHandlerContext,
    ) => void | Promise<void>,
    options?: ExtensionEventHandlerOptions,
  ): void {
    this.options.on(event, handler, options);
  }
  get workflow(): ContextSessionOptions["workflow"] {
    return this.options.workflow;
  }
  get tasks(): ContextSessionOptions["tasks"] {
    return this.options.tasks;
  }
  get todos(): ContextSessionOptions["todos"] {
    return this.options.todos;
  }
  get activity(): ContextSessionOptions["activity"] {
    return this.options.activity;
  }
  get policy(): ContextSessionOptions["policy"] {
    return this.options.policy;
  }
  get project(): ContextSessionOptions["project"] {
    return this.options.project;
  }
  get inject(): ContextSessionOptions["inject"] {
    return this.options.inject;
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
  sendCustomMessage(content: string, options?: { createdAt?: number }): Promise<string> {
    return this.options.sendCustomMessage(content, options);
  }
  sendUserMessage(content: string, options?: { source?: string; origin?: string }): Promise<void> {
    return this.options.sendUserMessage(content, options);
  }
  sendToChild(
    sessionId: number,
    content: string,
    options?: { source?: string; background?: boolean; urgency?: "normal" | "urgent" },
  ): Promise<void> {
    return this.options.sendToChild(sessionId, content, options);
  }
  inspectChild(sessionId: number, options?: { maxChars?: number }) {
    return this.options.inspectChild(sessionId, options);
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
  checkpoint(label?: string): Promise<unknown> {
    return this.options.checkpoint(label);
  }
  rewindToEntry(entryId: string): Promise<void> {
    return this.options.rewindToEntry(entryId);
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

  get data() {
    return this.options.data;
  }
  get meta() {
    return this.options.meta;
  }

  get id(): number {
    return this.options.id;
  }
  get name(): string {
    return this.options.name;
  }
  get backendType(): string {
    return this.options.backendType;
  }
  get providerId(): number {
    return this.options.providerId;
  }
  get modelId(): string {
    return this.options.modelId;
  }
  get systemPrompt(): string | undefined {
    return this.options.getSystemPrompt?.() ?? this.options.systemPrompt;
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
  activate(names: string[]): Promise<void> {
    return this.options.activate(names);
  }
  deactivate(names: string[]): Promise<void> {
    return this.options.deactivate(names);
  }
  registerCommand(name: string, definition: ExtensionCommandDefinition): void {
    if (!this.options.registerCommand) throw new Error("Slash command registration is unavailable");
    this.options.registerCommand(name, definition);
  }
  unregisterCommand(name: string): void {
    this.options.unregisterCommand?.(name);
  }
  registerSlash(name: string, definition: ExtensionCommandDefinition): void {
    this.registerCommand(name, definition);
  }
  unregisterSlash(name: string): void {
    this.unregisterCommand(name);
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
