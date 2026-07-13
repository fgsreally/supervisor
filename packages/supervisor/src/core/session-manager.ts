import { homedir } from "node:os";
import { join } from "node:path";
import {
  type AgentEvent,
  AgentHarness,
  type AgentHarnessEvent,
  Session as AgentSession,
  type AgentTool,
  type SessionTreeEntry,
  type ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import {
  getEnvApiKey,
  getModel,
  type ImageContent,
  type KnownProvider,
} from "@earendil-works/pi-ai";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
  ensureGlobalResourceDirs,
  getAgentHomeDir,
  getGlobalResourceDirs,
  readAgentHomeSystemPrompt,
  writeAgentHomeSystemPrompt,
} from "../agent/agent-paths.js";
import { getDefaultCwd } from "../config/default-cwd.js";
import { initializeResourceCatalog } from "../resources/catalog-sync.js";
import { ExtensionModuleRegistry } from "../resources/extension-registry.js";
import { ResourceService } from "../resources/resource-service.js";
import type { ResourceKind } from "../resources/types.js";
import {
  loadAgentSessionResources,
  promptsToResourceInfo,
  type ResourceLayer,
  resolveAgentResources,
  resolveAgentTools,
  skillsToResourceInfo,
} from "../agent/agent-resources.js";
import { assertAgentUserSpawnable } from "../agent/internal-agents.js";
import {
  type ApprovalResult,
  cancelPendingApprovals,
  submitApprovalResolution,
} from "../extension-system/extension-session-services.js";
import {
  type AskAnswer,
  cancelPendingAsks,
  hasPendingAsks,
  submitAskAnswer,
} from "../tools/ask/tool.js";
import {
  finalizeSessionLifecycleGit,
  handleSessionLifecycleAgentEnd,
  prepareSessionLifecycleSpawn,
} from "../session-lifecycle.js";
import { appendContextFilesToSystemPrompt } from "../agent/context-files.js";
import type { SupervisorDb } from "../db/db.js";
import { createDefaultTools } from "../utils/default-tools.js";
import { listExtensionInfosInDirectories } from "../extension-system/loader.js";
import { loadPromptTemplates } from "../agent/prompt-templates.js";
import { appendReadOrchestrationHint } from "../agent/system-prompts.js";
import { copyMessagesWithInheritance } from "./session-branch.js";
import {
  createSessionCheckpoint,
  listSessionCheckpoints,
  rewindSessionToCheckpoint,
} from "./session-checkpoint.js";
import { commitSessionChanges } from "./session-git-hooks.js";
import { SupervisorSessionRuntime, type SupervisorSessionState } from "./session-runtime.js";
import { SQLiteSessionStorage, toSessionMessageResponse } from "./session-storage.js";
import { ensureSessionDir, removeProjectDirSync, removeSessionDirSync } from "./session-files.js";
import { runShadowHook } from "../shadow/hook.js";
import {
  DEFAULT_SESSION_INPUT_LEVEL,
  type SessionInputDisposition,
  SessionInputQueue,
  type SessionQueuedInput,
  shouldInterruptSessionInput,
} from "./session-input-queue.js";
import { formatSkillsForPrompt, loadSkills } from "../agent/skills.js";
import { resolveModelWithProviderOverrides } from "../utils/model-utils.js";
import type { SessionSpawner } from "../spawn/session-spawner.js";
import type { SpawnAgentToolProvider } from "../spawn/spawn-agent-tool-provider.js";
import {
  handleAgentEventForTurnFiles,
  mergeTurnIntoMeta,
  TurnFileTracker,
} from "../git/turn-file-tracker.js";
import type {
  Agent,
  AgentWithSystemMd,
  CommitSessionOptions,
  CommitSessionResult,
  CreateCheckpointOptions,
  CreateModelOptions,
  CreateSessionOptions,
  Member,
  MemberAgent,
  MessageSearchHit,
  Provider,
  Session,
  SessionCheckpoint,
  SessionMessageResponse,
  SessionRow,
  SpawnSessionOptions,
  UpdateModelOptions,
} from "../types.js";

const DEFAULT_PROVIDER: KnownProvider = "anthropic";
const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export type SessionOutputListener = (sessionId: number, event: AgentHarnessEvent) => void;

interface RuntimeConfigSnapshot {
  provider: string;
  modelId: string;
  systemPrompt: string;
  toolsPreset: "coding" | "readonly" | "none";
}

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

