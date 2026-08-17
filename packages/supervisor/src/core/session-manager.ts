import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  type AgentEvent,
  AgentHarness,
  type AgentHarnessEvent,
  type AgentMessage,
  Session as AgentSession,
  type AgentTool,
  type SessionTreeEntry,
  type ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import { getAgentHomeDir } from "../agent/index.js";
import { getDefaultCwd } from "../config/default-cwd.js";
import { initializeResourceCatalog } from "../resources/catalog-sync.js";
import { ExtensionModuleRegistry } from "../extension/registry.js";
import { ResourceManager } from "../resources/resource-manager.js";
import {
  ensureAgentBuiltinExtensionBindings,
  ensureBuiltinExtensionResources,
  listEnabledBuiltinExtensionSlugs,
} from "../extension/builtin/ensure.js";
import {
  BUILTIN_EXTENSIONS,
  BUILTIN_EXTENSION_SLUGS,
  isBuiltinExtensionResource,
} from "../extension/builtin/catalog.js";
import { declaredMenusForSlug, serializeUiMenu } from "../extension/ui-menus.js";
import { JobManager } from "./jobs.js";
import {
  executeTaskSlashCommand,
  isTaskSlashCommand,
  mergeSlashCommands,
  TASK_SLASH_COMMANDS,
} from "./session-task-commands.js";
import { ensureGlobalResourceRoot } from "../resources/resource-paths.js";
import { AgentResource } from "../agent/runtime-resources.js";
import {
  disposeAgentExtensionRuntime,
  loadSessionExtensions,
  ExtensionAttachRuntime,
} from "./session-extension-attach.js";
import {
  promptsToResourceInfo,
  mcpResourcesToInfo,
  type ResourceLayer,
  resolveAgentResources,
  resolveAgentTools,
  skillsToResourceInfo,
} from "../agent/resource-resolver.js";
import { ensurePackagedAgents, findPackagedAgentId } from "../agent/index.js";
import { attachHomeTaskSessionSync } from "./home-task-sync.js";
import { listSessionTimers, type SessionTimer } from "./session-timers.js";
import {
  buildTodoPlanPrompt,
  parseTodoPlanResult,
  TodoPlanResultSchema,
  validateHomeTaskDependencies,
} from "./home-task-plan.js";
import { scheduleReadyHomeTasks } from "./home-task-scheduler.js";
import { isFeatureModelRef, readSupervisorSettings } from "../utils/supervisor-settings.js";
import {
  applyProjectRuntimeParse,
  runProjectRuntimeParse,
  type SessionServicesMeta,
} from "./project-runtime.js";
import {
  parseSessionServicesMeta,
  sessionServicePortEnv,
  scrubStaleSessionRuntimeMeta,
  stoppedSessionServicesMeta,
} from "./session-services.js";
import { runWatson } from "./watson.js";
import type { CreateHomeTaskOptions, HomeTask, UpdateHomeTaskOptions } from "../types.js";
import {
  cancelPendingApprovals,
  submitApprovalResolution,
  UiApprovalService,
} from "../extension/runtime/index.js";
import type {
  ApprovalRequest,
  ApprovalResult,
  ExtensionEvent,
  UiMenuContext,
  UiMenuDefinition,
  UiMenuDescriptor,
  UiMenuSurface,
  UiMenuResult,
  SessionSetupReason,
} from "../extension/index.js";
import { normalizeSessionStage } from "./session-workflow.js";
import {
  type AskAnswer,
  cancelPendingAsks,
  hasPendingAsks,
  submitAskAnswer,
} from "../tools/ask/tool.js";
import {
  handleSessionLifecycleAgentEnd,
  prepareSessionLifecycleSpawn,
} from "./session-lifecycle.js";
import {
  composeLiveSessionSystemPrompt,
  formatSystemPromptOverlay,
  type SystemPromptOverlay,
} from "./session-system-prompt.js";
import type { SupervisorDb } from "../db/db.js";
import { createDefaultTools } from "../utils/default-tools.js";

function sessionSetupReason(options: SpawnSessionOptions): SessionSetupReason {
  void options;
  return "create";
}
import {
  commitAll,
  commitGitSnapshot,
  ensureGitRepositorySync,
  resolveSessionGitContext,
} from "../utils/git.js";
import { configureSessionLogProjectResolver, sessionLog } from "../utils/session-log.js";
import { appendSystemLog } from "../utils/system-log.js";
import { beginSessionTiming, timedSessionStep } from "../utils/session-timing.js";
import { writeLog } from "../i18n/logs.js";
import {
  startSessionActivityScheduler,
  hasSessionActivityPolicy,
  clearSessionActivityPolicy,
} from "./session-activity.js";
import { listExtensionInfosInDirectories } from "../extension/index.js";
import { loadPromptTemplates } from "./resource/prompt-templates.js";
import { loadPromptTemplate } from "./resource/system-prompts.js";
import { copyMessagesWithInheritance } from "./session-history.js";
import {
  createSessionCheckpoint,
  listSessionCheckpoints,
  parseCheckpoints,
  rewindSessionToCheckpoint,
} from "./session-history.js";
import { commitSessionChanges } from "./session-lifecycle.js";
import { harnessAgentController, SessionRuntime, type SessionState } from "./session-runtime.js";
import type { ManagedSessionRuntime } from "./managed-session-runtime.js";
import type {
  ExternalInteractionRequest,
  ExternalInteractionResponse,
} from "./managed-session-runtime.js";
import { AcpSessionRuntime } from "./external/acp-session-runtime.js";
import {
  externalAgentAvailability,
  getExternalAgentConfig,
  getExternalAgentInstallCommand,
  resolveExternalAgentInstallShellCommand,
} from "./external/external-agent-config.js";
import { runExternalAgentRepair } from "./external/external-agent-repair.js";
import { runShellCommand } from "./session-service-runtime.js";
import { CodexSessionRuntime } from "./external/codex-session-runtime.js";
import { ClaudeSessionRuntime } from "./external/claude-session-runtime.js";
import {
  listExternalSessions,
  loadExternalSession,
  materializeImportedImages,
  type ExternalSessionCandidate,
  type ImportableExternalBackend,
} from "./external/external-session-import.js";
import {
  createRuntimeSessionStorage,
  SQLiteSessionStorage,
  toSessionMessageResponse,
} from "./session-storage.js";
import { getSessionMessageByEntryId, querySessionMessagesPage } from "./session-message-query.js";
import { appendCustomMessage, formatGitCommitCustomMessage } from "./session-notice.js";
import {
  appendLlmErrorMessage,
  assistantHasVisibleContent,
  extractAgentEndLlmError,
  formatLlmErrorMessage,
  LLM_ERROR_CUSTOM_TYPE,
  willAttemptOverflowRecovery,
} from "./session-llm-error.js";
import { setSessionUnreadHandler } from "./session-unread.js";
import { ensureSessionDir, removeProjectDirSync, removeSessionDirSync } from "./session-files.js";
import { removeSessionMediaDirSync, type SessionPromptImage } from "./session-media.js";
import { runShadow } from "../extension/builtin/shadow/index.js";
import {
  DEFAULT_SESSION_INPUT_LEVEL,
  SESSION_INPUT_INTERRUPT_LEVEL,
  type SessionInputDisposition,
  SessionInputQueue,
  type SessionQueuedInput,
  shouldInterruptSessionInput,
} from "./session-input-queue.js";
import { loadSkills } from "../agent/skills.js";
import { listGlobalSkillRoots } from "../agent/skill-dirs.js";
import { getGlobalPromptsDirectory } from "./resource/prompt-resource.js";
import { getGlobalExtensionsDirectory } from "../extension/resource.js";
import { createResourceHandlers } from "../config/resource-handlers.js";
import { resolveLLMConfig } from "../utils/model-utils.js";
import {
  handleAgentEventForTurnFiles,
  mergeTurnIntoMeta,
  TurnFileTracker,
} from "./turn-file-tracker.js";
import type {
  Agent,
  AgentWithSystemMd,
  CommitSessionOptions,
  CommitSessionResult,
  CreateCheckpointOptions,
  CreateModelOptions,
  CreateSessionOptions,
  MessageSearchHit,
  Provider,
  Session,
  SessionAvatar,
  SessionCheckpoint,
  SessionMessageResponse,
  SessionMessagesPage,
  SessionRow,
  SessionStatus,
  SessionTask,
  SessionTaskKind,
  SessionTaskRow,
  SessionTodoItem,
  SessionTodoRow,
  SessionTodoStatus,
  SpawnSessionOptions,
  UpdateModelOptions,
} from "../types.js";
import {
  mapRowToSession,
  parseSessionMeta,
  serializeSessionAvatar,
  type SessionFieldsPatch,
} from "./session-fields.js";

export type ShadowSuggestionsEvent = {
  type: "shadow_suggestions";
  questions: string[];
  timestamp: number;
};

export type ShadowRunningEvent = {
  type: "shadow_running";
  running: boolean;
  timestamp: number;
};

export type ShadowAnalysisEvent = {
  type: "shadow_analysis";
  timestamp: number;
};

/** Operational notify for the Web UI (toast). Does not change session status. */
export type UiNotifyEvent = {
  type: "ui_notify";
  kind: "error" | "info" | "success";
  message: string;
  timestamp: number;
};

/** Session readiness / lifecycle status pushed over the session SSE stream. */
export type SessionStatusEvent = {
  type: "session_status";
  status: SessionStatus;
  timestamp: number;
};

export type SessionOutputEvent =
  | AgentHarnessEvent
  | ShadowSuggestionsEvent
  | ShadowRunningEvent
  | ShadowAnalysisEvent
  | UiNotifyEvent
  | SessionStatusEvent
  | { type: "approval.pending"; [key: string]: unknown };
export type SessionOutputListener = (sessionId: number, event: SessionOutputEvent) => void;
export type AgentUiMenusEvent = {
  agentId: number;
  menus: UiMenuDescriptor[];
};
export type AgentUiMenusListener = (event: AgentUiMenusEvent) => void;

function isTrackedAgentEvent(event: AgentHarnessEvent): event is AgentEvent {
  return (
    event.type === "agent_start" ||
    event.type === "agent_end" ||
    event.type === "tool_execution_start" ||
    event.type === "tool_execution_end"
  );
}

interface SessionToolConfig {
  cwd: string;
  agentId: number | null;
  toolsPreset: "coding" | "readonly" | "none";
  overrideTools?: AgentTool[];
}