/** Convert a SessionRow to the Session type. */
function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    sessionId: row.session_id,
    pid: row.pid,
    status: row.status,
    thinkingLevel: row.thinking_level,
    cwd: row.cwd,
    leafId: row.leaf_id,
    agentId: row.agent_id,
    branchType: row.branch_type as Session["branchType"],
    createdAt: new Date(row.created_at),
    lastActiveAt: new Date(row.last_active_at),
    meta: typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta,
  };
}

/** Helper to parse session meta JSON when dealing with SessionRow from the DB layer. */
function parseSessionMeta<T = Record<string, unknown>>(meta: string | Record<string, unknown>): T {
  return typeof meta === "string" ? (JSON.parse(meta) as T) : (meta as T);
}
export class SessionManager {
  private db: SupervisorDb;
  private modelRegistry: ModelRegistry;
  private runtimes = new Map<number, SupervisorSessionRuntime>();
  private turnTrackers = new Map<number, TurnFileTracker>();
  private outputListeners = new Map<number, Set<SessionOutputListener>>();
  private sessionToolConfigs = new Map<number, SessionToolConfig>();
  private spawnAgentToolProviders: SpawnAgentToolProvider[] = [];
  private readonly sessionInputQueues = new SessionInputQueue();
  private readonly extensionRegistry = new ExtensionModuleRegistry();
  private readonly resourceService: ResourceService;
  private resourcesInitialized = false;

  constructor(db: SupervisorDb) {
    this.db = db;
    const agentDir = join(homedir(), ".pi", "agent");
    const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
    this.modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
    this.resourceService = new ResourceService({
      db: this.db,
      extensionRegistry: this.extensionRegistry,
      ensureCatalog: () => this.ensureResourceCatalog(),
    });
    void this.ensureResourceCatalog();
  }

  async ensureResourceCatalog(): Promise<void> {
    if (this.resourcesInitialized) return;
    initializeResourceCatalog(this.db);
    await this.extensionRegistry.refresh(this.db);
    this.resourcesInitialized = true;
  }

  getExtensionRegistry(): ExtensionModuleRegistry {
    return this.extensionRegistry;
  }

  /** Unified resource install / bind API (CLI, HTTP, extensions). */
  get resources(): ResourceService {
    return this.resourceService;
  }

  /** Cast SessionRow to the Session interface expected by the rest of the codebase. */
  private _getSession(id: number): Session | undefined {
    const row = this.db.get(id);
    if (!row) return undefined;
    return {
      id: row.id,
      projectId: row.project_id,
      parentId: row.parent_id,
      sessionId: row.session_id,
      pid: row.pid,
      status: row.status,
      thinkingLevel: row.thinking_level,
      cwd: row.cwd,
      leafId: row.leaf_id,
      agentId: row.agent_id,
      branchType: row.branch_type as any,
      createdAt: new Date(row.created_at),
      lastActiveAt: new Date(row.last_active_at),
      meta: parseSessionMeta(row.meta),
    };
  }

  private _listSessions(filter?: Parameters<SupervisorDb["list"]>[0]): Session[] {
    return this.db.list(filter).map((row) => this._getSession(row.id)!);
  }

  private _childrenSessions(parentId: number): Session[] {
    return this.db.children(parentId).map((row) => this._getSession(row.id)!);
  }

  getModelRegistry(): ModelRegistry {
    return this.modelRegistry;
  }

  /** Register spawn tools from another package (e.g. SDD). Merged into every session with an agentId. */
  registerSpawnAgentToolProvider(provider: SpawnAgentToolProvider): void {
    this.spawnAgentToolProviders.push(provider);
  }

  private getAgentForSession(agentId: number | null) {
    return agentId ? this.db.getAgent(agentId) : undefined;
  }

  private async assembleSessionTools(
    sessionId: number,
    agentId: number | null,
    cwd: string,
    toolsPreset: "coding" | "readonly" | "none",
    overrideTools?: AgentTool[],
  ): Promise<AgentTool[]> {
    const baseTools = overrideTools ?? createDefaultTools(cwd, toolsPreset);
    this.sessionToolConfigs.set(sessionId, { cwd, agentId, toolsPreset, overrideTools });
    const tools = [...baseTools];

    const spawner: SessionSpawner = {
      getSession: (id) => this.get(id),
      getAgent: (id) => this.getAgent(id),
      spawn: (opts) => this.spawn(opts),
    };

    for (const provider of this.spawnAgentToolProviders) {
      const extra = await provider.createTools({
        parentSessionId: sessionId,
        agentId,
        cwd,
        spawner,
      });
      tools.push(...extra);
    }

    const deduped = new Map<string, AgentTool>();
    for (const tool of tools) {
      deduped.set(tool.name, tool);
    }
    return [...deduped.values()];
  }

  async resolveAgentResources(agentId: number, cwd: string) {
    await this.ensureResourceCatalog();
    return resolveAgentResources(this.db, agentId, cwd, this.extensionRegistry);
  }

  async resolveAgentTools(agentId: number, cwd: string) {
    await this.ensureResourceCatalog();
    return resolveAgentTools(this.db, agentId, cwd, this.extensionRegistry);
  }

  private resolveProjectId(options: CreateSessionOptions): number {
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
    return project.workDir;
  }

  private buildSystemPrompt(
    sessionOverride: string,
    skillsText: string,
    systemMd: string,
    cwd: string,
  ): string {
    const parts = [sessionOverride, systemMd, skillsText].filter((p) => p.length > 0);
    const base = appendContextFilesToSystemPrompt(parts.join("\n\n"), cwd);
    return appendReadOrchestrationHint(base);
  }

  private setupRuntime(sessionId: number, runtime: SupervisorSessionRuntime): void {
    this.runtimes.set(sessionId, runtime);
    const existing = this.db.get(sessionId) as unknown as Session | undefined;
    const existingMeta = existing?.meta ?? {};
    const nextTurnIndex = Array.isArray(existingMeta.turns)
      ? (existingMeta.turns as unknown[]).length
      : 0;
    this.turnTrackers.set(
      sessionId,
      new TurnFileTracker(existing?.cwd ?? getDefaultCwd(), nextTurnIndex),
    );
    this.db.updateSessionId(sessionId, String(sessionId));
    this.db.updatePid(sessionId, process.pid);

    runtime.subscribe((event: AgentHarnessEvent) => {
      if (event.type === "agent_start") {
        this.db.updateStatus(sessionId, "running");
      } else if (event.type === "agent_end") {
        if (!hasPendingAsks(sessionId)) {
          this.db.updateStatus(sessionId, "idle");
        }
        void (async () => {
          if (!hasPendingAsks(sessionId)) {
            await this.drainSessionInputQueue(sessionId);
          }
          await runShadowHook(this, this.db, sessionId, event);
        })().catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`shadow hook failed [${sessionId}]:`, message);
        });
      }