function toSessionTask(row: SessionTaskRow): SessionTask {
  return {
    id: row.id,
    sessionId: row.session_id,
    path: row.path,
    kind: row.kind,
    title: row.title,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toSessionTodo(row: SessionTodoRow): SessionTodoItem {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/** Convert a SessionRow to the Session type, reading currentTask from meta. */
function rowToSession(row: SessionRow, _db?: unknown): Session {
  return mapRowToSession(row);
}

function toHarnessThinkingLevel(level: Session["thinkingLevel"]): ThinkingLevel {
  return level === "none" ? "off" : level;
}

function toSessionThinkingLevel(level: ThinkingLevel): Session["thinkingLevel"] {
  return level === "low" || level === "medium" || level === "high" ? level : "none";
}

/** Seed session avatar.icon from the linked agent when the client did not set one. */
function withDefaultSessionAvatar(
  avatar: SessionAvatar | null | undefined,
  agent: { name: string; avatar: string | null } | null | undefined,
): SessionAvatar | null {
  const icon = typeof agent?.avatar === "string" ? agent.avatar.trim() : "";
  if (!icon) return avatar ?? null;

  const existingIcon = typeof avatar?.icon === "string" ? avatar.icon.trim() : "";
  if (existingIcon) return avatar ?? null;

  return { ...(avatar ?? {}), icon };
}

function isUserRoleEntry(entry: SessionMessageResponse): boolean {
  return entry.type === "message" && entry.message?.role === "user";
}

/**
 * Fork copies history through the selected entry's full turn.
 * User and assistant share the same boundary: include the rest of the turn
 * (assistant / tool results) until the next user message.
 */
function resolveForkExclusiveEndIndex(
  messages: SessionMessageResponse[],
  forkPointIndex: number,
  position?: "before" | "at",
): number {
  if (position === "before") return forkPointIndex;
  let end = forkPointIndex + 1;
  while (end < messages.length && !isUserRoleEntry(messages[end]!)) {
    end += 1;
  }
  return end;
}

export class SessionManager {
  private db: SupervisorDb;
  private runtimes = new Map<number, ManagedSessionRuntime>();
  private turnTrackers = new Map<number, TurnFileTracker>();
  private outputListeners = new Map<number, Set<SessionOutputListener>>();
  private globalOutputListeners = new Set<SessionOutputListener>();
  private sessionToolConfigs = new Map<number, SessionToolConfig>();
  private readonly sessionInputQueues = new SessionInputQueue();
  private readonly drainingSessionInputs = new Set<number>();
  private readonly pendingSpawns = new Map<number, Promise<Session>>();
  private readonly pendingProjectParses = new Map<number, Promise<unknown>>();
  /** Runtime restores for existing Sessions; creation-time initialization uses pendingSpawns. */
  private readonly pendingRuntimeRestores = new Map<number, Promise<ManagedSessionRuntime>>();
  private readonly systemPromptOverlays = new Map<number, SystemPromptOverlay>();
  private readonly uiMenus = new Map<
    number,
    Map<string, { owner: string; menu: UiMenuDefinition }>
  >();
  private readonly agentUiMenuListeners = new Set<AgentUiMenusListener>();
  private readonly extensionRegistry = new ExtensionModuleRegistry();
  private readonly resourceHandlers: ReturnType<typeof createResourceHandlers>;
  private readonly resourceManager: ResourceManager;
  private resourcesInitialized = false;
  readonly jobs: JobManager;
  private readonly detachHomeTaskSync: () => void;
  private readonly stopSessionActivity: () => void;

  registerUiMenu(agentId: number, owner: string, menu: UiMenuDefinition): () => void {
    const menus = this.uiMenus.get(agentId) ?? new Map();
    this.uiMenus.set(agentId, menus);
    const key = `${owner}:${menu.id}`;
    menus.set(key, { owner, menu });
    this.publishAgentUiMenus(agentId);
    return () => {
      const current = this.uiMenus.get(agentId);
      current?.delete(key);
      if (current && current.size === 0) this.uiMenus.delete(agentId);
      this.publishAgentUiMenus(agentId);
    };
  }

  listAgentUiMenus(agentId: number): UiMenuDescriptor[] {
    if (!this.db.getAgent(agentId)) return [];
    const byId = new Map<string, UiMenuDescriptor>();
    for (const slug of listEnabledBuiltinExtensionSlugs(this.db, agentId)) {
      for (const menu of declaredMenusForSlug(slug)) byId.set(menu.id, menu);
    }
    const userSlugs = this.db
      .listAgentResourceBindings(agentId, { kind: "extension", enabledOnly: true })
      .flatMap((binding) => {
        const slug = binding.resource?.slug;
        if (!slug || BUILTIN_EXTENSION_SLUGS.has(slug)) return [];
        return [slug];
      });
    for (const module of this.extensionRegistry.getMany(userSlugs)) {
      if (module.error) continue;
      for (const menu of declaredMenusForSlug(module.slug, module.definition)) {
        byId.set(menu.id, menu);
      }
    }
    for (const { menu } of this.uiMenus.get(agentId)?.values() ?? []) {
      byId.set(menu.id, serializeUiMenu(menu));
    }
    return [...byId.values()].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  }

  listAllAgentUiMenus(): AgentUiMenusEvent[] {
    return this.db.listAgents().map((agent) => ({
      agentId: agent.id,
      menus: this.listAgentUiMenus(agent.id),
    }));
  }

  onAgentUiMenus(listener: AgentUiMenusListener): () => void {
    this.agentUiMenuListeners.add(listener);
    return () => {
      this.agentUiMenuListeners.delete(listener);
    };
  }

  publishAgentUiMenus(agentId: number): void {
    const event: AgentUiMenusEvent = { agentId, menus: this.listAgentUiMenus(agentId) };
    for (const listener of this.agentUiMenuListeners) listener(event);
  }

  async listUiMenus(
    sessionId: number,
    surface: UiMenuSurface,
    entryId?: string,
  ): Promise<UiMenuDescriptor[]> {
    const session = this.get(sessionId);
    if (session?.agentId == null) return [];
    return this.listAgentUiMenus(session.agentId).filter((menu) => {
      if (menu.surface !== surface) return false;
      if (surface === "message" && !entryId) return false;
      return true;
    });
  }

  async executeUiMenu(
    sessionId: number,
    menuId: string,
    entryId?: string,
  ): Promise<UiMenuResult | void> {
    const session = this.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.agentId == null) throw new Error(`UI menu ${menuId} not found`);
    const allowed = this.listAgentUiMenus(session.agentId).some((menu) => menu.id === menuId);
    if (!allowed) throw new Error(`UI menu ${menuId} not found`);
    const context: UiMenuContext = { sessionId, ...(entryId ? { entryId } : {}) };

    if (menuId === "git.fork-session" || menuId === "git.fork-message") {
      return { action: "select-agent-for-fork" };
    }
    if (
      menuId === "git.checkpoint" ||
      menuId === "git.achieve" ||
      menuId === "git.rewind-message"
    ) {
      await this.ensureRuntime(sessionId);
      if (menuId === "git.checkpoint") {
        await this.createCheckpoint(sessionId);
        return { refresh: true };
      }
      if (menuId === "git.achieve") {
        await this.complete(sessionId);
        return { refresh: true };
      }
      if (!entryId) throw new Error("Message entry is required");
      await this.rewindToEntry(sessionId, entryId);
      return { refresh: true };
    }

    const entry = [...(this.uiMenus.get(session.agentId)?.values() ?? [])].find(
      ({ menu }) => menu.id === menuId,
    );
    if (!entry) throw new Error(`UI menu ${menuId} not found`);
    if (entry.menu.visible && !(await entry.menu.visible(context))) {
      throw new Error(`UI menu ${menuId} is not available`);
    }
    return entry.menu.action(context);
  }

  constructor(db: SupervisorDb) {
    this.db = db;
    configureSessionLogProjectResolver((sessionId) => this.db.get(sessionId)?.project_id ?? null);
    this.db.reconcileInterruptedSessionStatuses();
    this.detachHomeTaskSync = attachHomeTaskSessionSync(this.db, {
      onChildTerminal: (parentId) => {
        void this.scheduleReadyHomeTasks(parentId).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          writeLog("error", "runtime.homeTaskScheduleFailed", { id: parentId, error: message });
        });
      },
    });
    this.stopSessionActivity = startSessionActivityScheduler(
      this.db,
      (id) => this.publishSessionStatus(id),
      (id) => hasSessionActivityPolicy(id),
    );
    for (const input of this.db.listPersistedSessionInputs()) {
      this.sessionInputQueues.enqueue(input.sessionId, {
        ...input,
        source: null,
        images: input.images as SessionPromptImage[] | undefined,
      });
    }
    this.jobs = new JobManager(db);
    this.jobs.setTerminalHandler((job) => {
      this.clearServiceRuntimeIfJob(job.sessionId, job.id);
    });
    scrubStaleSessionRuntimeMeta({
      list: () => this.db.list(),
      updateMeta: (id, patch) => this.db.updateMeta(id, patch),
    });
    this.resourceHandlers = createResourceHandlers({
      db: this.db,
      extensionRegistry: this.extensionRegistry,
      deactivateAgentExtension: (agentId, slug) => this.deactivateAgentExtension(agentId, slug),
    });
    this.resourceManager = new ResourceManager({
      db: this.db,
      handlers: this.resourceHandlers,
      ensureCatalog: () => this.ensureResourceCatalog(),
    });
    void this.ensureResourceCatalog();
    setSessionUnreadHandler((sessionId, entry, options) => {
      this.handleAssistantMessageUnread(sessionId, entry, options);
    });
  }

  // Expose for home/daily-work helpers that need direct DB access.
  get database(): SupervisorDb {
    return this.db;
  }

  async ensureResourceCatalog(): Promise<void> {
    if (this.resourcesInitialized) return;
    initializeResourceCatalog(this.db, this.resourceHandlers.values());
    ensureBuiltinExtensionResources(this.db);
    await this.extensionRegistry.refresh(this.db);
    this.resourcesInitialized = true;
  }

  getExtensionRegistry(): ExtensionModuleRegistry {
    return this.extensionRegistry;
  }

  /** Unified resource install / bind API (CLI, HTTP, extensions). */
  get resources(): ResourceManager {
    return this.resourceManager;
  }

  /** Cast SessionRow to the Session interface expected by the rest of the codebase. */
  private _getSession(id: number): Session | undefined {
    const row = this.db.get(id);
    if (!row) return undefined;
    return rowToSession(row, this.db);
  }

  /** Do not expose an active app whose backing service job has already ended. */
  private reconcileSessionServiceRuntime(session: Session): Session {
    const services = parseSessionServicesMeta(session.meta);
    if (!services) return session;

    const activeStatus =
      services.status === "starting" ||
      services.status === "running" ||
      services.status === "active";
    if (!activeStatus) return session;

    const jobIds = [services.jobId, ...(services.services ?? []).map((app) => app.jobId)].filter(
      (id): id is string => Boolean(id),
    );
    const endedJobId = jobIds.find((id) => {
      const job = this.jobs.get(id);
      return !job || ["succeeded", "failed", "cancelled", "interrupted"].includes(job.status);
    });

    if (endedJobId) {
      this.clearServiceRuntimeIfJob(session.id, endedJobId);
      return this._getSession(session.id) ?? session;
    }

    if (jobIds.length === 0) {
      this.db.updateMeta(session.id, {
        services: stoppedSessionServicesMeta(services),
      });
      this.publishServicesChange(session.id);
      this.publishSessionStatus(session.id);
      return this._getSession(session.id) ?? session;
    }

    return session;
  }

  private _listSessions(filter?: Parameters<SupervisorDb["list"]>[0]): Session[] {
    return this.db.list(filter).map((row) => this._getSession(row.id)!);
  }

  private _childrenSessions(parentId: number): Session[] {
    return this.db.children(parentId).map((row) => this._getSession(row.id)!);
  }

  private getAgentForSession(agentId: number | null) {
    return agentId ? this.db.getAgent(agentId) : undefined;
  }

  private assembleSessionTools(
    sessionId: number,
    agentId: number | null,
    cwd: string,
    toolsPreset: "coding" | "readonly" | "none",
    overrideTools?: AgentTool[],
  ): AgentTool[] {
    const baseTools =
      overrideTools ??
      createDefaultTools(cwd, toolsPreset, {
        sessionId,
        jobs: this.createBashJobHost(sessionId),
        getEnv: () => this.getSessionBashEnv(sessionId),
      });
    this.sessionToolConfigs.set(sessionId, { cwd, agentId, toolsPreset, overrideTools });
    return baseTools;
  }

  private createBashJobHost(sessionId: number) {
    return {
      create: async (input: Parameters<JobManager["create"]>[1]) =>
        this.jobs.create(sessionId, input),
      get: async (id: string) => this.jobs.get(id),
      list: async (options?: { limit?: number; kind?: string }) =>
        this.jobs.list(sessionId, options),
      update: async (id: string, patch: Parameters<JobManager["update"]>[1]) =>
        this.jobs.update(id, patch),
      cancel: (id: string) => this.jobs.cancel(id),
      input: (id: string, input: string) => this.jobs.input(id, input),
      setCancelHandler: (id: string, handler: () => void | Promise<void>) =>
        this.jobs.setCancelHandler(id, handler),
      setInputHandler: (id: string, handler: (input: string) => void | Promise<void>) =>
        this.jobs.setInputHandler(id, handler),
    };
  }

  private getSessionBashEnv(sessionId: number): NodeJS.ProcessEnv {
    const row = this.db.get(sessionId);
    if (!row) return {};
    try {
      const meta = JSON.parse(row.meta || "{}") as Record<string, unknown>;
      return sessionServicePortEnv(meta);
    } catch {
      return {};
    }
  }

  /** BTW is always read-only, regardless of the parent agent's toolsPreset. */
  private resolveToolsPresetForSession(
    session: Pick<Session, "spawnType">,
    fallback: "coding" | "readonly" | "none" = "coding",
  ): "coding" | "readonly" | "none" {
    return session.spawnType === "btw" ? "readonly" : fallback;
  }

  /** True when this BTW session has not yet recorded its own user message. */
  private async isFirstBtwUserPrompt(sessionId: number): Promise<boolean> {
    const storage = new SQLiteSessionStorage(this.db, sessionId);
    const entries = await storage.getEntries();
    return !entries.some(
      (entry) =>
        entry.type === "message" &&
        !!entry.message &&
        typeof entry.message === "object" &&
        "role" in entry.message &&
        (entry.message as { role?: string }).role === "user",
    );
  }

  private formatBtwFirstUserPrompt(question: string): string {
    const guide = loadPromptTemplate("btw-session").trim();
    return `${guide}\n\n---\n\nUser's side question:\n${question.trim()}`;
  }

  async resolveAgentResources(agentId: number, cwd: string) {
    const agent = this.db.getAgent(agentId);
    if (agent?.backendType !== "native") {
      return {
        agentId,
        homeDir: "",
        systemMd: "",
        toolsPreset: agent?.toolsPreset ?? null,
        tools: [],
        layers: {
          agent: { skills: [], prompts: [], extensions: [], mcp: [] },
          project: { skills: [], prompts: [], extensions: [], mcp: [] },
        },
      };
    }
    await this.ensureResourceCatalog();
    return resolveAgentResources(this.db, agentId, cwd, this.extensionRegistry);
  }

  async resolveAgentTools(agentId: number, cwd: string) {
    const agent = this.db.getAgent(agentId);
    if (agent?.backendType !== "native") return [];
    await this.ensureResourceCatalog();
    return resolveAgentTools(this.db, agentId, cwd, this.extensionRegistry);
  }

  private resolveProjectId(options: CreateSessionOptions): number | null {
    if (Object.prototype.hasOwnProperty.call(options, "projectId") && options.projectId === null) {
      return null;
    }
    if (options.projectId != null) {
      const project = this.db.getProject(options.projectId);
      if (!project) throw new Error(`Project ${options.projectId} not found`);
      return project.id;
    }
    if (options.parentId != null) {
      const parent = this.db.get(options.parentId);
      if (!parent) throw new Error(`Parent session ${options.parentId} not found`);
      if (parent.project_id == null) {
        return this.db.findOrCreateProjectByCwd(parent.cwd).id;
      }
      return parent.project_id;
    }
    const cwd = options.cwd ?? getDefaultCwd();
    return this.db.findOrCreateProjectByCwd(cwd).id;
  }

  private requireProjectId(session: Session): number {
    if (session.projectId == null) throw new Error(`Session ${session.id} has no project`);
    return session.projectId;
  }

  private getProjectDirForSession(session: Session): string {
    const project = this.db.getProject(this.requireProjectId(session));
    if (!project) throw new Error(`Project ${session.projectId} not found`);
    return project.homeDir;
  }

  /** Compose system prompt from current agent prompt, AGENTS.md, meta.services, and overlays. */
  composeLiveSystemPrompt(sessionId: number): string {
    const session = this._getSession(sessionId);
    if (!session) return "";
    const agent = session.agentId == null ? undefined : this.db.getAgent(session.agentId);
    return composeLiveSessionSystemPrompt({
      cwd: session.cwd,
      agentSystemMd: agent?.systemPrompt ?? "",
      storedSystemPrompt: session.systemPrompt,
      meta: session.meta,
      overlay: formatSystemPromptOverlay(this.systemPromptOverlays.get(sessionId)),
    });
  }

  appendSystemPromptOverlay(sessionId: number, content: string): void {
    const fragment = content.trim();
    if (!fragment) return;
    if (this.composeLiveSystemPrompt(sessionId).includes(fragment)) return;
    const overlay = this.ensureSystemPromptOverlay(sessionId);
    overlay.fragments.push(fragment);
  }

  upsertSystemPromptBlockOverlay(sessionId: number, id: string, content: string): void {
    const key = id.trim();
    if (!key) return;
    const overlay = this.ensureSystemPromptOverlay(sessionId);
    const fragment = content.trim();
    if (!fragment) overlay.blocks.delete(key);
    else overlay.blocks.set(key, fragment);
  }

  private ensureSystemPromptOverlay(sessionId: number): SystemPromptOverlay {
    let overlay = this.systemPromptOverlays.get(sessionId);
    if (!overlay) {
      overlay = { fragments: [], blocks: new Map() };
      this.systemPromptOverlays.set(sessionId, overlay);
    }
    return overlay;
  }

  private setupRuntime(sessionId: number, runtime: ManagedSessionRuntime): void {
    this.runtimes.set(sessionId, runtime);
    const existing = this.db.get(sessionId);
    this.turnTrackers.set(sessionId, new TurnFileTracker(existing?.cwd ?? getDefaultCwd(), 0));

    runtime.subscribe((event: AgentHarnessEvent) => {
      if (event.type === "agent_start") {
        this.db.updateStatus(sessionId, "running");
        this.publishSessionStatus(sessionId);
        if (runtime instanceof SessionRuntime) {
          const current = this.db.get(sessionId);
          const meta = current ? parseSessionMeta(current.meta) : {};
          const shadow = meta.shadow && typeof meta.shadow === "object" ? meta.shadow : {};
          this.db.updateMeta(sessionId, { shadow: { ...shadow, suggestedQuestions: [] } });
          this.publishShadowSuggestions(sessionId, []);
        }
      } else if (event.type === "tool_execution_start") {
        const args = (event as { args?: Record<string, unknown> }).args;
        const toolName = (event as { toolName?: string }).toolName;
        if (toolName === "external_interaction" || args?.externalInteraction === true) {
          // Surface Codex/Claude approval cards in Web as blocked.
          this.db.updateStatus(sessionId, "blocked");
          this.publishSessionStatus(sessionId);
        }
      } else if (event.type === "tool_execution_end") {
        const toolName = (event as { toolName?: string }).toolName;
        const args = (event as { args?: Record<string, unknown> }).args;
        if (
          (toolName === "external_interaction" || args?.externalInteraction === true) &&
          this.db.get(sessionId)?.status === "blocked"
        ) {
          this.db.updateStatus(sessionId, "running");
          this.publishSessionStatus(sessionId);
        }
      } else if (event.type === "agent_end") {
        const llmError = extractAgentEndLlmError(event);
        const overflowRecovery =
          !!llmError &&
          runtime instanceof SessionRuntime &&
          willAttemptOverflowRecovery(sessionId, llmError, runtime.harness.getModel() as never);

        if (llmError && !overflowRecovery && !hasPendingAsks(sessionId)) {
          this.db.updateStatus(sessionId, "error");
          this.publishSessionStatus(sessionId);
          if (!this.leafIsLlmError(sessionId)) {
            void this.recordLlmError(sessionId, formatLlmErrorMessage(llmError)).catch(
              (error: unknown) => {
                const detail = error instanceof Error ? error.message : String(error);
                writeLog("error", "runtime.recordLlmErrorFailed", { id: sessionId, error: detail });
              },
            );
          }
        } else if (!hasPendingAsks(sessionId)) {
          this.db.updateStatus(sessionId, "active");
          this.publishSessionStatus(sessionId);
          void (async () => {
            let shadowCheckpoint;
            if (runtime instanceof SessionRuntime && !hasPendingAsks(sessionId)) {
              try {
                shadowCheckpoint = await createSessionCheckpoint(this.db, sessionId, {
                  label: "shadow-turn",
                });
              } catch (error: unknown) {
                const detail = error instanceof Error ? error.message : String(error);
                writeLog("debug", "runtime.shadowCheckpointSkipped", {
                  id: sessionId,
                  error: detail,
                });
              }
            }
            if (!hasPendingAsks(sessionId)) {
              await this.drainSessionInputQueue(sessionId);
            }
            if (runtime instanceof SessionRuntime && shadowCheckpoint) {
              await runShadow(this, this.db, sessionId, event, shadowCheckpoint);
            }
          })().catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            writeLog("error", "runtime.shadowHookFailed", { id: sessionId, error: message });
          });
        }
      }

      if (runtime instanceof SessionRuntime) {
        handleSessionLifecycleAgentEnd(sessionId, runtime, event, this.db);
      }

      if (isTrackedAgentEvent(event)) {
        const tracker = this.turnTrackers.get(sessionId);
        const finishedTurn = handleAgentEventForTurnFiles(tracker, event);
        if (finishedTurn) {
          const inst = this.db.get(sessionId);
          if (inst) {
            const merged = mergeTurnIntoMeta(
              typeof inst.meta === "string"
                ? (JSON.parse(inst.meta) as Record<string, unknown>)
                : inst.meta,
              finishedTurn,
            );
            this.db.setMeta(sessionId, merged);
            this.turnTrackers.set(sessionId, new TurnFileTracker(inst.cwd, finishedTurn.index + 1));
          }
        }
      }

      const listeners = this.outputListeners.get(sessionId);
      if (listeners) {
        for (const fn of listeners) fn(sessionId, event);
      }
      for (const fn of this.globalOutputListeners) fn(sessionId, event);
    });
  }

  private enableMessageCheckpoints(storage: SQLiteSessionStorage, sessionId: number): void {
    storage.onEntryAppended(async (entry) => {
      if (entry.type !== "message" || entry.message.role !== "user") return;
      try {
        await createSessionCheckpoint(this.db, sessionId, { label: "message" });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        writeLog("error", "runtime.messageCheckpointFailed", { id: sessionId, error: message });
      }
    });
  }

  private hasSessionViewer(sessionId: number): boolean {
    return (this.outputListeners.get(sessionId)?.size ?? 0) > 0;
  }

  private handleAssistantMessageUnread(
    sessionId: number,
    entry: SessionTreeEntry,
    options: { isOld?: boolean },
  ): void {
    if (options.isOld) return;
    if (entry.type !== "message" || entry.message.role !== "assistant") return;

    if (this.hasSessionViewer(sessionId)) {
      this.db.updateMessageMeta(sessionId, entry.id, { read: true });
      return;
    }

    this.db.updateMessageMeta(sessionId, entry.id, { read: false });
    const row = this.db.get(sessionId);
    if (!row) return;
    const current = typeof row.unread === "number" && row.unread > 0 ? row.unread : 0;
    this.db.updateSessionFields(sessionId, { unread: current + 1 });
  }

  /** When forking/cloning an external-agent parent, remap to packaged Coding. */
  private resolveAgentIdForChildSession(parentAgentId: number | null | undefined): number | null {
    if (parentAgentId == null) return null;
    const agent = this.db.getAgent(parentAgentId);
    if (!agent || agent.backendType === "native") return parentAgentId;
    const codingId = findPackagedAgentId(this.db, "coding");
    if (codingId === undefined) {
      throw new Error("子会话不能使用外部 Agent，且未配置可用的原生 Coding Agent");
    }
    return codingId;
  }

  private async attachExternalSessionExtensions(
    session: Session,
    agent: Agent,
    startRuntime: (session: Session) => Promise<ManagedSessionRuntime>,
    setupReason: import("../extension/types.js").SessionSetupReason,
  ): Promise<ManagedSessionRuntime> {
    if (session.projectId == null) return startRuntime(session);

    const resource = new AgentResource({
      sessionId: session.id,
      agentId: session.agentId ?? 0,
      agent,
      cwd: session.cwd,
      db: this.db,
    });
    await resource.load();

    const bridge = new ExtensionAttachRuntime(session.id);
    const host = await loadSessionExtensions({
      runtime: bridge,
      agentId: session.agentId ?? 0,
      agentName: agent.name,
      cwd: session.cwd,
      db: this.db,
      manager: this,
      resource,
      setupReason,
    });
    if (host) bridge.attachExtension(host);

    const updated = this.get(session.id) ?? session;
    const runtime = await startRuntime(updated);
    bridge.setTarget(runtime);
    if (host) {
      runtime.attachExtension?.(host);
    }
    return runtime;
  }

  private createExternalRuntime(session: Session, agent: Agent): Promise<ManagedSessionRuntime> {
    const availability = externalAgentAvailability(agent);
    if (!availability.available)
      throw new Error(availability.unavailableReason ?? "外部 Agent 不可用");
    const options = { db: this.db, session, agent };
    if (agent.backendType === "codex") return CodexSessionRuntime.create(options);
    if (agent.backendType === "claude") return ClaudeSessionRuntime.create(options);
    if (
      agent.backendType === "kimi" ||
      agent.backendType === "cursor" ||
      agent.backendType === "mimo" ||
      agent.backendType === "acp"
    ) {
      return AcpSessionRuntime.create(options);
    }
    throw new Error(`Unsupported external Agent backend: ${agent.backendType}`);
  }

  private async restoreRuntime(id: number): Promise<ManagedSessionRuntime> {
    const doneRestore = beginSessionTiming(id, "restoreRuntime");
    try {
      const session = rowToSession(this.db.get(id)!, this.db);
      if (!session) throw new Error(`Session ${id} not found`);
      if (
        session.status === "finish" ||
        session.status === "finished" ||
        session.status === "stopped"
      ) {
        throw new Error(`Session ${id} is not resumable (status: ${session.status})`);
      }
      // `error` is resumable via retryAfterLlmError / prompt after clearing error state.

      const agent = this.getAgentForSession(session.agentId);
      if (agent && agent.backendType !== "native") {
        const runtime = await timedSessionStep(id, "restoreRuntime/createExternalRuntime", () =>
          this.attachExternalSessionExtensions(
            session,
            agent,
            (next) => this.createExternalRuntime(next, agent),
            "restore",
          ),
        );
        this.setupRuntime(session.id, runtime);
        this.db.updateStatus(session.id, "active");
        return runtime;
      }

      if (agent?.backendType === "native" && (!agent.providerId || !agent.modelId)) {
        throw new Error(`Agent ${agent.id} has no model configured`);
      }
      if (!agent?.modelId) {
        throw new Error(`Agent ${agent?.id ?? session.agentId} has no model configured`);
      }
      const toolsPreset = this.resolveToolsPresetForSession(session, agent.toolsPreset ?? "coding");
      const llm = resolveLLMConfig(agent.modelId);

      await this.ensureResourceCatalog();
      const resource = new AgentResource({
        sessionId: session.id,
        agentId: session.agentId ?? 0,
        agent,
        cwd: session.cwd,
        db: this.db,
      });
      await resource.load();

      const storage = createRuntimeSessionStorage(this.db, session);
      this.enableMessageCheckpoints(storage, session.id);
      const harnessSession = new AgentSession(storage);
      const env = new NodeExecutionEnv({ cwd: session.cwd });
      const sessionTools = this.assembleSessionTools(
        session.id,
        session.agentId,
        session.cwd,
        toolsPreset,
      );
      const tools = sessionTools;

      const harness = new AgentHarness({
        env,
        session: harnessSession,
        model: llm.model,
        systemPrompt: () => this.composeLiveSystemPrompt(session.id),
        tools,
        getApiKeyAndHeaders: async () => ({ apiKey: llm.apiKey }),
      });
      await harness.setThinkingLevel(toHarnessThinkingLevel(session.thinkingLevel));

      const runtime = new SessionRuntime({
        session,
        harness,
        resource,
        storage,
        getSession: () => this._getSession(session.id),
        getMessages: async () => {
          const storageForReads = new SQLiteSessionStorage(this.db, session.id);
          return storageForReads.getEntries();
        },
      });

      await runtime.initExtensions(
        session.agentId ?? 0,
        agent?.name ?? "Session",
        session.cwd,
        this.db,
        this,
      );
      const refreshedAfterExtensions = this.get(session.id)!;
      runtime.syncWorkingDirectory(refreshedAfterExtensions.cwd);
      if (agent?.backendType === "native") {
        runtime.configureAgentPermissions(
          agent.permissionRules,
          refreshedAfterExtensions.cwd,
          (request) => this.requestSessionApproval(session.id, request),
        );
      }
      const extensionTools = runtime.collectExtensionTools();
      if (extensionTools.length > 0) {
        const mergedTools = new Map<string, AgentTool>();
        for (const tool of tools) mergedTools.set(tool.name, tool);
        for (const tool of extensionTools) mergedTools.set(tool.name, tool);
        await runtime.setTools([...mergedTools.values()]);
      }

      this.setupRuntime(session.id, runtime);
      this.db.updateStatus(session.id, "active");
      return runtime;
    } finally {
      doneRestore();
    }
  }

  private async getOrRestoreRuntime(id: number): Promise<ManagedSessionRuntime> {
    const runtime = this.runtimes.get(id);
    if (runtime) return runtime;

    // A newly created Session has exactly one initializer: finalizeSpawn(). Any
    // request arriving while it runs must wait for it, never start a restore.
    const pendingSpawn = this.pendingSpawns.get(id);
    if (pendingSpawn) {
      await pendingSpawn;
      const initialized = this.runtimes.get(id);
      if (!initialized) {
        throw new Error(`Session ${id} initialization completed without a runtime`);
      }
      return initialized;
    }

    // Existing Sessions may legitimately need restoring after a process restart.
    // Coalesce concurrent callers so only one restore can run per Session.
    const pendingRestore = this.pendingRuntimeRestores.get(id);
    if (pendingRestore) return pendingRestore;
    const restore = this.restoreRuntime(id).finally(() => {
      this.pendingRuntimeRestores.delete(id);
    });
    this.pendingRuntimeRestores.set(id, restore);
    return restore;
  }

  /** Create a DB record only, no embedded agent. */
  create(options: CreateSessionOptions = {}): Session {
    const spawnType = options.parentId == null ? null : (options.spawnType ?? "subagent");
    const creationMethod =
      options.creationMethod ??
      (spawnType === "subagent" ? "spawn_agent" : spawnType === null ? "user" : spawnType);
    const agent = options.agentId ? this.db.getAgent(options.agentId) : undefined;
    const agentSubagentIds =
      agent?.backendType === "native" && Array.isArray(agent.meta.subagentIds)
        ? agent.meta.subagentIds.filter((id): id is number => Number.isSafeInteger(id) && id > 0)
        : [];
    const meta = {
      ...(agentSubagentIds.length > 0 ? { subagentIds: agentSubagentIds } : {}),
      ...options.meta,
    };
    const avatar = withDefaultSessionAvatar(options.avatar ?? null, agent);
    const projectId = this.resolveProjectId(options);
    const project = projectId != null ? this.db.getProject(projectId) : null;
    // Prefer explicit cwd; otherwise seed from the bound project so extensions
    // (worktree, file tree) never fall back to the supervisor playground root.
    const initialCwd = options.cwd ?? project?.cwd ?? getDefaultCwd();
    const row = this.db.insert({
      parent_id: options.parentId ?? null,
      project_id: projectId,
      // DB-only create: active until the activity policy expires it.
      // `initializing` is reserved for in-flight spawn finalize.
      status: "active",
      thinking_level: "none",
      cwd: initialCwd,
      agent_id: options.agentId ?? null,
      spawn_type: spawnType,
      created_by: creationMethod,
      meta: JSON.stringify(meta),
      title: options.title ?? null,
      system_prompt: options.systemPrompt ?? null,
      avatar: serializeSessionAvatar(avatar),
      is_builtin: options.isBuiltin ? 1 : 0,
      pinned: options.pinned ? 1 : 0,
      muted: options.muted ? 1 : 0,
      shadow_enabled: options.shadowEnabled ? 1 : 0,
      external_session_id: options.externalSessionId ?? null,
      stage: options.stage ?? null,
    });
    return rowToSession(row, this.db);
  }

  /**
   * Spawn an embedded agent (AgentHarness + SQLite session).
   * Resources (skills/prompts/extensions) follow session.agentId — main or child session.
   *
   * With `awaitReady: false`, returns immediately as `initializing` while worktree + runtime
   * prepare in the background. Prompt paths wait via `waitUntilSpawnReady`.
   */
  async spawn(options: SpawnSessionOptions = {}): Promise<Session> {
    const agentInDb = this.getAgentForSession(options.agentId ?? null);
    if (options.agentId && !agentInDb) {
      throw new Error(`Agent ${options.agentId} not found`);
    }
    if (agentInDb) {
      const availability = externalAgentAvailability(agentInDb);
      if (!availability.available) {
        throw new Error(
          availability.unavailableReason ?? `Agent ${options.agentId} is unavailable`,
        );
      }
    }

    const session = this.create({
      ...options,
      spawnType: options.parentId ? "subagent" : null,
    });
    // Mark in-flight spawn so UI/prompt can wait; create() itself stays active.
    this.db.updateStatus(session.id, "initializing");

    const ready = this.finalizeSpawn(session, options, agentInDb).finally(() => {
      this.pendingSpawns.delete(session.id);
    });
    this.pendingSpawns.set(session.id, ready);

    if (options.awaitReady === false) {
      void ready.catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        writeLog("error", "runtime.sessionRuntimeStartFailed", { id: session.id, error: message });
        try {
          sessionLog(
            session.id,
            "error",
            `Runtime start failed: ${message}`,
            ["system", "runtime"],
            {
              error: message,
            },
          );
          if (this.db.get(session.id)?.status === "initializing") {
            this.db.updateStatus(session.id, "error");
          }
          this.db.updateSessionFields(session.id, { errorMsg: message });
          this.reportOperationalError(session.id, message);
          this.publishSessionStatus(session.id);
        } catch {
          // The owner may dispose the database while a fire-and-forget spawn is unwinding.
        }
      });
      return rowToSession(this.db.get(session.id)!, this.db);
    }

    return ready;
  }

  /** Wait until create-time worktree/runtime prep finishes (no-op if already ready). */
  async waitUntilSpawnReady(id: number): Promise<Session> {
    const pending = this.pendingSpawns.get(id);
    if (pending) return pending;
    const session = this.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    if (session.status === "initializing") {
      throw new Error(`Session ${id} is still initializing`);
    }
    return session;
  }

  private publishSessionStatus(sessionId: number): void {
    const session = this.db.get(sessionId);
    if (!session) return;
    const event: SessionStatusEvent = {
      type: "session_status",
      status: session.status,
      timestamp: Date.now(),
    };
    for (const listener of this.outputListeners.get(sessionId) ?? []) {
      listener(sessionId, event);
    }
  }

  private async finalizeSpawn(
    session: Session,
    options: SpawnSessionOptions,
    agentInDb: Agent | undefined,
  ): Promise<Session> {
    const doneFinalize = beginSessionTiming(session.id, "finalizeSpawn");
    try {
      sessionLog(session.id, "info", "Session finalizeSpawn started", ["system", "setup"], {
        agentId: agentInDb?.id,
        backendType: agentInDb?.backendType,
        skipRuntime: !!options.skipRuntime,
      });
      await timedSessionStep(session.id, "waitForProjectParse", () =>
        this.waitForProjectParse(this.requireProjectId(session)),
      );
      const activeSession = await timedSessionStep(session.id, "prepareLifecycle", () =>
        prepareSessionLifecycleSpawn(this.db, session, options, agentInDb?.name, this.jobs),
      );
      await timedSessionStep(session.id, "ensureSessionDir", async () => {
        await ensureSessionDir(this.requireProjectId(activeSession), activeSession.id);
      });
      sessionLog(session.id, "info", "Session directory ready", ["system", "setup"], {
        cwd: activeSession.cwd,
      });

      if (options.skipRuntime) {
        sessionLog(session.id, "info", "Skipping runtime attach (skipRuntime)", [
          "system",
          "setup",
        ]);
        this.db.updateStatus(activeSession.id, "active");
        this.publishSessionStatus(activeSession.id);
        return rowToSession(this.db.get(activeSession.id)!, this.db);
      }

      if (
        agentInDb?.backendType === "native" &&
        (agentInDb.providerId == null || agentInDb.modelId == null) &&
        !(options.providerId != null && options.model)
      ) {
        this.db.updateSessionFields(activeSession.id, { errorMsg: "Agent 未配置模型" });
        this.db.updateStatus(activeSession.id, "blocked");
        this.publishSessionStatus(activeSession.id);
        return rowToSession(this.db.get(activeSession.id)!, this.db);
      }

      if (agentInDb && agentInDb.backendType !== "native") {
        sessionLog(
          activeSession.id,
          "info",
          `Creating external runtime (${agentInDb.backendType})`,
          ["system", "runtime"],
          { backendType: agentInDb.backendType, agentName: agentInDb.name },
        );
        const runtime = await timedSessionStep(activeSession.id, "createExternalRuntime", () =>
          this.attachExternalSessionExtensions(
            activeSession,
            agentInDb,
            (next) => this.createExternalRuntime(next, agentInDb),
            sessionSetupReason(options),
          ),
        );
        sessionLog(activeSession.id, "info", "External runtime ready", ["system", "runtime"], {
          backendType: agentInDb.backendType,
        });
        this.setupRuntime(activeSession.id, runtime);
        if (options.instructions) {
          void runtime.prompt(options.instructions).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            this.reportOperationalError(activeSession.id, message);
            if (this.db.get(activeSession.id)?.status === "running") {
              this.db.updateStatus(activeSession.id, "active");
            }
          });
        }
        this.db.updateStatus(activeSession.id, options.instructions ? "running" : "active");
        this.publishSessionStatus(activeSession.id);
        return rowToSession(this.db.get(activeSession.id)!, this.db);
      }

      const selectedModel =
        options.providerId != null && options.model
          ? this.db.getModel(options.providerId, options.model)
          : agentInDb?.modelId
            ? this.db.getModelById(agentInDb.modelId)
            : undefined;
      if (!selectedModel)
        throw new Error(`Agent ${agentInDb?.id ?? "unknown"} has no model configured`);
      const llm = resolveLLMConfig(selectedModel.id);

      const storage = createRuntimeSessionStorage(this.db, activeSession);
      this.enableMessageCheckpoints(storage, activeSession.id);
      const harnessSession = new AgentSession(storage);
      const env = new NodeExecutionEnv({ cwd: activeSession.cwd });

      // Use agent's toolsPreset if available, otherwise use options or default.
      // BTW always forces readonly (no write/edit).
      const toolsPreset = this.resolveToolsPresetForSession(
        activeSession,
        options.toolsPreset ?? agentInDb?.toolsPreset ?? "coding",
      );
      await this.ensureResourceCatalog();
      const resource = new AgentResource({
        sessionId: activeSession.id,
        agentId: activeSession.agentId ?? 0,
        agent: agentInDb,
        cwd: activeSession.cwd,
        db: this.db,
      });
      await resource.load();

      const sessionTools = this.assembleSessionTools(
        activeSession.id,
        activeSession.agentId,
        activeSession.cwd,
        toolsPreset,
        options.tools,
      );
      const tools = sessionTools;

      const harness = new AgentHarness({
        env,
        session: harnessSession,
        model: llm.model,
        systemPrompt: () => this.composeLiveSystemPrompt(activeSession.id),
        tools,
        getApiKeyAndHeaders: async () => ({ apiKey: llm.apiKey }),
      });
      await harness.setThinkingLevel(toHarnessThinkingLevel(activeSession.thinkingLevel));

      const runtime = new SessionRuntime({
        session: activeSession,
        harness,
        resource,
        storage,
        getSession: () => this._getSession(activeSession.id),
        getMessages: async () => {
          const storageForReads = new SQLiteSessionStorage(this.db, activeSession.id);
          return storageForReads.getEntries();
        },
      });

      await runtime.initExtensions(
        activeSession.agentId ?? 0,
        agentInDb?.name ?? "Session",
        activeSession.cwd,
        this.db,
        this,
        sessionSetupReason(options),
      );
      const refreshedAfterExtensions = this.get(activeSession.id)!;
      runtime.syncWorkingDirectory(refreshedAfterExtensions.cwd);
      if (agentInDb?.backendType === "native") {
        runtime.configureAgentPermissions(
          agentInDb.permissionRules,
          refreshedAfterExtensions.cwd,
          (request) => this.requestSessionApproval(activeSession.id, request),
        );
      }
      const extensionTools = runtime.collectExtensionTools();
      if (extensionTools.length > 0) {
        const mergedTools = new Map<string, AgentTool>();
        for (const tool of tools) mergedTools.set(tool.name, tool);
        for (const tool of extensionTools) mergedTools.set(tool.name, tool);
        await runtime.setTools([...mergedTools.values()]);
      }

      this.setupRuntime(activeSession.id, runtime);
      sessionLog(activeSession.id, "info", "Native runtime ready", ["system", "runtime"], {
        modelId: llm.model.id,
        provider: llm.model.provider,
      });

      if (options.instructions) {
        void runtime.prompt(options.instructions).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.reportOperationalError(activeSession.id, message);
          if (this.db.get(activeSession.id)?.status === "running") {
            this.db.updateStatus(activeSession.id, "active");
          }
        });
      }

      this.db.updateStatus(activeSession.id, options.instructions ? "running" : "active");
      this.publishSessionStatus(activeSession.id);
      sessionLog(
        activeSession.id,
        "info",
        `Session ready (status=${options.instructions ? "running" : "active"})`,
        ["system", "setup"],
      );
      return rowToSession(this.db.get(activeSession.id)!, this.db);
    } finally {
      doneFinalize();
    }
  }

  onOutput(sessionId: number, listener: SessionOutputListener): () => void {
    if (!this.outputListeners.has(sessionId)) {
      this.outputListeners.set(sessionId, new Set());
    }
    this.outputListeners.get(sessionId)!.add(listener);
    return () => {
      this.outputListeners.get(sessionId)?.delete(listener);
    };
  }

  /** Subscribe to agent/runtime events for every session (e.g. mobile push). */
  onAnySessionOutput(listener: SessionOutputListener): () => void {
    this.globalOutputListeners.add(listener);
    return () => {
      this.globalOutputListeners.delete(listener);
    };
  }

  upsertPushDevice(input: import("./push-device-types.js").PushDeviceInput) {
    return this.db.upsertPushDevice(input);
  }

  listPushDevices() {
    return this.db.listPushDevices();
  }

  deletePushDevice(deviceId: string) {
    return this.db.deletePushDevice(deviceId);
  }

  publishSessionEvent(sessionId: number, event: SessionOutputEvent): void {
    for (const listener of this.outputListeners.get(sessionId) ?? []) listener(sessionId, event);
  }

  reloadNativeSessionResources(agentId?: number): void {
    for (const [sessionId, runtime] of this.runtimes) {
      if (!(runtime instanceof SessionRuntime)) continue;
      const session = this.db.get(sessionId);
      if (agentId !== undefined && session?.agent_id !== agentId) continue;
      runtime.reloadResources();
    }
  }

  /** Rebuild extension modules and tool wiring for active sessions of an agent. */
  async reloadNativeAgentExtensions(agentId: number): Promise<void> {
    const agent = this.db.getAgent(agentId);
    if (!agent) return;
    await disposeAgentExtensionRuntime(this, agentId);

    for (const [sessionId, runtime] of this.runtimes) {
      const session = this._getSession(sessionId);
      if (!session || session.agentId !== agentId) continue;
      await runtime.waitForIdle().catch(() => {});

      if (runtime instanceof SessionRuntime) {
        await runtime.reloadExtensions(agentId, agent.name, session.cwd, this.db, this);
        await this.refreshRuntimeTools(sessionId, runtime, session, agent);
        continue;
      }

      if (session.projectId == null) continue;
      await runtime.extension?.clear().catch(() => {});
      const resource = new AgentResource({
        sessionId,
        agentId,
        agent,
        cwd: session.cwd,
        db: this.db,
      });
      await resource.load();
      const host = await loadSessionExtensions({
        runtime,
        agentId,
        agentName: agent.name,
        cwd: session.cwd,
        db: this.db,
        manager: this,
        resource,
        setupReason: "restore",
      });
      if (!host) continue;
      runtime.attachExtension?.(host);
    }
    this.publishAgentUiMenus(agentId);
  }

  private async refreshRuntimeTools(
    sessionId: number,
    runtime: SessionRuntime,
    session: Session,
    agent: Agent,
  ): Promise<void> {
    const toolsPreset = this.resolveToolsPresetForSession(session, agent.toolsPreset ?? "coding");
    const toolConfig = this.sessionToolConfigs.get(sessionId);
    const baseTools =
      toolConfig?.overrideTools ??
      createDefaultTools(session.cwd, toolsPreset, {
        sessionId,
        jobs: this.createBashJobHost(sessionId),
        getEnv: () => this.getSessionBashEnv(sessionId),
      });
    const merged = new Map<string, AgentTool>();
    for (const tool of baseTools) merged.set(tool.name, tool);
    const extensionTools = runtime.collectExtensionTools();
    for (const tool of extensionTools) merged.set(tool.name, tool);
    await runtime.setTools([...merged.values()]);
  }

  private async requestSessionApproval(
    sessionId: number,
    request: ApprovalRequest,
  ): Promise<ApprovalResult> {
    const service = new UiApprovalService(sessionId, {
      pausing: async <T>(reason: string, work: Promise<T> | (() => Promise<T>)): Promise<T> => {
        const before = this.db.get(sessionId)?.status;
        this.db.updateStatus(sessionId, "blocked");
        this.publishSessionStatus(sessionId);
        try {
          return typeof work === "function" ? await work() : await work;
        } finally {
          if (this.db.get(sessionId)?.status === "blocked") {
            this.db.updateStatus(sessionId, before === "running" ? "running" : "active");
            this.publishSessionStatus(sessionId);
          }
          if (reason.trim())
            writeLog("debug", "runtime.permissionResolved", { id: sessionId, reason });
        }
      },
      broadcast: (event) => this.publishSessionEvent(sessionId, event as SessionOutputEvent),
    });
    return service.requestApproval(request);
  }

  publishShadowSuggestions(sessionId: number, questions: string[]): void {
    const event: ShadowSuggestionsEvent = {
      type: "shadow_suggestions",
      questions,
      timestamp: Date.now(),
    };
    for (const listener of this.outputListeners.get(sessionId) ?? []) {
      listener(sessionId, event);
    }
  }

  publishShadowRunning(sessionId: number, running: boolean): void {
    const event: ShadowRunningEvent = {
      type: "shadow_running",
      running,
      timestamp: Date.now(),
    };
    for (const listener of this.outputListeners.get(sessionId) ?? []) {
      listener(sessionId, event);
    }
  }

  publishShadowAnalysis(sessionId: number): void {
    const event: ShadowAnalysisEvent = {
      type: "shadow_analysis",
      timestamp: Date.now(),
    };
    for (const listener of this.outputListeners.get(sessionId) ?? []) {
      listener(sessionId, event);
    }
  }

  /** Push a toast-style notify to connected Web UI clients. Never flips session status. */
  publishUiNotify(sessionId: number, message: string, kind: UiNotifyEvent["kind"] = "error"): void {
    const text = message.trim();
    if (!text) return;
    const event: UiNotifyEvent = {
      type: "ui_notify",
      kind,
      message: text.slice(0, 2000),
      timestamp: Date.now(),
    };
    for (const listener of this.outputListeners.get(sessionId) ?? []) {
      listener(sessionId, event);
    }
  }

  private reportOperationalError(sessionId: number, message: string): void {
    writeLog("error", "runtime.sessionError", { id: sessionId, error: message });
    this.publishUiNotify(sessionId, message, "error");
  }

  async prompt(
    id: number,
    message: string,
    images?: SessionPromptImage[],
    source?: string | null,
    origin?: string,
  ): Promise<void> {
    const donePrompt = beginSessionTiming(id, "prompt");
    try {
      await timedSessionStep(id, "waitUntilSpawnReady", () => this.waitUntilSpawnReady(id));
      const session = this.db.get(id);
      if (!session) throw new Error(`Session ${id} not found`);
      if (session.status === "initializing") {
        throw new Error(`Session ${id} is still initializing`);
      }
      if (session.status === "blocked" && session.error_msg) {
        throw new Error(`Session ${id} is blocked: ${session.error_msg}`);
      }
      this.assertSessionProviderEnabled(id);
      const runtime = await timedSessionStep(id, "getOrRestoreRuntime", () =>
        this.getOrRestoreRuntime(id),
      );

      let promptMessage = message;
      let promptOrigin = origin;
      if (session.spawn_type === "btw" && (await this.isFirstBtwUserPrompt(id))) {
        promptMessage = this.formatBtwFirstUserPrompt(message);
        promptOrigin = origin ?? message;
      }

      await timedSessionStep(id, "runtime.prompt", () =>
        runtime.prompt(promptMessage, images, source, promptOrigin),
      );
    } finally {
      donePrompt();
    }
  }

  private assertSessionProviderEnabled(sessionId: number): void {
    const session = this.db.get(sessionId);
    if (!session?.agent_id) return;
    const agent = this.db.getAgent(session.agent_id);
    if (!agent?.providerId) return;
    const provider = this.db.getProvider(agent.providerId);
    if (provider && !provider.isEnabled) {
      throw new Error(`Model provider "${provider.name}" is disabled`);
    }
  }

  async submitSessionInput(
    id: number,
    input: {
      message: string;
      level?: number;
      source?: string | null;
      images?: SessionPromptImage[];
      origin?: string;
    },
  ): Promise<SessionInputDisposition> {
    await this.waitUntilSpawnReady(id);
    const level = input.level ?? DEFAULT_SESSION_INPUT_LEVEL;
    const entry: SessionQueuedInput = {
      id: randomUUID(),
      message: input.message,
      level,
      source: input.source ?? null,
      enqueuedAt: Date.now(),
      images: input.images,
      origin: input.origin,
    };

    if (shouldInterruptSessionInput(level)) {
      await this.interruptAndPrompt(id, entry.message, entry.images, entry.source, entry.origin);
      return "interrupt";
    }

    this.db.enqueueSessionInput({ ...entry, sessionId: id });
    this.sessionInputQueues.enqueue(id, entry);

    if (this.drainingSessionInputs.has(id) || (await this.isSessionBusy(id))) {
      return "queued";
    }

    return (await this.drainSessionInputQueue(id)) ? "drained" : "queued";
  }

  async submitSubagentInput(
    parentSessionId: number,
    childSessionId: number,
    message: string,
    options?: { source?: string; background?: boolean; urgency?: "normal" | "urgent" },
  ): Promise<SessionInputDisposition> {
    const child = this.get(childSessionId);
    if (!child || child.parentId !== parentSessionId || child.creationMethod !== "spawn_agent") {
      throw new Error(
        `Session ${childSessionId} is not a direct spawned subagent of ${parentSessionId}`,
      );
    }
    if (child.status === "error" || child.status === "stopped") {
      throw new Error(`Session ${childSessionId} cannot be continued (status: ${child.status})`);
    }
    if (child.status === "finish" || child.status === "finished") {
      throw new Error(
        `Session ${childSessionId} is finished; Fork it before submitting more input`,
      );
    }

    const submit = () =>
      this.submitSessionInput(childSessionId, {
        message,
        level:
          options?.urgency === "urgent"
            ? SESSION_INPUT_INTERRUPT_LEVEL
            : DEFAULT_SESSION_INPUT_LEVEL,
        source: options?.source ?? `subagent:parent:${parentSessionId}`,
      });
    if (!options?.background) return submit();

    void submit().catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      this.reportOperationalError(childSessionId, detail);
      if (this.db.get(childSessionId)?.status === "running") {
        this.db.updateStatus(childSessionId, "active");
      }
    });
    return "drained";
  }

  private async isSessionBusy(sessionId: number): Promise<boolean> {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return false;
    return (await runtime.getState()).isStreaming;
  }

  async interruptAndPrompt(
    id: number,
    message: string,
    images?: SessionPromptImage[],
    source?: string | null,
    origin?: string,
  ): Promise<void> {
    if (this.runtimes.has(id)) {
      const runtime = this.runtimes.get(id)!;
      const state = await runtime.getState();
      if (state.isStreaming) {
        await runtime.abort();
        await runtime.waitForIdle();
      }
    }
    await this.prompt(id, message, images, source, origin);
  }

  peekSessionInput(sessionId: number): SessionQueuedInput | undefined {
    return this.sessionInputQueues.peek(sessionId);
  }

  listSessionInputs(sessionId: number): SessionQueuedInput[] {
    if (!this.db.get(sessionId)) throw new Error(`Session ${sessionId} not found`);
    return this.sessionInputQueues.list(sessionId);
  }

  /** Remove a queued input without sending it. */
  cancelSessionInput(sessionId: number, inputId: string): SessionQueuedInput {
    if (!this.db.get(sessionId)) throw new Error(`Session ${sessionId} not found`);
    const removed = this.sessionInputQueues.remove(sessionId, inputId);
    if (!removed) throw new Error(`Queued input ${inputId} not found`);
    this.db.deleteSessionInput(inputId);
    return removed;
  }

  /**
   * Pull a queued input out of the queue and send it immediately,
   * aborting the active turn first (interrupt level).
   */
  async submitQueuedSessionInput(sessionId: number, inputId: string): Promise<SessionQueuedInput> {
    const removed = this.cancelSessionInput(sessionId, inputId);
    await this.interruptAndPrompt(
      sessionId,
      removed.message,
      removed.images,
      removed.source,
      removed.origin,
    );
    return removed;
  }

  resumePersistedSessionInputs(): void {
    for (const sessionId of this.sessionInputQueues.sessionIds()) {
      const session = this.get(sessionId);
      if (!session || session.status === "finish" || session.status === "error") continue;
      void this.drainSessionInputQueue(sessionId).catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        writeLog("error", "runtime.sessionInputFailed", { id: sessionId, error: detail });
      });
    }
  }

  async drainSessionInputQueue(sessionId: number): Promise<boolean> {
    if (this.drainingSessionInputs.has(sessionId)) return false;
    const next = this.sessionInputQueues.dequeue(sessionId);
    if (!next) return false;
    this.drainingSessionInputs.add(sessionId);
    let delivered = false;
    try {
      await this.prompt(sessionId, next.message, next.images, next.source, next.origin);
      this.db.deleteSessionInput(next.id);
      delivered = true;
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // Failures must not bounce the message back into the queue — that shows
      // as "排队中" forever. Persist the user turn (if needed) + custom error.
      await this.abandonFailedSessionInput(sessionId, next, detail).catch((persistError) => {
        writeLog("error", "runtime.sessionInputAbandonFailed", {
          id: sessionId,
          error: persistError instanceof Error ? persistError.message : String(persistError),
        });
      });
      throw error;
    } finally {
      this.drainingSessionInputs.delete(sessionId);
      if (
        delivered &&
        this.sessionInputQueues.size(sessionId) > 0 &&
        !(await this.isSessionBusy(sessionId))
      ) {
        void this.drainSessionInputQueue(sessionId).catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          writeLog("error", "runtime.sessionInputQueuedFailed", { id: sessionId, error: detail });
        });
      }
    }
  }

  /** Drop a failed queued input and surface it as an LLM error card. */
  private async abandonFailedSessionInput(
    sessionId: number,
    input: SessionQueuedInput,
    errorMessage: string,
  ): Promise<void> {
    this.db.deleteSessionInput(input.id);
    const storage = new SQLiteSessionStorage(this.db, sessionId);
    if (!this.isLatestUserMessage(sessionId, input.message)) {
      const contentParts: Array<Record<string, unknown>> = [{ type: "text", text: input.message }];
      if (input.images?.length) {
        for (const image of input.images) {
          contentParts.push({
            type: "image",
            name: image.name ?? "[Image]",
            mediaId: image.mediaId,
            mimeType: image.mimeType,
          });
        }
      }
      await storage.appendEntry(
        {
          id: randomUUID(),
          parentId: await storage.getLeafId(),
          timestamp: new Date().toISOString(),
          type: "message",
          message: {
            role: "user",
            content: contentParts,
            timestamp: Date.now(),
          },
        } as unknown as SessionTreeEntry,
        { source: input.source },
      );
    }
    const notice = errorMessage.trim() || "消息发送失败";
    // External runtimes already emit agent_end(error) → recordLlmError; avoid duplicates.
    if (!this.leafIsLlmError(sessionId)) {
      await this.recordLlmError(sessionId, notice);
    }
    sessionLog(sessionId, "error", `Session input abandoned: ${notice}`, ["system", "queue"], {
      inputId: input.id,
      error: notice,
    });
    this.publishUiNotify(sessionId, notice, "error");
    if (this.db.get(sessionId)?.status !== "error") {
      this.db.updateStatus(sessionId, "error");
      this.publishSessionStatus(sessionId);
    }
  }

  private leafIsLlmError(sessionId: number): boolean {
    const leafId = this.db.get(sessionId)?.leaf_id;
    if (!leafId) return false;
    const row = this.db.getMessageRowByEntryId(sessionId, leafId);
    if (!row?.payload || row.type !== "custom") return false;
    try {
      const entry = JSON.parse(row.payload) as SessionTreeEntry;
      return entry.type === "custom" && entry.customType === LLM_ERROR_CUSTOM_TYPE;
    } catch {
      return false;
    }
  }

  private isLatestUserMessage(sessionId: number, message: string): boolean {
    const leafId = this.db.get(sessionId)?.leaf_id;
    if (!leafId) return false;
    const row = this.db.getMessageRowByEntryId(sessionId, leafId);
    if (!row?.payload) return false;
    try {
      const entry = JSON.parse(row.payload) as SessionTreeEntry;
      if (entry.type !== "message" || entry.message?.role !== "user") return false;
      return sessionUserMessageText(entry.message) === message;
    } catch {
      return false;
    }
  }

  /** @deprecated use submitSessionInput */
  enqueueParentMessage(parentSessionId: number, entry: SessionQueuedInput): void {
    this.sessionInputQueues.enqueue(parentSessionId, entry);
  }

  /** @deprecated use peekSessionInput */
  peekParentMessage(parentSessionId: number): SessionQueuedInput | undefined {
    return this.peekSessionInput(parentSessionId);
  }

  /** @deprecated use drainSessionInputQueue */
  async deliverNextParentMessage(parentSessionId: number): Promise<boolean> {
    return this.drainSessionInputQueue(parentSessionId);
  }

  async waitForSessionIdle(sessionId: number, options?: { timeoutMs?: number }): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? 30 * 60 * 1000;
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const row = this.db.get(sessionId);
      if (!row) throw new Error(`Session ${sessionId} not found`);
      const hasPendingInput =
        this.drainingSessionInputs.has(sessionId) || this.sessionInputQueues.size(sessionId) > 0;
      if (
        !hasPendingInput &&
        row.status !== "initializing" &&
        row.status !== "running" &&
        row.status !== "blocked"
      ) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for session ${sessionId}`);
  }

  async steer(id: number, message: string, images?: SessionPromptImage[]): Promise<void> {
    this.assertSessionProviderEnabled(id);
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Session ${id} is not running`);
    await runtime.steer(message, images);
  }

  followUp(
    id: number,
    message: string,
    source?: string | null,
    images?: SessionPromptImage[],
  ): void {
    this.assertSessionProviderEnabled(id);
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Session ${id} is not running`);
    runtime.followUp(message, source, images);
  }

  async abort(
    id: number,
    options?: { retractIfNoAssistant?: boolean },
  ): Promise<{
    retracted: boolean;
  }> {
    cancelPendingAsks(id);
    cancelPendingApprovals(id);
    const runtime = await this.getOrRestoreRuntime(id);
    await runtime.abort();
    if (!options?.retractIfNoAssistant || !(runtime instanceof SessionRuntime)) {
      return { retracted: false };
    }

    const leaf = this.db.db
      .prepare(
        `SELECT m.entry_id, m.parent_entry_id
         FROM sessions s
         JOIN messages m ON m.entry_id = s.leaf_id AND m.session_id = s.id
         WHERE s.id = ? AND m.role = 'user'`,
      )
      .get(id) as { entry_id: string; parent_entry_id: string | null } | undefined;
    if (!leaf) return { retracted: false };

    this.db.db.transaction(() => {
      this.db.db
        .prepare("UPDATE sessions SET leaf_id = ?, last_active_at = ? WHERE id = ?")
        .run(leaf.parent_entry_id, Date.now(), id);
      this.db.db
        .prepare("DELETE FROM messages WHERE session_id = ? AND entry_id = ?")
        .run(id, leaf.entry_id);
    })();
    await runtime.reloadMessagesFromSessionTree();
    return { retracted: true };
  }

  submitAskAnswer(sessionId: number, toolCallId: string, answers: AskAnswer[]): boolean {
    return submitAskAnswer(sessionId, toolCallId, answers);
  }

  submitApprovalResolution(sessionId: number, approvalId: string, result: ApprovalResult): boolean {
    return submitApprovalResolution(sessionId, approvalId, result);
  }

  submitExternalInteraction(
    sessionId: number,
    interactionId: string,
    response: ExternalInteractionResponse,
  ): boolean {
    return (
      this.runtimes.get(sessionId)?.resolveExternalInteraction?.(interactionId, response) ?? false
    );
  }

  async requestExternalInteraction(
    sessionId: number,
    request: ExternalInteractionRequest,
  ): Promise<ExternalInteractionResponse> {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime?.requestExternalInteraction) {
      throw new Error(`Session ${sessionId} does not accept external interaction requests`);
    }
    return runtime.requestExternalInteraction(request);
  }

  async compact(
    id: number,
    customInstructions?: string,
  ): Promise<{
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    details?: unknown;
  }> {
    return (await this.getOrRestoreRuntime(id)).compact(customInstructions);
  }

  /** Runtime hot-switch only; the bound Agent (providerId/modelId) remains source of truth on restart. */
  async setModel(id: number, provider: string, modelId: string) {
    const runtime = await this.getOrRestoreRuntime(id);
    return runtime.setModel(provider, modelId);
  }

  async setThinkingLevel(id: number, level: ThinkingLevel): Promise<void> {
    await (await this.getOrRestoreRuntime(id)).setThinkingLevel(level);
    this.db.updateThinkingLevel(id, toSessionThinkingLevel(level));
  }

  async getState(id: number): Promise<SessionState> {
    // Do not restore a runtime just to read state — that can spawn Codex and
    // is slow / wrong while checking whether a turn is still in flight.
    const runtime = this.runtimes.get(id);
    if (runtime) return runtime.getState();
    const session = this.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    const agent = session.agentId == null ? undefined : this.db.getAgent(session.agentId);
    return {
      id: session.id,
      sessionId: session.externalSessionId,
      cwd: session.cwd,
      status: session.status,
      model: {
        provider: agent?.backendType ?? "native",
        modelId: agent?.name ?? "unknown",
      },
      thinkingLevel: toHarnessThinkingLevel(session.thinkingLevel),
      isStreaming: session.status === "running",
      messageCount: 0,
      leafId: session.leafId,
    };
  }

  async send(_id: number, _command: Record<string, unknown>): Promise<void> {
    throw new Error(
      "Raw send is not supported in embedded agent mode; use POST /sessions/:id/prompt",
    );
  }

  async kill(id: number): Promise<void> {
    const current = this.db.get(id);
    if (!current) throw new Error(`Session ${id} not found`);
    const runtime = this.runtimes.get(id);
    if (!runtime) {
      throw new Error("not running");
    }
    sessionLog(id, "info", "Runtime closing", ["system", "lifecycle"]);
    await runtime.abort().catch(() => {});
    await runtime.clear().catch(() => {});
    sessionLog(id, "info", "Runtime closed", ["system", "lifecycle"]);
    this.runtimes.delete(id);
    this.turnTrackers.delete(id);
    this.sessionToolConfigs.delete(id);
    if (current.status !== "error") {
      this.db.updateStatus(id, "finish");
      if (current.created_by === "spawn_agent" && current.parent_id != null) {
      }
    }
  }

  private async stopOwnedShellJobs(id: number): Promise<void> {
    const shells = this.jobs.list(id).filter((job) => job.kind === "shell" || job.kind === "service");
    await Promise.all(
      shells
        .filter((job) => job.status === "queued" || job.status === "running" || job.status === "waiting")
        .map((job) => this.jobs.cancel(job.id).catch(() => undefined)),
    );
  }

  private async unloadEval(id: number): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (!runtime?.extension) return;
    await runtime.extension.unload("eval").catch(() => undefined);
  }

  async complete(id: number): Promise<Session> {
    let session = rowToSession(this.db.get(id)!, this.db);
    if (!session) throw new Error(`Session ${id} not found`);
    if (session.status === "finish" || session.status === "finished") {
      if (session.creationMethod === "spawn_agent" && session.parentId != null) {
        session = rowToSession(this.db.get(id)!, this.db);
      }
      return session;
    }

    // Emit session.before_complete (extensions: stop → uninstall → worktree on achieve)
    const runtime = this.runtimes.get(id);
    if (runtime?.extension) {
      await runtime.extension.emit({
        type: "session.before_complete",
        sessionId: id,
      } as ExtensionEvent);
    }
    await this.unloadEval(id);
    await this.stopOwnedShellJobs(id);

    const isSpawnedSubagent = session.creationMethod === "spawn_agent" && session.parentId != null;
    try {
      if (!isSpawnedSubagent) {
        const backendType =
          session.agentId == null ? undefined : this.db.getAgent(session.agentId)?.backendType;
        const externalCommitMessage =
          backendType === "codex"
            ? "committed by codex"
            : backendType === "claude"
              ? "committed by cc"
              : backendType === "cursor"
                ? "committed by cursor"
                : backendType === "mimo"
                  ? "committed by mimo"
                  : undefined;
        const commit = await commitSessionChanges(
          id,
          session.cwd,
          this.db,
          externalCommitMessage ? { message: externalCommitMessage } : {},
        );
        if (commit) {
          await this.sendCustomMessage(id, formatGitCommitCustomMessage(commit)).catch(
            (error: unknown) => {
              const detail = error instanceof Error ? error.message : String(error);
              writeLog("error", "runtime.customMessageFailed", { id, error: detail });
            },
          );
        }
        session = rowToSession(this.db.get(id)!, this.db);
        if (runtime?.extension) {
          await runtime.extension.emit({
            type: "session.achieve",
            sessionId: id,
          } as ExtensionEvent);
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // Operational failure (git/merge) — toast to UI, do NOT mark session as LLM error.
      this.reportOperationalError(id, message);
      throw new Error(message);
    }

    if (this.runtimes.has(id)) {
      const runtime = this.runtimes.get(id);
      if (runtime) {
        await runtime.clear().catch(() => {});
        sessionLog(id, "info", "Runtime closed after session completion", ["system", "lifecycle"]);
      }
      this.runtimes.delete(id);
      this.turnTrackers.delete(id);
      this.sessionToolConfigs.delete(id);
    }
    this.db.updateStatus(id, "finish");
    return rowToSession(this.db.get(id)!, this.db);
  }

  async emitSessionExtensionEvent(sessionId: number, event: ExtensionEvent): Promise<void> {
    let runtime = this.runtimes.get(sessionId);
    if (!runtime?.extension) {
      try {
        runtime = await this.getOrRestoreRuntime(sessionId);
      } catch {
        return;
      }
    }
    await runtime.extension?.emit(event);
  }

  /** Notify UI subscribers that a session row may have changed (meta/status). */
  notifySessionUpdated(sessionId: number): void {
    this.publishSessionStatus(sessionId);
  }

  private publishServicesChange(sessionId: number): void {
    const session = this.db.get(sessionId);
    if (!session) return;
    const services = parseSessionServicesMeta(parseSessionMeta(session.meta));
    const event = {
      type: "session_services",
      services,
      timestamp: Date.now(),
    } as unknown as AgentEvent;
    for (const listener of this.outputListeners.get(sessionId) ?? []) {
      listener(sessionId, event);
    }
    for (const listener of this.globalOutputListeners) {
      listener(sessionId, event);
    }
  }

  async syncSession(id: number): Promise<Session> {
    const session = this.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    if (session.projectId == null) throw new Error("当前会话未绑定项目，无法同步");
    const project = this.db.getProject(session.projectId);
    if (!project) throw new Error(`Project ${session.projectId} not found`);
    const git = resolveSessionGitContext({
      sessionId: session.id,
      cwd: session.cwd,
      projectCwd: project.cwd,
    });
    if (!git) throw new Error("当前会话未启用独立 worktree，无需同步");

    const runtime = await this.ensureRuntime(id);
    if (!runtime.extension) throw new Error("Session extensions are not loaded");

    try {
      await runtime.extension.emit({
        type: "session.before_sync",
        sessionId: id,
      } as ExtensionEvent);
      await runtime.extension.emit({
        type: "session.after_sync",
        sessionId: id,
      } as ExtensionEvent);
      sessionLog(session.id, "info", "Session synchronized from project branch", [
        "system",
        "git",
        "services",
      ]);
      this.publishServicesChange(session.id);
      return this.get(id)!;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const services = parseSessionServicesMeta(session.meta);
      if (services?.startCommand) {
        this.db.updateMeta(session.id, {
          services: {
            ...services,
            status: "error",
            error: message,
          },
        });
        this.publishServicesChange(session.id);
      }
      throw error;
    }
  }

  list(filter?: Parameters<SupervisorDb["list"]>[0]): Session[] {
    return this._listSessions(filter).map((session) =>
      this.reconcileSessionServiceRuntime(session),
    );
  }

  get(id: number): Session | undefined {
    const session = this._getSession(id);
    return session ? this.reconcileSessionServiceRuntime(session) : undefined;
  }

  children(parentId: number): Session[] {
    return this._childrenSessions(parentId);
  }

  listProjects() {
    return this.db.listProjects();
  }

  getProject(id: number) {
    return this.db.getProject(id);
  }

  createProject(options: { name?: string; description?: string | null; cwd: string }) {
    ensureGitRepositorySync(options.cwd);
    const project = this.db.insertProject({
      ...options,
    });
    const created = this.db.getProject(project.id)!;
    const parsing = this.parseProject(created.id);
    this.pendingProjectParses.set(created.id, parsing);
    void parsing
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        sessionLog(0, "error", `Project parse failed [${created.id}]: ${message}`, [
          "system",
          "project",
        ]);
      })
      .finally(() => this.pendingProjectParses.delete(created.id));
    return created;
  }

  private async waitForProjectParse(projectId: number): Promise<void> {
    const pending = this.pendingProjectParses.get(projectId);
    if (pending) {
      await pending;
    }

    let current = this.db.getProject(projectId);
    if (!current) throw new Error(`Project ${projectId} not found`);
    let services = current.meta.services;
    if (!services || typeof services !== "object") {
      await this.parseProject(projectId);
      current = this.db.getProject(projectId);
      if (!current) throw new Error(`Project ${projectId} not found`);
      services = current.meta.services;
    }

    const status = (services as { status?: string } | undefined)?.status;
    if (status === "ready") return;
    if (status === "error") {
      // Parsing is complete even when Watson reported an error. The Session
      // can still be created, but the service extension will not start any
      // incomplete definitions and the persisted project status remains
      // visible to the user.
      return;
    }
    if (status === "pending") {
      throw new Error(`Project ${projectId} parsing did not complete`);
    }
  }

  updateProject(
    id: number,
    patch: { name?: string; description?: string | null; meta?: Record<string, unknown> },
  ) {
    return this.db.updateProject(id, patch);
  }

  /**
   * 解析并初始化项目：写 AGENTS.md 和描述。
   */
  async parseProject(projectId: number): Promise<{
    description: string | null;
    status: "ready" | "skipped" | "error";
    error?: string;
  }> {
    const project = this.db.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    this.db.updateProject(projectId, {
      meta: {
        ...project.meta,
        services: {
          status: "pending",
          definitions: [],
          views: [],
          updatedAt: new Date().toISOString(),
        },
      },
    });

    const ref = readSupervisorSettings().featureModels?.assistant;
    if (!isFeatureModelRef(ref)) {
      const message = "未配置「助手模型」";
      const current = this.db.getProject(projectId)!;
      this.db.updateProject(projectId, {
        meta: {
          ...current.meta,
          services: {
            status: "error",
            definitions: [],
            views: [],
            error: message,
            updatedAt: new Date().toISOString(),
          },
        },
      });
      return { description: null, status: "skipped", error: message };
    }

    try {
      const spec = await runProjectRuntimeParse({ db: this.db, project });
      await applyProjectRuntimeParse(this.db, projectId, spec);
      return { description: spec.description, status: "ready" };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const current = this.db.getProject(projectId);
      if (current) {
        this.db.updateProject(projectId, {
          meta: {
            ...current.meta,
            services: {
              status: "error",
              definitions: [],
              views: [],
              error: message,
              updatedAt: new Date().toISOString(),
            },
          },
        });
      }
      sessionLog(0, "error", `Project parse failed [${projectId}]: ${message}`, [
        "system",
        "project",
      ]);
      throw error;
    }
  }

  listImportableExternalSessions(limit?: number, offset?: number) {
    return this.annotateImportedExternalSessions(listExternalSessions(limit, offset));
  }

  private async annotateImportedExternalSessions(
    pending: Promise<Awaited<ReturnType<typeof listExternalSessions>>>,
  ): Promise<Awaited<ReturnType<typeof listExternalSessions>>> {
    const page = await pending;
    const importedByExternalId = new Map<string, number>();
    for (const session of this.list()) {
      const externalId = session.externalSessionId;
      if (!externalId) continue;
      if (!importedByExternalId.has(externalId)) {
        importedByExternalId.set(externalId, session.id);
      }
    }
    return {
      ...page,
      items: page.items.map((candidate) => {
        const importedSessionId = importedByExternalId.get(candidate.externalSessionId);
        return importedSessionId == null
          ? { ...candidate, imported: false }
          : { ...candidate, imported: true, importedSessionId };
      }),
    };
  }

  async importExternalSession(options: {
    backend: ImportableExternalBackend;
    externalSessionId: string;
    /** Delete the previously imported session and import again. */
    replace?: boolean;
  }): Promise<Session> {
    const existing = this.list().find(
      (session) => session.externalSessionId === options.externalSessionId,
    );
    if (existing) {
      if (!options.replace) {
        throw new Error(`该外部对话已导入为会话 #${existing.id}，不可重复引入`);
      }
      await this.delete(existing.id);
    }

    const imported = await loadExternalSession(options.backend, options.externalSessionId);
    const agent = this.db.listAgents().find((item) => item.backendType === options.backend);
    if (!agent) throw new Error(`${options.backend} Agent is not configured`);

    const normalizedCwd = resolve(imported.candidate.cwd);
    const comparableCwd = (value: string) =>
      process.platform === "win32" ? resolve(value).toLowerCase() : resolve(value);
    const project =
      this.db
        .listProjects()
        .find((item) => comparableCwd(item.cwd) === comparableCwd(normalizedCwd)) ??
      this.createProject({ cwd: normalizedCwd });
    const commitMessage =
      options.backend === "codex"
        ? "checkpoint before importing codex session"
        : "checkpoint before importing claude code session";
    await commitAll(normalizedCwd, commitMessage);

    // Import history first; attach Codex/Claude later so a runtime crash cannot
    // leave an empty session row without messages.
    const session = await this.spawn({
      projectId: project.id,
      cwd: normalizedCwd,
      agentId: agent.id,
      skipRuntime: true,
      title: imported.candidate.title,
      externalSessionId: imported.candidate.externalSessionId,
    });
    const entries = await materializeImportedImages(session.id, imported.entries);
    const importedLastActiveAt = entries.reduce((latest, entry) => {
      const parsed = Date.parse(entry.timestamp);
      return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
    }, 0);
    const storage = new SQLiteSessionStorage(this.db, session.id);
    for (const entry of entries) {
      await storage.appendEntry(entry, {
        source: `external-import:${options.backend}`,
      });
    }

    try {
      await this.ensureRuntime(session.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      writeLog("error", "runtime.externalImportFailed", { id: session.id, error: message });
      sessionLog(session.id, "error", `Runtime start failed: ${message}`, ["system", "runtime"], {
        error: message,
      });
      this.db.updateSessionFields(session.id, { errorMsg: message });
    }

    if (importedLastActiveAt > 0) {
      this.db.db
        .prepare("UPDATE sessions SET last_active_at = ? WHERE id = ?")
        .run(importedLastActiveAt, session.id);
    }

    return rowToSession(this.db.get(session.id)!, this.db);
  }

  async deleteProject(id: number): Promise<void> {
    for (const session of this.db.list({ projectId: id })) {
      if (this.db.get(session.id)) await this.delete(session.id, { allowBuiltin: true });
    }
    this.db.deleteProject(id);
    removeProjectDirSync(id);
  }

  // ============ Agent Methods ============

  listAgents(): AgentWithSystemMd[] {
    ensurePackagedAgents(this.db);
    return this.db.listAgents().map((agent) => this.enrichAgentWithSystemMd(agent));
  }

  getAgent(id: number): AgentWithSystemMd | undefined {
    const agent = this.db.getAgent(id);
    if (!agent) return undefined;
    return this.enrichAgentWithSystemMd(agent);
  }

  private enrichAgentWithSystemMd(agent: Agent): AgentWithSystemMd {
    const availability = externalAgentAvailability(agent);
    const uiMenus = this.listAgentUiMenus(agent.id);
    if (agent.backendType !== "native") {
      return {
        ...agent,
        homeDir: null,
        systemMd: agent.systemPrompt ?? "",
        ...availability,
        uiMenus,
      };
    }
    const homeDir = agent.homeDir ?? getAgentHomeDir(agent.id);
    return { ...agent, homeDir, systemMd: agent.systemPrompt ?? "", ...availability, uiMenus };
  }

  detectExternalAgents(): AgentWithSystemMd[] {
    return this.listAgents();
  }

  async installExternalAgent(id: number): Promise<AgentWithSystemMd> {
    const agent = this.db.getAgent(id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    if (agent.backendType === "native") throw new Error("原生 Agent 无需安装");
    const installCommand = getExternalAgentInstallCommand(agent);
    if (!installCommand) throw new Error("未配置安装命令");
    const shellCommand = resolveExternalAgentInstallShellCommand(installCommand);
    const result = await runShellCommand(shellCommand, homedir(), process.env, {
      timeoutMs: 20 * 60 * 1000,
    });
    if (result.code !== 0) {
      const detail =
        result.stderr.trim() || result.stdout.trim() || `安装失败 (code ${result.code})`;
      throw new Error(detail);
    }
    return this.enrichAgentWithSystemMd(agent);
  }

  async repairExternalAgent(
    id: number,
  ): Promise<{ agent: AgentWithSystemMd; summary: string; fixed: boolean }> {
    const agent = this.db.getAgent(id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    if (agent.backendType === "native") throw new Error("原生 Agent 无需修复");

    const before = externalAgentAvailability(agent);
    if (before.available) {
      return {
        agent: this.enrichAgentWithSystemMd(agent),
        summary: "已可用，无需修复",
        fixed: true,
      };
    }

    const repair = await runExternalAgentRepair(agent);
    const currentConfig = getExternalAgentConfig(agent);
    const nextCommand = repair.command?.trim() || currentConfig.command;
    const nextArgs = repair.args ?? currentConfig.args;
    const changed =
      nextCommand !== currentConfig.command ||
      JSON.stringify(nextArgs) !== JSON.stringify(currentConfig.args);

    if (changed) {
      this.db.updateAgent(id, {
        external_config: JSON.stringify({
          ...(agent.externalConfig ?? {}),
          command: nextCommand,
          args: nextArgs,
          env: currentConfig.env,
          ...(currentConfig.permissionPolicy
            ? { permissionPolicy: currentConfig.permissionPolicy }
            : {}),
          ...(agent.externalConfig?.detectArgs
            ? { detectArgs: agent.externalConfig.detectArgs }
            : {}),
          ...(agent.externalConfig?.installCommand
            ? { installCommand: agent.externalConfig.installCommand }
            : {}),
        }),
      });
    }

    const updated = this.db.getAgent(id);
    if (!updated) throw new Error(`Agent ${id} not found`);
    const after = externalAgentAvailability(updated);
    return {
      agent: this.enrichAgentWithSystemMd(updated),
      summary: repair.summary,
      fixed: after.available || repair.fixed,
    };
  }

  insertAgent(
    row: Parameters<SupervisorDb["insertAgent"]>[0],
    options?: { systemMd?: string },
  ): AgentWithSystemMd {
    const agent = this.db.insertAgent({
      ...row,
      system_prompt: options?.systemMd ?? row.system_prompt,
    });
    ensureBuiltinExtensionResources(this.db);
    ensureAgentBuiltinExtensionBindings(this.db, agent.id);
    this.publishAgentUiMenus(agent.id);
    return this.enrichAgentWithSystemMd(agent);
  }

  getResource(resourceId: number) {
    return this.db.getResource(resourceId);
  }

  /** Unified extension list for Agent management UI (builtins + user bindings). */
  listAgentExtensions(agentId: number): Array<{
    slug: string;
    name: string;
    description: string | null;
    builtin: boolean;
    enabled: boolean;
    resourceId: number;
    bindingId: number;
  }> {
    if (!this.db.getAgent(agentId)) throw new Error(`Agent ${agentId} not found`);
    ensureAgentBuiltinExtensionBindings(this.db, agentId);
    const bindings = this.db.listAgentResourceBindings(agentId, {
      kind: "extension",
      enabledOnly: false,
    });
    const bySlug = new Map(
      bindings.filter((b) => b.resource).map((b) => [b.resource!.slug, b] as const),
    );
    const rows: Array<{
      slug: string;
      name: string;
      description: string | null;
      builtin: boolean;
      enabled: boolean;
      resourceId: number;
      bindingId: number;
    }> = [];

    for (const spec of BUILTIN_EXTENSIONS) {
      const binding = bySlug.get(spec.slug);
      if (!binding?.resource) continue;
      rows.push({
        slug: spec.slug,
        name: spec.name,
        description: spec.description,
        builtin: true,
        enabled: true,
        resourceId: binding.resourceId,
        bindingId: binding.id,
      });
      bySlug.delete(spec.slug);
    }

    for (const binding of bySlug.values()) {
      const resource = binding.resource!;
      if (isBuiltinExtensionResource(resource.meta)) continue;
      rows.push({
        slug: resource.slug,
        name: resource.name ?? resource.slug,
        description: resource.description,
        builtin: false,
        enabled: true,
        resourceId: binding.resourceId,
        bindingId: binding.id,
      });
    }
    return rows;
  }

  setAgentExtensionEnabled(agentId: number, resourceId: number, enabled: boolean) {
    const binding = this.resourceManager.setResourceEnabled(agentId, resourceId, enabled);
    this.publishAgentUiMenus(agentId);
    return binding;
  }

  updateAgent(id: number, patch: Parameters<SupervisorDb["updateAgent"]>[1]): AgentWithSystemMd {
    const agent = this.db.updateAgent(id, patch);
    return this.enrichAgentWithSystemMd(agent);
  }

  setAgentSystemMd(id: number, content: string): AgentWithSystemMd {
    const agent = this.db.getAgent(id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    if (agent.backendType !== "native") {
      throw new Error("External agents manage their own system instructions");
    }
    return this.enrichAgentWithSystemMd(this.db.updateAgent(id, { system_prompt: content }));
  }

  getAgentSystemMd(id: number): string {
    const agent = this.db.getAgent(id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    if (agent.backendType !== "native") return "";
    return agent.systemPrompt ?? "";
  }

  deleteAgent(id: number) {
    this.db.deleteAgent(id);
    this.uiMenus.delete(id);
    this.publishAgentUiMenus(id);
  }

  setSessionSubagentIds(sessionId: number, agentIds: number[]): number[] {
    if (!this.db.get(sessionId)) throw new Error(`Session ${sessionId} not found`);
    const uniqueIds = [...new Set(agentIds)];
    for (const agentId of uniqueIds) {
      const spawned = this.db.getAgent(agentId);
      if (!spawned) throw new Error(`Spawned agent ${agentId} not found`);
      if (spawned.backendType !== "native") {
        throw new Error("子 Agent 成员只能使用原生 Agent，不能使用外部 Agent（Codex/Claude 等）");
      }
    }
    this.db.setSessionSubagentIds(sessionId, uniqueIds);
    return uniqueIds;
  }

  updateMeta(id: number, patch: Record<string, unknown>): Record<string, unknown> {
    const merged = this.db.updateMeta(id, patch);
    if ("services" in patch) {
      this.publishServicesChange(id);
      this.publishSessionStatus(id);
    }
    return merged;
  }

  /** When a Job that backed a registered service ends, drop that app's process fields. */
  clearServiceRuntimeIfJob(sessionId: number, jobId: string): void {
    const session = this._getSession(sessionId);
    if (!session) return;
    const services = parseSessionServicesMeta(session.meta);
    if (!services) return;
    const servicesList = services.services ?? [];
    const hitApp = servicesList.some((app) => app.jobId === jobId);
    const hitSession = services.jobId === jobId;
    if (!hitApp && !hitSession) return;
    const nextServices = servicesList.map((app) =>
      app.jobId === jobId ? { ...app, jobId: undefined, pid: null } : app,
    );
    const still = nextServices.find((app) => app.jobId);
    this.db.updateMeta(sessionId, {
      services: {
        ...services,
        services: nextServices,
        jobId: still?.jobId,
        pid: still?.pid ?? null,
        resolvedStartCommand: still?.startCommand,
        status: still ? services.status : "idle",
      },
    });
    this.publishServicesChange(sessionId);
    this.publishSessionStatus(sessionId);
  }

  /** Promote known column keys (title, avatar, pinned, ...) onto the sessions row. */
  updateSessionFields(id: number, patch: SessionFieldsPatch): void {
    this.db.updateSessionFields(id, patch);
  }

  setSessionData(id: number, patch: Record<string, unknown>): Session {
    this.db.updateSessionData(id, patch);
    const session = this.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    return session;
  }

  /** Mark all unread messages as read and clear session.unread. */
  markSessionRead(id: number): Session {
    const row = this.db.get(id);
    if (!row) throw new Error(`Session ${id} not found`);
    this.db.markSessionMessagesRead(id);
    this.db.updateSessionFields(id, { unread: 0 });
    const session = this._getSession(id);
    if (!session) throw new Error(`Session ${id} not found`);
    return session;
  }

  setMeta(id: number, meta: Record<string, unknown>): void {
    this.db.setMeta(id, meta);
  }

  /** Current session stage label (replaces the former meta.workflow.stage). */
  getStage(id: number): string | null {
    const session = this.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    return session.stage;
  }

  async setStage(id: number, stage: string | null): Promise<string | null> {
    const before = this.getStage(id);
    const normalized = normalizeSessionStage(stage);
    this.db.updateSessionFields(id, { stage: normalized });
    await this.emitStageChange(id, before, normalized);
    return normalized;
  }

  async clearStage(id: number): Promise<void> {
    await this.setStage(id, null);
  }

  private async emitStageChange(
    id: number,
    before: string | null,
    after: string | null,
  ): Promise<void> {
    if (before === after) return;
    const extension = this.runtimes.get(id)?.extension;
    if (!extension) return;
    await extension.emit({
      type: "workflow.stage_changed",
      sessionId: id,
      from: before,
      to: after,
      workflow: after ? { stage: after, status: "working" } : null,
    } as any);
  }

  /** @deprecated thin adapter over getStage; kept for extension API compatibility. */
  getWorkflow(id: number): { stage: string; status: "working" } | null {
    const stage = this.getStage(id);
    return stage ? { stage, status: "working" } : null;
  }

  /** @deprecated thin adapter over setStage; kept for extension API compatibility. */
  async setWorkflow(
    id: number,
    patch: { stage?: string | null } & Record<string, unknown>,
  ): Promise<{ stage: string; status: "working" }> {
    const nextStage = typeof patch?.stage === "string" ? patch.stage : this.getStage(id);
    const applied = await this.setStage(id, nextStage ?? null);
    return { stage: applied ?? "", status: "working" };
  }

  /** @deprecated thin adapter over clearStage; kept for extension API compatibility. */
  async clearWorkflow(id: number): Promise<void> {
    await this.clearStage(id);
  }

  // ============ Session Tasks (Goal / Plan) ============

  listSessionTasks(id: number): SessionTask[] {
    return this.db.listSessionTasks(id).map(toSessionTask);
  }

  upsertSessionTask(
    id: number,
    input: { path: string; kind: SessionTaskKind; title?: string | null; status?: string | null },
  ): SessionTask {
    return toSessionTask(this.db.upsertSessionTask({ sessionId: id, ...input }));
  }

  deleteSessionTask(id: number, path: string): boolean {
    return this.db.deleteSessionTask(id, path);
  }

  setCurrentSessionTaskId(id: number, taskId: number | null): void {
    const task =
      taskId == null ? undefined : this.db.listSessionTasks(id).find((item) => item.id === taskId);
    this.db.updateMeta(id, { currentTask: task?.path ?? null });
  }

  // ============ Session Todos ============

  listSessionTodos(id: number): SessionTodoItem[] {
    return this.db.listSessionTodos(id).map(toSessionTodo);
  }

  replaceSessionTodos(
    id: number,
    todos: Array<{ title: string; status: SessionTodoStatus }>,
  ): SessionTodoItem[] {
    return this.db.replaceSessionTodos(id, todos).map(toSessionTodo);
  }

  updateMessageMeta(
    sessionId: number,
    messageId: string,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.db.updateMessageMeta(sessionId, messageId, patch);
  }

  setMessageMeta(sessionId: number, messageId: string, meta: Record<string, unknown>): void {
    this.db.setMessageMeta(sessionId, messageId, meta);
  }

  async delete(id: number, options: { allowBuiltin?: boolean } = {}): Promise<void> {
    const row = this.db.get(id);
    const session = row ? rowToSession(row, this.db) : undefined;
    if (session?.isBuiltin && !options.allowBuiltin) {
      throw new Error("Pi 助手不能删除");
    }
    for (const child of this.children(id)) {
      if (child.spawnType === "subagent" || child.spawnType === "btw") {
        await this.delete(child.id, options);
      }
    }

    let runtime = this.runtimes.get(id);
    if (!runtime?.extension && session?.projectId != null) {
      try {
        runtime = await this.ensureRuntime(id);
      } catch (error: unknown) {
        writeLog("error", "runtime.clearOnDeleteFailed", {
          id,
          step: "attach_for_delete",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (runtime?.extension) {
      sessionLog(id, "debug", "session.before_delete start", ["system", "lifecycle"]);
      try {
        await runtime.extension.emit({
          type: "session.before_delete",
          sessionId: id,
        } as ExtensionEvent);
        sessionLog(id, "debug", "session.before_delete done", ["system", "lifecycle"]);
      } catch (error: unknown) {
        sessionLog(id, "error", "session.before_delete failed", ["system", "lifecycle"], {
          error: error instanceof Error ? error.message : String(error),
        });
        writeLog("error", "runtime.clearOnDeleteFailed", {
          id,
          step: "before_delete",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await this.unloadEval(id);
    await this.stopOwnedShellJobs(id);

    if (runtime) {
      this.runtimes.delete(id);
      this.turnTrackers.delete(id);
      this.sessionToolConfigs.delete(id);
    }
    this.systemPromptOverlays.delete(id);
    clearSessionActivityPolicy(id);

    const projectId = session?.projectId ?? null;
    sessionLog(
      id,
      "info",
      `Session deleted${projectId == null ? "" : ` projectId=${projectId}`}`,
      ["system", "lifecycle"],
      projectId == null ? undefined : { projectId },
    );
    appendSystemLog(
      `Session deleted id=${id}${projectId == null ? "" : ` projectId=${projectId}`}`,
      "info",
      ["session", "lifecycle"],
    );
    this.db.delete(id);

    // The Session and its messages disappear atomically with the DB delete above. Slow runtime
    // and filesystem cleanup continues independently; failures are durable work items for Watson.
    const recordCleanupFailure = (step: string, error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      writeLog("error", "runtime.clearOnDeleteFailed", { id, step, error: detail });
      try {
        this.db.recordSessionCleanupFailure({
          sessionId: id,
          projectId,
          step,
          error: detail,
          context: {},
        });
      } catch (recordError: unknown) {
        writeLog("error", "runtime.clearOnDeleteFailed", {
          id,
          step,
          error: recordError instanceof Error ? recordError.message : String(recordError),
        });
      }
    };
    void (async () => {
      if (session?.projectId != null) {
        try {
          removeSessionDirSync(session.projectId, id);
        } catch (error: unknown) {
          recordCleanupFailure("session_directory", error);
        }
      }
      try {
        removeSessionMediaDirSync(id);
      } catch (error: unknown) {
        recordCleanupFailure("session_media", error);
      }
      if (runtime) {
        try {
          await runtime.clear();
          sessionLog(id, "info", "Runtime closed during session deletion", ["system", "lifecycle"]);
        } catch (error: unknown) {
          recordCleanupFailure("runtime", error);
        }
      }
    })();
  }

  // ============ Session Tree Methods ============

  createBtw(id: number): Session {
    const parent = this._getSession(id);
    if (!parent) throw new Error(`Session ${id} not found`);
    // Same agent as the parent session (external parents remap to native Coding).
    const agentId = this.resolveAgentIdForChildSession(parent.agentId);
    if (agentId == null) {
      throw new Error("父会话未绑定 Agent，无法创建顺便问");
    }
    const agent = this.db.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (agent.backendType !== "native") {
      throw new Error("顺便问（BTW）只能使用原生 Agent，不能使用外部 Agent");
    }
    return this.create({
      projectId: parent.projectId,
      parentId: parent.id,
      cwd: parent.cwd,
      agentId,
      spawnType: "btw",
      title: "顺便问",
    });
  }

  async fork(
    id: number,
    entryId: string,
    options?: {
      label?: string;
      customInstructions?: string;
      position?: "before" | "at";
      agentId?: number | null;
    },
  ): Promise<Session> {
    const session = this.db.get(id);
    if (!session) throw new Error(`Session ${id} not found`);

    const project = session.project_id == null ? undefined : this.db.getProject(session.project_id);
    const parentAgentId = (session as { agentId?: number | null }).agentId ?? session.agent_id;
    const agentId = options?.agentId ?? parentAgentId;
    if (agentId != null && !this.db.getAgent(agentId)) {
      throw new Error(`Agent ${agentId} not found`);
    }
    const checkpoints = parseCheckpoints(
      typeof session.meta === "string" ? JSON.parse(session.meta) : session.meta,
    );
    const checkpoint = checkpoints.find((item) => item.entryId === entryId);
    const createOptions: SpawnSessionOptions = {
      projectId: session.project_id,
      parentId: id,
      cwd: project?.cwd ?? session.cwd,
      agentId,
      spawnType: "fork",
      title: options?.label ?? null,
      meta: {
        forkSource: {
          sessionId: id,
          entryId,
          ...(checkpoint?.gitRef && checkpoint.gitHead
            ? { gitRef: checkpoint.gitRef, gitHead: checkpoint.gitHead }
            : {}),
        },
      },
    };
    let newSession = this.create(createOptions);
    newSession = await prepareSessionLifecycleSpawn(this.db, newSession, createOptions);

    const messages = await this.getSessionMessages(id);
    const forkPointIndex = messages.findIndex((m) => m.id === entryId);
    if (forkPointIndex === -1) {
      throw new Error(`Entry ${entryId} not found in session ${id}`);
    }

    const endIndex = resolveForkExclusiveEndIndex(messages, forkPointIndex, options?.position);
    const storage = new SQLiteSessionStorage(this.db, newSession.id);
    const inherited = messages.slice(0, endIndex);
    await copyMessagesWithInheritance(storage, inherited);

    return this._getSession(newSession.id)!;
  }

  isAlive(id: number): boolean {
    return this.runtimes.has(id);
  }

  async dispose(): Promise<void> {
    this.stopSessionActivity();
    this.detachHomeTaskSync();
    setSessionUnreadHandler(null);
    await Promise.all([...this.runtimes.keys()].map((id) => this.kill(id).catch(() => {})));
    this.runtimes.clear();
    this.turnTrackers.clear();
    this.outputListeners.clear();
    this.globalOutputListeners.clear();
    this.agentUiMenuListeners.clear();
    this.sessionToolConfigs.clear();
    this.systemPromptOverlays.clear();
    this.uiMenus.clear();
    this.db.close();
  }

  async getMessages(id: number): Promise<SessionTreeEntry[]> {
    const inst = this.db.get(id);
    if (!inst) throw new Error(`Session ${id} not found`);
    const storage = new SQLiteSessionStorage(this.db, id);
    return storage.getEntries();
  }

  async getSessionMessages(id: number): Promise<SessionMessageResponse[]> {
    const inst = this.db.get(id);
    if (!inst) throw new Error(`Session ${id} not found`);
    const storage = new SQLiteSessionStorage(this.db, id);
    const rows = await storage.getStoredMessages();
    return rows.map(toSessionMessageResponse);
  }

  getSessionMessagesPage(
    id: number,
    options?: { beforeId?: number; limit?: number; view?: "lite" | "full" },
  ): SessionMessagesPage {
    const inst = this.db.get(id);
    if (!inst) throw new Error(`Session ${id} not found`);
    return querySessionMessagesPage(this.db, id, options);
  }

  getSessionMessage(id: number, entryId: string): SessionMessageResponse {
    const inst = this.db.get(id);
    if (!inst) throw new Error(`Session ${id} not found`);
    const message = getSessionMessageByEntryId(this.db, id, entryId);
    if (!message) throw new Error(`Message ${entryId} not found in session ${id}`);
    return message;
  }

  async createCheckpoint(
    id: number,
    options?: CreateCheckpointOptions,
  ): Promise<SessionCheckpoint> {
    return createSessionCheckpoint(this.db, id, options);
  }

  listCheckpoints(id: number): SessionCheckpoint[] {
    return listSessionCheckpoints(this.db, id);
  }

  async rewindToCheckpoint(id: number, checkpointId: string): Promise<Session> {
    await rewindSessionToCheckpoint(this.db, id, checkpointId, {
      reloadRuntime: async (sessionId) => {
        const runtime = this.runtimes.get(sessionId);
        if (!runtime) return;
        try {
          await runtime.reloadMessagesFromSessionTree();
        } catch {
          // Runtime may not support tree reload in all harness modes
        }
      },
    });
    const session = this.db.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    return session as unknown as Session;
  }

  async rewindToEntry(id: number, entryId: string): Promise<Session> {
    const checkpoint = this.listCheckpoints(id).find((item) => item.entryId === entryId);
    if (!checkpoint) throw new Error("This message has no code snapshot and cannot be restored");
    return this.rewindToCheckpoint(id, checkpoint.id);
  }

  async commitSession(
    id: number,
    options?: CommitSessionOptions,
  ): Promise<CommitSessionResult | null> {
    const session = this.db.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    if (session.status === "running" || session.status === "blocked") {
      throw new Error(`Session ${id} is busy (status: ${session.status})`);
    }
    const commit = await commitSessionChanges(id, session.cwd, this.db, options);
    if (commit) await this.sendCustomMessage(id, formatGitCommitCustomMessage(commit));
    return commit;
  }

  async commitCheckpoint(
    id: number,
    checkpointId: string,
    message: string,
  ): Promise<CommitSessionResult> {
    const session = this.db.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    const checkpoint = this.listCheckpoints(id).find((item) => item.id === checkpointId);
    if (!checkpoint?.gitRef || !checkpoint.gitHead) {
      throw new Error("Checkpoint has no Git worktree snapshot");
    }
    const commit = await commitGitSnapshot(
      session.cwd,
      checkpoint.gitRef,
      checkpoint.gitHead,
      message,
    );
    await this.sendCustomMessage(id, formatGitCommitCustomMessage(commit));
    return commit;
  }

  /**
   * Append a timeline-only custom message (not sent to the LLM).
   * Same idea as extension `ctx.session.sendCustomMessage`.
   */
  async sendCustomMessage(
    sessionId: number,
    content: string,
    customType?: string,
  ): Promise<string> {
    const storage = new SQLiteSessionStorage(this.db, sessionId);
    return appendCustomMessage(storage, content, customType);
  }

  private async recordLlmError(sessionId: number, content: string): Promise<void> {
    await this.retractTrailingEmptyFailedAssistant(sessionId);
    const storage = new SQLiteSessionStorage(this.db, sessionId);
    await appendLlmErrorMessage(storage, content);
    const runtime = this.runtimes.get(sessionId);
    if (runtime instanceof SessionRuntime) {
      await runtime.reloadMessagesFromSessionTree().catch(() => {});
    }
  }

  /** Remove empty failed assistant leaves so they never re-enter the LLM context. */
  private retractTrailingEmptyFailedAssistant(sessionId: number): void {
    for (;;) {
      const leaf = this.db.db
        .prepare(
          `SELECT m.entry_id, m.parent_entry_id, m.payload, m.type
           FROM sessions s
           JOIN messages m ON m.entry_id = s.leaf_id AND m.session_id = s.id
           WHERE s.id = ?`,
        )
        .get(sessionId) as
        | { entry_id: string; parent_entry_id: string | null; payload: string; type: string }
        | undefined;
      if (!leaf || leaf.type !== "message") return;
      let entry: SessionTreeEntry;
      try {
        entry = JSON.parse(leaf.payload) as SessionTreeEntry;
      } catch {
        return;
      }
      if (entry.type !== "message" || entry.message.role !== "assistant") return;
      const assistant = entry.message as {
        role: string;
        stopReason?: string;
        content?: unknown;
      };
      if (assistant.stopReason !== "error") return;
      if (assistantHasVisibleContent(assistant)) return;

      this.db.db.transaction(() => {
        this.db.db
          .prepare("UPDATE sessions SET leaf_id = ?, last_active_at = ? WHERE id = ?")
          .run(leaf.parent_entry_id, Date.now(), sessionId);
        this.db.db
          .prepare("DELETE FROM messages WHERE session_id = ? AND entry_id = ?")
          .run(sessionId, leaf.entry_id);
      })();
    }
  }

  private deleteLlmErrorLeaf(sessionId: number): string | null {
    const leaf = this.db.db
      .prepare(
        `SELECT m.entry_id, m.parent_entry_id, m.payload, m.type
         FROM sessions s
         JOIN messages m ON m.entry_id = s.leaf_id AND m.session_id = s.id
         WHERE s.id = ?`,
      )
      .get(sessionId) as
      | { entry_id: string; parent_entry_id: string | null; payload: string; type: string }
      | undefined;
    if (!leaf || leaf.type !== "custom") return null;
    let entry: SessionTreeEntry;
    try {
      entry = JSON.parse(leaf.payload) as SessionTreeEntry;
    } catch {
      return null;
    }
    if (entry.type !== "custom" || entry.customType !== LLM_ERROR_CUSTOM_TYPE) return null;

    this.db.db.transaction(() => {
      this.db.db
        .prepare("UPDATE sessions SET leaf_id = ?, last_active_at = ? WHERE id = ?")
        .run(leaf.parent_entry_id, Date.now(), sessionId);
      this.db.db
        .prepare("DELETE FROM messages WHERE session_id = ? AND entry_id = ?")
        .run(sessionId, leaf.entry_id);
    })();
    return leaf.entry_id;
  }

  /** Retry after an LLM failure: drop the error card and continue the turn. */
  async retryAfterLlmError(id: number): Promise<Session> {
    const row = this.db.get(id);
    if (!row) throw new Error(`Session ${id} not found`);
    if (row.status !== "error") {
      throw new Error(`Session ${id} is not in error state`);
    }

    this.deleteLlmErrorLeaf(id);
    this.retractTrailingEmptyFailedAssistant(id);
    this.db.updateStatus(id, "active");

    const runtime = await this.getOrRestoreRuntime(id);
    if (!(runtime instanceof SessionRuntime)) {
      throw new Error("Retry is only supported for native agent sessions");
    }

    await runtime.reloadMessagesFromSessionTree();
    const agent = harnessAgentController(runtime.harness);
    while (agent.state.messages.length > 0) {
      const last = agent.state.messages[agent.state.messages.length - 1];
      if (last?.role !== "assistant") break;
      const stopReason = (last as { stopReason?: string }).stopReason;
      if (stopReason !== "error") break;
      agent.state.messages = agent.state.messages.slice(0, -1);
    }

    this.db.updateStatus(id, "running");
    void agent.continue?.().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      writeLog("error", "runtime.retryFailed", { id, error: message });
      this.db.updateStatus(id, "error");
      void this.recordLlmError(id, message).catch(() => {});
    });

    return rowToSession(this.db.get(id)!, this.db)!;
  }

  searchMessages(
    query: string,
    filter?: { sessionId?: number; role?: string; limit?: number },
  ): MessageSearchHit[] {
    return this.db.searchMessages(query, filter);
  }

  listTimers(sessionId: number): SessionTimer[] {
    return listSessionTimers(this.db, sessionId);
  }

  updateAgentMeta(id: number, patch: Record<string, unknown>): Record<string, unknown> {
    return this.db.updateAgentMeta(id, patch);
  }

  setAgentMeta(id: number, meta: Record<string, unknown>): void {
    this.db.setAgentMeta(id, meta);
  }

  // ============ Provider Methods ============

  listProviders() {
    return this.db.listProviders();
  }

  getProvider(id: number) {
    return this.db.getProvider(id);
  }

  listModelsByProvider(providerId: number) {
    return this.db.listModelsByProvider(providerId);
  }

  getModel(providerId: number, modelId: string) {
    return this.db.getModel(providerId, modelId);
  }

  insertModel(providerId: number, options: CreateModelOptions) {
    return this.db.insertModel({
      provider_id: providerId,
      model_id: options.modelId,
      name: options.name ?? options.modelId,
      context_window: options.contextWindow,
      supports_vision: options.supportsVision ? 1 : 0,
    });
  }

  updateModel(providerId: number, modelId: string, patch: UpdateModelOptions) {
    const dbPatch: Parameters<SupervisorDb["updateModel"]>[2] = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.contextWindow !== undefined) dbPatch.context_window = patch.contextWindow;
    if (patch.supportsVision !== undefined) dbPatch.supports_vision = patch.supportsVision ? 1 : 0;
    return this.db.updateModel(providerId, modelId, dbPatch);
  }

  deleteModel(providerId: number, modelId: string) {
    const provider = this.db.getProvider(providerId);
    if (!provider) throw new Error(`Provider ${providerId} not found`);
    this.db.deleteModel(providerId, modelId);
  }

  updateProvider(id: number, patch: Parameters<SupervisorDb["updateProvider"]>[1]) {
    this.db.updateProvider(id, patch);
  }

  insertProvider(options: {
    slug?: string | null;
    name: string;
    icon?: string | null;
    protocol: string;
    baseUrl?: string | null;
    apiKey?: string | null;
    isEnabled?: boolean;
  }): Provider {
    const id = this.db.insertProvider({
      slug: options.slug ?? null,
      name: options.name,
      icon: options.icon ?? null,
      protocol: options.protocol,
      base_url: options.baseUrl ?? null,
      api_key: options.apiKey ?? null,
      is_enabled: options.isEnabled === false ? 0 : 1,
    });
    return this.db.getProvider(id)!;
  }

  deleteProvider(id: number): void {
    this.db.deleteProvider(id);
  }

  /**
   * Resolve global resource catalog from Supervisor global/ plus npx skills global dirs.
   * Agent access is controlled by database resource bindings.
   */
  resolveGlobalResources(): ResourceLayer {
    initializeResourceCatalog(this.db, this.resourceHandlers.values());
    const globalRoot = ensureGlobalResourceRoot();
    const globalSkillRoots = listGlobalSkillRoots().map((root) => root.path);
    const globalPromptsDir = getGlobalPromptsDirectory();
    const globalExtDir = getGlobalExtensionsDirectory();

    const { skills } = loadSkills({
      cwd: globalRoot,
      skillPaths: globalSkillRoots,
    });

    const promptTemplates = loadPromptTemplates({
      cwd: globalRoot,
      promptPaths: [globalPromptsDir],
    });

    const extInfos = listExtensionInfosInDirectories([globalExtDir]);

    return {
      skills: skillsToResourceInfo(skills),
      prompts: promptsToResourceInfo(promptTemplates),
      extensions: extInfos.map((info) => ({
        id: info.id,
        rootDir: info.rootDir,
        entryPath: info.entryPath,
        fileName: info.fileName,
        name: info.name,
        version: info.version,
        description: info.description,
        files: [],
      })),
      mcp: mcpResourcesToInfo(this.db.listResources("mcp")),
    };
  }

  private async deactivateAgentExtension(agentId: number, slug: string): Promise<void> {
    const extensionId = this.extensionRegistry.get(slug)?.definition.name ?? slug;
    const activeRuntimes = [...this.runtimes.entries()]
      .filter(([sessionId]) => this._getSession(sessionId)?.agentId === agentId)
      .map(([, runtime]) => runtime);
    await Promise.all(activeRuntimes.map((runtime) => runtime.deactivateExtension(extensionId)));
  }

  getLastMessagePreview(sessionId: number): string | null {
    return this.db.getLastMessagePreview(sessionId);
  }

  getLastMessagePreviews(sessionIds: number[]): Map<number, string> {
    return this.db.getLastMessagePreviews(sessionIds);
  }

  getLastMessageSummaries(
    sessionIds: number[],
  ): Map<number, { preview: string; createdAt: number }> {
    return this.db.getLastMessageSummaries(sessionIds);
  }

  getRuntime(id: number): ManagedSessionRuntime {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Session ${id} is not running`);
    return runtime;
  }

  /** Restore idle session runtime when needed (slash commands, delayed ops). */
  async ensureRuntime(id: number): Promise<ManagedSessionRuntime> {
    await this.waitUntilSpawnReady(id);
    return this.getOrRestoreRuntime(id);
  }

  listTaskSlashCommands() {
    return TASK_SLASH_COMMANDS;
  }

  mergeSessionSlashCommands(commands: ReturnType<ManagedSessionRuntime["getSlashCommands"]>) {
    return mergeSlashCommands(commands);
  }

  async executeTaskSlashCommand(id: number, name: string, args = ""): Promise<void> {
    const session = this.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    if (session.projectId == null) throw new Error(`Session ${id} has no project`);
    if (!isTaskSlashCommand(name)) throw new Error(`slash command /${name} not found`);
    await executeTaskSlashCommand({
      db: this.db,
      sessionId: id,
      projectId: session.projectId,
      name,
      args,
    });
  }

  async listCodexModels(id: number): Promise<Record<string, any>[]> {
    const runtime = this.getRuntime(id);
    if (!(runtime instanceof CodexSessionRuntime))
      throw new Error("session is not a Codex session");
    return runtime.listModels();
  }

  async updateCodexSettings(
    id: number,
    settings: { model: string; effort?: string | null },
  ): Promise<void> {
    const runtime = this.getRuntime(id);
    if (!(runtime instanceof CodexSessionRuntime))
      throw new Error("session is not a Codex session");
    await runtime.updateThreadSettings(settings);
  }

  async executeCodexCommand(
    id: number,
    command: string,
    argument?: string,
  ): Promise<Record<string, any>> {
    const runtime = this.getRuntime(id);
    if (!(runtime instanceof CodexSessionRuntime))
      throw new Error("session is not a Codex session");
    return runtime.executeClientCommand(command, argument);
  }

  // ============ Home Tasks ============

  listHomeTasks(options?: { parentId?: number | null; projectId?: number }): HomeTask[] {
    return this.db.listHomeTasks(options);
  }

  getHomeTask(id: number): HomeTask | undefined {
    return this.db.getHomeTask(id);
  }

  createHomeTask(options: CreateHomeTaskOptions): HomeTask {
    if (options.projectId != null && !this.db.getProject(options.projectId)) {
      throw new Error(`Project ${options.projectId} not found`);
    }
    if (options.agentId != null && !this.db.getAgent(options.agentId)) {
      throw new Error(`Agent ${options.agentId} not found`);
    }
    return this.db.insertHomeTask({
      ...options,
      phase: options.phase ?? "draft",
    });
  }

  updateHomeTask(id: number, patch: UpdateHomeTaskOptions): HomeTask {
    if (patch.projectId != null && !this.db.getProject(patch.projectId)) {
      throw new Error(`Project ${patch.projectId} not found`);
    }
    if (patch.agentId != null && !this.db.getAgent(patch.agentId)) {
      throw new Error(`Agent ${patch.agentId} not found`);
    }
    const current = this.db.getHomeTask(id);
    if (!current) throw new Error(`Home task ${id} not found`);
    if (
      current.parentId != null &&
      current.sessionId != null &&
      (patch.dependsOn !== undefined ||
        patch.agentId !== undefined ||
        patch.subagentIds !== undefined ||
        patch.projectId !== undefined)
    ) {
      throw new Error("已开始执行的工作项不能再改规划字段");
    }
    const updated = this.db.updateHomeTask(id, patch);
    if (updated.parentId != null && patch.dependsOn !== undefined) {
      validateHomeTaskDependencies(this.db.listHomeTaskChildren(updated.parentId));
    }
    return updated;
  }

  deleteHomeTask(id: number): boolean {
    return this.db.deleteHomeTask(id);
  }

  private resolveDefaultSpawnAgentId(): number {
    const agents = this.db.listAgents();
    const preferred =
      agents.find((agent) => agent.name === "Pi 助手") ??
      agents.find((agent) => agent.backendType === "native") ??
      agents[0];
    if (!preferred) throw new Error("No agent configured");
    return preferred.id;
  }

  /** Watson plans work items with deps/agents; does not spawn sessions. */
  async planHomeTask(id: number): Promise<{ task: HomeTask; children: HomeTask[] }> {
    const task = this.db.getHomeTask(id);
    if (!task) throw new Error(`Home task ${id} not found`);
    if (task.parentId != null) throw new Error("Only root todos can be planned");
    if (!task.projectId) throw new Error("Todo 必须先绑定项目再规划");
    if (task.phase === "executing") throw new Error("Todo 已在执行中，不能重新规划");

    const project = this.db.getProject(task.projectId);
    if (!project) throw new Error(`Project ${task.projectId} not found`);

    const existingChildren = this.db.listHomeTaskChildren(id);
    if (existingChildren.some((child) => child.sessionId != null)) {
      throw new Error("已有工作项开始执行，不能重新规划");
    }
    for (const child of existingChildren) {
      this.db.deleteHomeTask(child.id);
    }

    this.db.updateHomeTask(id, { phase: "planning", status: "todo", error: null });

    const projects = this.db.listProjects().map((item) => ({
      id: item.id,
      name: item.name,
      cwd: item.cwd,
    }));
    const agents = this.db.listAgents().map((agent) => ({ id: agent.id, name: agent.name }));

    try {
      const run = await runWatson({
        mode: "agent",
        cwd: project.cwd,
        kind: "todo-plan",
        resultSchema: TodoPlanResultSchema,
        toolsPreset: "readonly",
        prompt: buildTodoPlanPrompt({
          title: task.title,
          description: task.description,
          project: { id: project.id, name: project.name, cwd: project.cwd },
          projects,
          agents,
        }),
      });
      const drafts = parseTodoPlanResult(run.result);
      const keyToId = new Map<string, number>();
      const children: HomeTask[] = [];

      for (const draft of drafts) {
        const child = this.db.insertHomeTask({
          title: draft.title,
          description: draft.prompt,
          projectId: draft.projectId === undefined ? project.id : draft.projectId,
          parentId: id,
          status: "todo",
          priority: task.priority,
          agentId: draft.agentId ?? null,
          subagentIds: draft.subagentIds ?? [],
          dependsOn: [],
          phase: "draft",
        });
        keyToId.set(draft.key, child.id);
        children.push(child);
      }

      for (const draft of drafts) {
        const childId = keyToId.get(draft.key);
        if (childId == null) continue;
        const dependsOn = draft.dependsOnKeys
          .map((key) => keyToId.get(key))
          .filter((depId): depId is number => depId != null);
        const updated = this.db.updateHomeTask(childId, { dependsOn });
        const index = children.findIndex((item) => item.id === childId);
        if (index >= 0) children[index] = updated;
      }

      validateHomeTaskDependencies(this.db.listHomeTaskChildren(id));

      const root = this.db.updateHomeTask(id, {
        phase: "awaiting_confirm",
        status: "todo",
        error: null,
      });
      return { task: root, children: this.db.listHomeTaskChildren(id) };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.db.updateHomeTask(id, { phase: "draft", status: "todo", error: message });
      throw error;
    }
  }

  async confirmHomeTask(id: number): Promise<{ task: HomeTask; children: HomeTask[] }> {
    const task = this.db.getHomeTask(id);
    if (!task) throw new Error(`Home task ${id} not found`);
    if (task.parentId != null) throw new Error("Only root todos can be confirmed");
    if (task.phase === "executing") {
      return { task, children: this.db.listHomeTaskChildren(id) };
    }
    if (task.phase !== "awaiting_confirm") {
      throw new Error("请先完成规划并确认后再执行");
    }

    const children = this.db.listHomeTaskChildren(id);
    if (children.length === 0) throw new Error("请先规划工作项");
    if (children.some((child) => child.sessionId != null)) {
      throw new Error("已有工作项开始执行");
    }

    validateHomeTaskDependencies(children);
    for (const child of children) {
      const projectId = child.projectId ?? task.projectId;
      if (projectId == null || !this.db.getProject(projectId)) {
        throw new Error(`工作项「${child.title}」缺少有效项目`);
      }
      const agentId = child.agentId ?? this.resolveDefaultSpawnAgentId();
      if (!this.db.getAgent(agentId)) {
        throw new Error(`工作项「${child.title}」缺少有效 Agent`);
      }
      for (const subId of child.subagentIds) {
        if (!this.db.getAgent(subId)) {
          throw new Error(`工作项「${child.title}」的子 Agent ${subId} 不存在`);
        }
      }
    }

    const root = this.db.updateHomeTask(id, {
      phase: "executing",
      status: "in_progress",
      error: null,
    });
    await this.scheduleReadyHomeTasks(id);
    return { task: this.db.getHomeTask(id) ?? root, children: this.db.listHomeTaskChildren(id) };
  }

  async scheduleReadyHomeTasks(parentId: number): Promise<HomeTask[]> {
    return scheduleReadyHomeTasks(
      {
        db: this.db,
        resolveDefaultSpawnAgentId: () => this.resolveDefaultSpawnAgentId(),
        spawn: (options) => this.spawn(options),
      },
      parentId,
    );
  }

  /** @deprecated Use planHomeTask */
  async decomposeHomeTask(id: number): Promise<{ task: HomeTask; children: HomeTask[] }> {
    return this.planHomeTask(id);
  }
}

function sessionUserMessageText(message: { content?: unknown } | undefined): string {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if ((part as { type?: string }).type === "text") {
        return typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "";
      }
      return "";
    })
    .join("");
}