      handleSessionLifecycleAgentEnd(sessionId, runtime, event, this.db);

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
    });
  }

  private extractRuntimeConfig(session: Session): RuntimeConfigSnapshot {
    const saved = session.meta?.runtimeConfig as Partial<RuntimeConfigSnapshot> | undefined;
    const provider = typeof saved?.provider === "string" ? saved.provider : DEFAULT_PROVIDER;
    const modelId = typeof saved?.modelId === "string" ? saved.modelId : DEFAULT_MODEL_ID;
    const systemPrompt = typeof saved?.systemPrompt === "string" ? saved.systemPrompt : "";
    const toolsPreset =
      saved?.toolsPreset === "readonly" ||
      saved?.toolsPreset === "none" ||
      saved?.toolsPreset === "coding"
        ? saved.toolsPreset
        : "coding";
    return { provider, modelId, systemPrompt, toolsPreset };
  }

  private async restoreRuntime(id: number): Promise<SupervisorSessionRuntime> {
    const session = rowToSession(this.db.get(id)!);
    if (!session) throw new Error(`Session ${id} not found`);
    if (
      session.status === "finish" ||
      session.status === "finished" ||
      session.status === "error" ||
      session.status === "stopped"
    ) {
      throw new Error(`Session ${id} is not resumable (status: ${session.status})`);
    }

    const config = this.extractRuntimeConfig(session);
    const model = getModel(config.provider as KnownProvider, config.modelId as never);
    if (!model) {
      throw new Error(`Model ${config.modelId} from provider ${config.provider} not found`);
    }

    const agent = this.getAgentForSession(session.agentId);
    const { skills, promptTemplates, systemMd } = loadAgentSessionResources(
      this.db,
      agent,
      session.cwd,
    );
    const skillsText = formatSkillsForPrompt(skills);

    const storage = new SQLiteSessionStorage(this.db, session.id);
    const harnessSession = new AgentSession(storage);
    const env = new NodeExecutionEnv({ cwd: session.cwd });
    const tools = await this.assembleSessionTools(
      session.id,
      session.agentId,
      session.cwd,
      config.toolsPreset,
    );

    const systemPrompt =
      config.systemPrompt.length > 0
        ? config.systemPrompt
        : this.buildSystemPrompt("", skillsText, systemMd, session.cwd);

    const harness = new AgentHarness({
      env,
      session: harnessSession,
      model,
      systemPrompt,
      tools,
      getApiKeyAndHeaders: async (m) => {
        const envKey = getEnvApiKey(m.provider);
        if (envKey) return { apiKey: envKey };
        const provider = this.db.getProvider(m.provider);
        if (provider?.apiKey) return { apiKey: provider.apiKey };
        return undefined;
      },
    });
    await harness.setThinkingLevel(session.thinkingLevel);

    const runtime = new SupervisorSessionRuntime({
      session,
      harness,
      storage,
      skills,
      promptTemplates,
      getSession: () => this._getSession(session.id),
      getMessages: async () => {
        const storageForReads = new SQLiteSessionStorage(this.db, session.id);
        return storageForReads.getEntries();
      },
    });

    await runtime.initExtensions(
      session.agentId ?? session.id,
      agent?.name ?? "Session",
      agent?.providerId ?? 0,
      config.modelId,
      session.cwd,
      this.db,
      this,
      systemPrompt,
    );
    const extensionTools = runtime.collectExtensionTools();
    if (extensionTools.length > 0) {
      const mergedTools = new Map<string, AgentTool>();
      for (const tool of tools) mergedTools.set(tool.name, tool);
      for (const tool of extensionTools) mergedTools.set(tool.name, tool);
      await runtime.setTools([...mergedTools.values()]);
    }

    this.setupRuntime(session.id, runtime);
    this.db.updateStatus(session.id, "idle");
    return runtime;
  }

  private async getOrRestoreRuntime(id: number): Promise<SupervisorSessionRuntime> {
    const runtime = this.runtimes.get(id);
    if (runtime) return runtime;
    return this.restoreRuntime(id);
  }

  /** Create a DB record only, no embedded agent. */
  create(options: CreateSessionOptions = {}): Session {
    const row = this.db.insert({
      parent_id: options.parentId ?? null,
      project_id: this.resolveProjectId(options),
      session_id: null,
      pid: null,
      status: "starting",
      thinking_level: "none",
      cwd: options.cwd ?? getDefaultCwd(),
      agent_id: options.agentId ?? null,
      branch_type: options.branchType ?? null,
      meta: JSON.stringify(options.meta ?? {}),
    });
    return rowToSession(row);
  }

  /**
   * Spawn an embedded agent (AgentHarness + SQLite session).
   * Resources (skills/prompts/extensions) follow session.agentId — main or child session.
   * Optional tools from registerSpawnAgentToolProvider() are merged when agentId is set.
   */
  async spawn(options: SpawnSessionOptions = {}): Promise<Session> {
    const agentInDb = this.getAgentForSession(options.agentId ?? null);
    if (options.agentId && !agentInDb) {
      throw new Error(`Agent ${options.agentId} not found`);
    }
    const isInternalShadowRun =
      options.meta != null &&
      typeof options.meta === "object" &&
      typeof (options.meta as Record<string, unknown>).shadowOf === "number";
    if (agentInDb && !isInternalShadowRun) {
      assertAgentUserSpawnable(agentInDb, options.agentId);
    }

    const session = this.create({
      ...options,
      branchType: options.parentId ? "spawn" : null,
    });

    const activeSession = await prepareSessionLifecycleSpawn(
      this.db,
      session,
      options,
      agentInDb?.name,
    );
    await ensureSessionDir(this.requireProjectId(activeSession), activeSession.id);

    const modelId = options.model ?? agentInDb?.modelId ?? DEFAULT_MODEL_ID;
    let model =
      agentInDb?.providerId !== undefined
        ? resolveModelWithProviderOverrides(this.db, agentInDb.providerId, modelId)
        : undefined;
    if (!model) {
      const provider = (options.provider ?? DEFAULT_PROVIDER) as KnownProvider;
      model = getModel(provider, modelId as never);
    }

    if (!model) {
      throw new Error(`Model ${modelId} from provider ${provider} not found`);
    }

    const storage = new SQLiteSessionStorage(this.db, activeSession.id);
    const harnessSession = new AgentSession(storage);
    const env = new NodeExecutionEnv({ cwd: activeSession.cwd });

    // Use agent's toolsPreset if available, otherwise use options or default
    const toolsPreset = options.toolsPreset ?? agentInDb?.toolsPreset ?? "coding";
    const tools = await this.assembleSessionTools(
      activeSession.id,
      activeSession.agentId,
      activeSession.cwd,
      toolsPreset,
      options.tools,
    );

    const { skills, promptTemplates, systemMd } = loadAgentSessionResources(
      this.db,
      agentInDb,
      activeSession.cwd,
    );
    const skillsText = formatSkillsForPrompt(skills);

    const baseSystemPrompt = options.systemPrompt ?? "";
    const systemPrompt = this.buildSystemPrompt(
      baseSystemPrompt,
      skillsText,
      systemMd,
      activeSession.cwd,
    );

    const harness = new AgentHarness({
      env,
      session: harnessSession,
      model,
      systemPrompt,
      tools,
      getApiKeyAndHeaders: async (m) => {
        const envKey = getEnvApiKey(m.provider);
        if (envKey) return { apiKey: envKey };
        const provider = this.db.getProvider(m.provider);
        if (provider?.apiKey) return { apiKey: provider.apiKey };
        return undefined;
      },
    });
    await harness.setThinkingLevel(activeSession.thinkingLevel);

    const runtimeConfig: RuntimeConfigSnapshot = {
      provider: model.provider,
      modelId: model.id,
      systemPrompt,
      toolsPreset,
    };
    this.db.updateMeta(activeSession.id, { runtimeConfig });

    const runtime = new SupervisorSessionRuntime({
      session: activeSession,
      harness,
      storage,
      skills,
      promptTemplates,
      getSession: () => this._getSession(activeSession.id),
      getMessages: async () => {
        const storageForReads = new SQLiteSessionStorage(this.db, activeSession.id);
        return storageForReads.getEntries();
      },
    });

    await runtime.initExtensions(
      activeSession.agentId ?? activeSession.id,
      agentInDb?.name ?? "Session",
      agentInDb?.providerId ?? 0,
      model.id,
      activeSession.cwd,
      this.db,
      this,
      systemPrompt,
    );
    const extensionTools = runtime.collectExtensionTools();
    if (extensionTools.length > 0) {
      const mergedTools = new Map<string, AgentTool>();
      for (const tool of tools) mergedTools.set(tool.name, tool);
      for (const tool of extensionTools) mergedTools.set(tool.name, tool);
      await runtime.setTools([...mergedTools.values()]);
    }

    this.setupRuntime(activeSession.id, runtime);

    if (options.instructions) {
      void runtime.prompt(options.instructions).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Agent prompt error [${activeSession.id}]:`, message);
        this.db.updateStatus(activeSession.id, "error");
      });
    }

    this.db.updateStatus(activeSession.id, options.instructions ? "running" : "idle");
    return rowToSession(this.db.get(activeSession.id)!);
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

  async prompt(
    id: number,
    message: string,
    images?: ImageContent[],
    source?: string | null,
  ): Promise<void> {
    const session = this.db.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    await (await this.getOrRestoreRuntime(id)).prompt(message, images, source);
  }

  async submitSessionInput(
    id: number,
    input: {
      message: string;
      level?: number;
      source?: string | null;
      images?: ImageContent[];
    },
  ): Promise<SessionInputDisposition> {
    const level = input.level ?? DEFAULT_SESSION_INPUT_LEVEL;
    const entry: SessionQueuedInput = {
      message: input.message,
      level,
      source: input.source ?? null,
      enqueuedAt: Date.now(),
      images: input.images,
    };

    if (shouldInterruptSessionInput(level)) {
      await this.interruptAndPrompt(id, entry.message, entry.images, entry.source);
      return "interrupt";
    }

    this.sessionInputQueues.enqueue(id, entry);

    if (await this.isSessionBusy(id)) {
      return "queued";
    }

    await this.drainSessionInputQueue(id);
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
    images?: ImageContent[],
    source?: string | null,
  ): Promise<void> {
    if (this.runtimes.has(id)) {
      const runtime = this.runtimes.get(id)!;
      const state = await runtime.getState();
      if (state.isStreaming) {
        await runtime.abort();
        await runtime.waitForIdle();
      }
    }
    await this.prompt(id, message, images, source);
  }

  peekSessionInput(sessionId: number): SessionQueuedInput | undefined {
    return this.sessionInputQueues.peek(sessionId);
  }

  async drainSessionInputQueue(sessionId: number): Promise<boolean> {
    const next = this.sessionInputQueues.dequeue(sessionId);
    if (!next) return false;
    await this.prompt(sessionId, next.message, next.images, next.source);
    return true;
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
      if (row.status !== "starting" && row.status !== "running" && row.status !== "waiting_user") {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for session ${sessionId}`);
  }

  steer(id: number, message: string): void {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Session ${id} is not running`);
    runtime.steer(message);
  }

  followUp(id: number, message: string, source?: string | null): void {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Session ${id} is not running`);
    runtime.followUp(message, source);
  }

  async abort(id: number): Promise<void> {
    cancelPendingAsks(id);
    cancelPendingApprovals(id);
    await (await this.getOrRestoreRuntime(id)).abort();
  }

  submitAskAnswer(sessionId: number, toolCallId: string, answers: AskAnswer[]): boolean {
    return submitAskAnswer(sessionId, toolCallId, answers);
  }

  submitApprovalResolution(sessionId: number, approvalId: string, result: ApprovalResult): boolean {
    return submitApprovalResolution(sessionId, approvalId, result);
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

  async setModel(id: number, provider: string, modelId: string) {
    const runtime = await this.getOrRestoreRuntime(id);
    const model = await runtime.setModel(provider, modelId);
    const session = rowToSession(this.db.get(id)!);
    if (session) {
      const config = this.extractRuntimeConfig(session);
      this.db.updateMeta(id, {
        runtimeConfig: {
          ...config,
          provider: model.provider,
          modelId: model.id,
        },
      });
    }
    return model;
  }

  async setThinkingLevel(id: number, level: ThinkingLevel): Promise<void> {
    await (await this.getOrRestoreRuntime(id)).setThinkingLevel(level);
    this.db.updateThinkingLevel(id, level);
  }

  async getState(id: number): Promise<SupervisorSessionState> {
    return (await this.getOrRestoreRuntime(id)).getState();
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
    await runtime.abort().catch(() => {});
    await runtime.shutdownExtensions().catch(() => {});
    this.runtimes.delete(id);
    this.turnTrackers.delete(id);
    this.sessionToolConfigs.delete(id);
    if (current.status !== "error") {
      this.db.updateStatus(id, "finish");
    }
  }

  async complete(id: number): Promise<Session> {
    const session = rowToSession(this.db.get(id)!);
    if (!session) throw new Error(`Session ${id} not found`);
    if (session.status === "finish" || session.status === "finished") return session;

    // Emit session.before_complete
    const runtime = this.runtimes.get(id);
    if (runtime?.extensionRuntime) {
      void runtime.extensionRuntime.emit({
        type: "session.before_complete",
        sessionId: id,
      } as any);
    }

    try {
      await finalizeSessionLifecycleGit(this.db, session);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const gitMeta = session.meta?.git;
      if (gitMeta && typeof gitMeta === "object") {
        this.db.updateMeta(id, {
          git: { ...(gitMeta as Record<string, unknown>), mergeError: message },
        });
      }
      this.db.updateStatus(id, "error");
      throw new Error(message);
    }

    if (this.runtimes.has(id)) {
      const runtime = this.runtimes.get(id);
      if (runtime) {
        await runtime.shutdownExtensions().catch(() => {});
      }
      this.runtimes.delete(id);
      this.turnTrackers.delete(id);
      this.sessionToolConfigs.delete(id);
    }
    this.db.updateStatus(id, "finish");
    return rowToSession(this.db.get(id)!);
  }

  list(filter?: Parameters<SupervisorDb["list"]>[0]): Session[] {
    return this._listSessions(filter);
  }

  get(id: number): Session | undefined {
    return this._getSession(id);
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

  createProject(options: { name?: string; cwd: string; meta?: Record<string, unknown> }) {
    return this.db.insertProject(options);
  }

  deleteProject(id: number): void {
    this.db.deleteProject(id);
    removeProjectDirSync(id);
  }

  // ============ Agent Methods ============

  listAgents(): AgentWithSystemMd[] {
    return this.db.listAgents().map((agent) => this.enrichAgentWithSystemMd(agent));
  }

  getAgent(id: number): AgentWithSystemMd | undefined {
    const agent = this.db.getAgent(id);
    if (!agent) return undefined;
    return this.enrichAgentWithSystemMd(agent);
  }

  private enrichAgentWithSystemMd(agent: Agent): AgentWithSystemMd {
    const homeDir = agent.homeDir ?? getAgentHomeDir(agent.id);
    return { ...agent, homeDir, systemMd: readAgentHomeSystemPrompt(homeDir) };
  }

  insertAgent(
    row: Parameters<SupervisorDb["insertAgent"]>[0],
    options?: { systemMd?: string },
  ): AgentWithSystemMd {
    const agent = this.db.insertAgent(row);
    if (options?.systemMd !== undefined) {
      const homeDir = agent.homeDir ?? getAgentHomeDir(agent.id);
      writeAgentHomeSystemPrompt(homeDir, options.systemMd);
    }
    return this.enrichAgentWithSystemMd(agent);
  }

  updateAgent(id: number, patch: Parameters<SupervisorDb["updateAgent"]>[1]): AgentWithSystemMd {
    const agent = this.db.updateAgent(id, patch);
    return this.enrichAgentWithSystemMd(agent);
  }

  setAgentSystemMd(id: number, content: string): AgentWithSystemMd {
    const agent = this.db.getAgent(id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    const homeDir = agent.homeDir ?? getAgentHomeDir(id);
    writeAgentHomeSystemPrompt(homeDir, content);
    return this.enrichAgentWithSystemMd(agent);
  }

  getAgentSystemMd(id: number): string {
    const agent = this.db.getAgent(id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    const homeDir = agent.homeDir ?? getAgentHomeDir(id);
    return readAgentHomeSystemPrompt(homeDir);
  }

  deleteAgent(id: number) {
    this.db.deleteAgent(id);
  }

  upsertMember(
    sessionId: number,
    agentId: number,
    options?: { role?: string; tags?: string[] | string },
  ): Member {
    return this.db.upsertMember({
      session_id: sessionId,
      agent_id: agentId,
      role: options?.role,
      tags: options?.tags,
    });
  }

  listMembers(sessionId: number): Member[] {
    return this.db.listMembers(sessionId);
  }

  listMemberAgentsByTag(sessionId: number, tag: string): MemberAgent[] {
    return this.db.listMemberAgentsByTag(sessionId, tag);
  }

  updateMeta(id: number, patch: Record<string, unknown>): Record<string, unknown> {
    return this.db.updateMeta(id, patch);
  }

  setMeta(id: number, meta: Record<string, unknown>): void {
    this.db.setMeta(id, meta);
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

  delete(id: number): void {
    const session = this._getSession(id);
    const runtime = this.runtimes.get(id);
    if (runtime) {
      void runtime.shutdownExtensions().catch(() => {});
      this.runtimes.delete(id);
      this.turnTrackers.delete(id);
      this.sessionToolConfigs.delete(id);
    }
    this.db.delete(id);
    if (session?.projectId != null) removeSessionDirSync(session.projectId, id);
  }

  // ============ Session Tree Methods ============

  async fork(
    id: number,
    entryId: string,
    options?: { label?: string; customInstructions?: string; position?: "before" | "at" },
  ): Promise<Session> {
    const session = this.db.get(id);
    if (!session) throw new Error(`Session ${id} not found`);

    // Create a new session as a child
    const newSession = this.create({
      projectId: session.project_id,
      parentId: id,
      cwd: session.cwd,
      agentId: (session as any).agentId ?? (session as any).agent_id,
      branchType: "fork",
      meta: options?.label ? { label: options.label } : {},
    });

    const messages = await this.getSessionMessages(id);
    const forkPointIndex = messages.findIndex((m) => m.id === entryId);
    if (forkPointIndex === -1) {
      throw new Error(`Entry ${entryId} not found in session ${id}`);
    }

    const endIndex = options?.position === "before" ? forkPointIndex : forkPointIndex + 1;
    const storage = new SQLiteSessionStorage(this.db, newSession.id);
    const inherited = messages.slice(0, endIndex);
    await copyMessagesWithInheritance(storage, inherited);

    return this._getSession(newSession.id)!;
  }

  async clone(id: number): Promise<Session> {
    const session = this.db.get(id);
    if (!session) throw new Error(`Session ${id} not found`);

    // Create a new session as a child
    const newSession = this.create({
      projectId: session.project_id,
      parentId: id,
      cwd: session.cwd,
      agentId: (session as any).agentId ?? (session as any).agent_id,
      branchType: "clone",
    });

    const messages = await this.getSessionMessages(id);
    const storage = new SQLiteSessionStorage(this.db, newSession.id);
    await copyMessagesWithInheritance(storage, messages);

    return this._getSession(newSession.id)!;
  }

  getTree(id: number): unknown {
    const session = this.db.get(id);
    if (!session) throw new Error(`Session ${id} not found`);

    // Build tree recursively
    const buildNode = (nodeId: number): { session: Session; children: unknown[] } => {
      const node = this.db.get(nodeId);
      if (!node) return { session: null as unknown as Session, children: [] };
      const children = this.children(nodeId);
      return {
        session: node as any as Session,
        children: children.map((child) => buildNode(child.id)),
      };
    };

    return buildNode(id);
  }

  isAlive(id: number): boolean {
    return this.runtimes.has(id);
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.runtimes.keys()].map((id) => this.kill(id).catch(() => {})));
    this.runtimes.clear();
    this.turnTrackers.clear();
    this.outputListeners.clear();
    this.sessionToolConfigs.clear();
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

  async commitSession(
    id: number,
    options?: CommitSessionOptions,
  ): Promise<CommitSessionResult | null> {
    const session = this.db.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    if (session.status === "running" || session.status === "waiting_user") {
      throw new Error(`Session ${id} is busy (status: ${session.status})`);
    }
    return commitSessionChanges(
      id,
      session.cwd,
      typeof session.meta === "string" ? JSON.parse(session.meta) : session.meta,
      this.db,
      options,
    );
  }

  searchMessages(
    query: string,
    filter?: { sessionId?: string; role?: string; limit?: number },
  ): MessageSearchHit[] {
    return this.db.searchMessages(query, filter);
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
      max_tokens: options.maxTokens,
      supports_multimodal: options.supportsMultimodal ? 1 : 0,
      tags: JSON.stringify(options.tags ?? []),
    });
  }

  updateModel(providerId: number, modelId: string, patch: UpdateModelOptions) {
    const dbPatch: Parameters<SupervisorDb["updateModel"]>[2] = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.contextWindow !== undefined) dbPatch.context_window = patch.contextWindow;
    if (patch.maxTokens !== undefined) dbPatch.max_tokens = patch.maxTokens;
    if (patch.supportsMultimodal !== undefined)
      dbPatch.supports_multimodal = patch.supportsMultimodal ? 1 : 0;
    if (patch.tags !== undefined) dbPatch.tags = JSON.stringify(patch.tags);
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
    apiType: string;
    baseUrl?: string | null;
    apiKey?: string | null;
    isEnabled?: boolean;
  }): Provider {
    const id = this.db.insertProvider({
      slug: options.slug ?? null,
      name: options.name,
      icon: options.icon ?? null,
      api_type: options.apiType,
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
   * Resolve global resource catalog from ~/.pi/supervisor/global/.
   * Agents link entries from here into their home via symlinks.
   */
  resolveGlobalResources(): ResourceLayer {
    ensureGlobalResourceDirs();
    initializeResourceCatalog(this.db);
    const globalRoot = ensureGlobalResourceDirs();
    const {
      skills: globalSkillsDir,
      prompts: globalPromptsDir,
      extensions: globalExtDir,
    } = getGlobalResourceDirs();

    const { skills } = loadSkills({
      cwd: globalRoot,
      agentHomeDir: globalRoot,
      skillPaths: [globalSkillsDir],
      includeDefaults: false,
      includeProject: false,
    });

    const promptTemplates = loadPromptTemplates({
      cwd: globalRoot,
      agentHomeDir: globalRoot,
      promptPaths: [globalPromptsDir],
      includeDefaults: false,
      includeProject: false,
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
        isFlatFile: info.isFlatFile,
        files: [],
      })),
    };
  }

  listResources(kind?: ResourceKind) {
    return this.resourceService.listResources(kind);
  }

  listAgentResourceBindings(agentId: number, kind?: ResourceKind) {
    return this.resourceService.listAgentBindings(agentId, kind);
  }

  async installExtension(source: string) {
    return this.resourceService.installResource({ kind: "extension", source });
  }

  async uninstallExtension(slug: string): Promise<void> {
    await this.resourceService.uninstallResource("extension", slug);
  }

  async updateExtension(slug: string) {
    return this.resourceService.updateExtension(slug);
  }

  linkAgentResourceById(agentId: number, resourceId: number): void {
    this.resourceService.bindResource({ agentId, resourceId });
  }

  linkAgentResourceBySlug(agentId: number, kind: ResourceKind, slug: string): void {
    this.resourceService.bindResource({ agentId, kind, slug });
  }

  unlinkAgentResourceById(agentId: number, resourceId: number): void {
    this.resourceService.unbindResource({ agentId, resourceId });
  }

  unlinkAgentResourceBySlug(agentId: number, kind: ResourceKind, slug: string): void {
    this.resourceService.unbindResource({ agentId, kind, slug });
  }

  /** @deprecated use linkAgentResourceBySlug / linkAgentResourceById */
  linkAgentResource(
    agentId: number,
    kind: "skills" | "extensions" | "prompts",
    globalPath: string,
  ): void {
    this.resourceService.bindResourceByGlobalPath(agentId, kind, globalPath);
  }

  getLastMessagePreview(sessionId: number): string | null {
    return this.db.getLastMessagePreview(sessionId);
  }

  getRuntime(id: number): SupervisorSessionRuntime {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Session ${id} is not running`);
    return runtime;
  }
}
