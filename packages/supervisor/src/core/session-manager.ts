import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
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
  getAgentHomeDir,
  readAgentHomeSystemPrompt,
  writeAgentHomeSystemPrompt,
} from "../agent/index.js";
import { getDefaultCwd } from "../config/default-cwd.js";
import { initializeResourceCatalog } from "../resources/catalog-sync.js";
import { ExtensionModuleRegistry } from "../extension/registry.js";
import { ResourceManager } from "../resources/resource-manager.js";
import { ensureGlobalResourceRoot } from "../resources/resource-paths.js";
import { AgentResource } from "../agent/runtime-resources.js";
import {
  promptsToResourceInfo,
  mcpResourcesToInfo,
  type ResourceLayer,
  resolveAgentResources,
  resolveAgentTools,
  skillsToResourceInfo,
} from "../agent/resource-resolver.js";
import { assertAgentUserSpawnable } from "../agent/index.js";
import { findPackagedAgentId } from "../agent/index.js";
import { cancelPendingApprovals, submitApprovalResolution } from "../extension/runtime/index.js";
import type { ApprovalResult } from "../extension/index.js";
import {
  applyWorkflowPatch,
  parseWorkflowState,
  type SessionWorkflowState,
  type WorkflowStatePatch,
} from "./session-workflow.js";
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
} from "./session-lifecycle.js";
import { appendContextFilesToSystemPrompt } from "../agent/context-files.js";
import type { SupervisorDb } from "../db/db.js";
import { createDefaultTools } from "../utils/default-tools.js";
import { commitGitSnapshot, ensureGitRepositorySync } from "../utils/git.js";
import { listExtensionInfosInDirectories } from "../extension/index.js";
import { loadPromptTemplates } from "../agent/prompt-templates.js";
import { appendReadOrchestrationHint } from "../agent/system-prompts.js";
import { copyMessagesWithInheritance } from "./session-history.js";
import { normalizeSessionBranchType } from "./session-history.js";
import {
  createSessionCheckpoint,
  listSessionCheckpoints,
  rewindSessionToCheckpoint,
} from "./session-history.js";
import { commitSessionChanges } from "./session-lifecycle.js";
import { SessionRuntime, type SessionState } from "./session-runtime.js";
import type { ManagedSessionRuntime } from "./managed-session-runtime.js";
import type {
  ExternalInteractionRequest,
  ExternalInteractionResponse,
} from "./managed-session-runtime.js";
import { AcpSessionRuntime } from "./external/acp-session-runtime.js";
import { externalAgentAvailability } from "./external/external-agent-config.js";
import { CodexSessionRuntime } from "./external/codex-session-runtime.js";
import { ClaudeSessionRuntime } from "./external/claude-session-runtime.js";
import {
  createRuntimeSessionStorage,
  SQLiteSessionStorage,
  toSessionMessageResponse,
} from "./session-storage.js";
import { ensureSessionDir, removeProjectDirSync, removeSessionDirSync } from "./session-files.js";
import { runShadow } from "../extension/builtin/shadow/index.js";
import {
  DEFAULT_SESSION_INPUT_LEVEL,
  type SessionInputDisposition,
  SessionInputQueue,
  type SessionQueuedInput,
  shouldInterruptSessionInput,
} from "./session-input-queue.js";
import { loadSkills } from "../agent/skills.js";
import { getGlobalSkillsDirectory } from "../agent/skill-resource.js";
import { getGlobalPromptsDirectory } from "../agent/prompt-resource.js";
import { getGlobalExtensionsDirectory } from "../extension/resource.js";
import { createResourceHandlers } from "../config/resource-handlers.js";
import { resolveModelWithProviderOverrides } from "../utils/model-utils.js";
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

const BTW_SYSTEM_PROMPT = `You are answering a side question attached to another working session.
Use the inherited conversation and workspace only to understand context and answer the question.
This session is strictly read-only: do not create, edit, delete, rename, or otherwise modify files; do not run commands that change the workspace; do not commit or alter Git state.
Keep the answer focused on the side question. Do not continue or redirect the parent session's task.`;

const DEFAULT_PROVIDER: KnownProvider = "anthropic";
const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export type ShadowSuggestionsEvent = {
  type: "shadow_suggestions";
  questions: string[];
  timestamp: number;
};

export type SessionOutputEvent = AgentHarnessEvent | ShadowSuggestionsEvent;
export type SessionOutputListener = (sessionId: number, event: SessionOutputEvent) => void;

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
  const meta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
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
    branchType: normalizeSessionBranchType(row.branch_type),
    creationMethod: row.created_via ?? "user",
    showInSessionList: row.show_in_session_list !== 0,
    contextLeafId: row.context_leaf_id ?? null,
    createdAt: new Date(row.created_at),
    lastActiveAt: new Date(row.last_active_at),
    meta,
    currentTask: parseCurrentTask(meta.currentTask),
  };
}

function parseCurrentTask(value: unknown): Session["currentTask"] {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Helper to parse session meta JSON when dealing with SessionRow from the DB layer. */
function parseSessionMeta<T = Record<string, unknown>>(meta: string | Record<string, unknown>): T {
  return typeof meta === "string" ? (JSON.parse(meta) as T) : (meta as T);
}
export class SessionManager {
  private db: SupervisorDb;
  private modelRegistry: ModelRegistry;
  private runtimes = new Map<number, ManagedSessionRuntime>();
  private turnTrackers = new Map<number, TurnFileTracker>();
  private outputListeners = new Map<number, Set<SessionOutputListener>>();
  private sessionToolConfigs = new Map<number, SessionToolConfig>();
  private readonly sessionInputQueues = new SessionInputQueue();
  private readonly extensionRegistry = new ExtensionModuleRegistry();
  private readonly resourceHandlers: ReturnType<typeof createResourceHandlers>;
  private readonly resourceManager: ResourceManager;
  private resourcesInitialized = false;

  constructor(db: SupervisorDb) {
    this.db = db;
    const agentDir = join(homedir(), ".pi", "agent");
    const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
    this.modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
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
  }

  async ensureResourceCatalog(): Promise<void> {
    if (this.resourcesInitialized) return;
    initializeResourceCatalog(this.db, this.resourceHandlers.values());
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
    const meta = parseSessionMeta(row.meta);
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
      branchType: normalizeSessionBranchType(row.branch_type),
      creationMethod: row.created_via ?? "user",
      showInSessionList: row.show_in_session_list !== 0,
      contextLeafId: row.context_leaf_id ?? null,
      createdAt: new Date(row.created_at),
      lastActiveAt: new Date(row.last_active_at),
      meta,
      currentTask: parseCurrentTask(meta.currentTask),
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
    const disabledTools = this.getDisabledAgentTools(agentId);
    const baseTools = (overrideTools ?? createDefaultTools(cwd, toolsPreset)).filter(
      (tool) => !disabledTools.has(tool.name),
    );
    this.sessionToolConfigs.set(sessionId, { cwd, agentId, toolsPreset, overrideTools });
    return baseTools;
  }

  private getDisabledAgentTools(agentId: number | null): Set<string> {
    const agent = agentId == null ? undefined : this.db.getAgent(agentId);
    return new Set(
      Array.isArray(agent?.meta?.disabledTools)
        ? agent.meta.disabledTools.filter((name): name is string => typeof name === "string")
        : [],
    );
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
        layers: { agent: { skills: [], prompts: [], extensions: [], mcp: [] } },
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

  private setupRuntime(sessionId: number, runtime: ManagedSessionRuntime): void {
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
        if (runtime instanceof SessionRuntime) {
          const current = this.db.get(sessionId);
          const meta = current ? parseSessionMeta(current.meta) : {};
          const shadow = meta.shadow && typeof meta.shadow === "object" ? meta.shadow : {};
          this.db.updateMeta(sessionId, { shadow: { ...shadow, suggestedQuestions: [] } });
          this.publishShadowSuggestions(sessionId, []);
        }
      } else if (event.type === "agent_end") {
        if (!hasPendingAsks(sessionId)) {
          this.db.updateStatus(sessionId, "idle");
        }
        void (async () => {
          const shadowCheckpoint =
            runtime instanceof SessionRuntime && !hasPendingAsks(sessionId)
              ? await createSessionCheckpoint(this.db, sessionId, { label: "shadow-turn" })
              : undefined;
          if (!hasPendingAsks(sessionId)) {
            await this.drainSessionInputQueue(sessionId);
          }
          if (runtime instanceof SessionRuntime && shadowCheckpoint) {
            await runShadow(this, this.db, sessionId, event, shadowCheckpoint);
          }
        })().catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`shadow hook failed [${sessionId}]:`, message);
        });
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
    });
  }

  private enableMessageCheckpoints(storage: SQLiteSessionStorage, sessionId: number): void {
    storage.onEntryAppended(async (entry) => {
      if (entry.type !== "message" || entry.message.role !== "user") return;
      try {
        await createSessionCheckpoint(this.db, sessionId, { label: "message" });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`message checkpoint failed [${sessionId}]:`, message);
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

  private createExternalRuntime(session: Session, agent: Agent): Promise<ManagedSessionRuntime> {
    const availability = externalAgentAvailability(agent);
    if (!availability.available)
      throw new Error(availability.unavailableReason ?? "外部 Agent 不可用");
    const options = { db: this.db, session, agent };
    if (agent.backendType === "codex") return CodexSessionRuntime.create(options);
    if (agent.backendType === "claude") return ClaudeSessionRuntime.create(options);
    if (agent.backendType === "kimi") return AcpSessionRuntime.create(options);
    if (agent.backendType === "acp") return AcpSessionRuntime.create(options);
    throw new Error(`Unsupported external Agent backend: ${agent.backendType}`);
  }

  private async restoreRuntime(id: number): Promise<ManagedSessionRuntime> {
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

    const agent = this.getAgentForSession(session.agentId);
    if (agent && agent.backendType !== "native") {
      const runtime = await this.createExternalRuntime(session, agent);
      this.setupRuntime(session.id, runtime);
      this.db.updateStatus(session.id, "idle");
      return runtime;
    }

    const config = this.extractRuntimeConfig(session);
    if (agent?.backendType === "native" && (!agent.providerId || !agent.modelId)) {
      throw new Error(`Agent ${agent.id} has no model configured`);
    }
    const model =
      agent?.backendType === "native" && agent.providerId && agent.modelId
        ? resolveModelWithProviderOverrides(this.db, agent.providerId, agent.modelId)
        : getModel(config.provider as KnownProvider, config.modelId as never);
    if (!model) {
      throw new Error(`Model ${config.modelId} from provider ${config.provider} not found`);
    }

    await this.ensureResourceCatalog();
    const resource = new AgentResource({
      sessionId: session.id,
      agentId: session.agentId ?? session.id,
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
      config.toolsPreset,
    );
    const tools = sessionTools;

    const systemPrompt =
      session.branchType === "btw"
        ? this.buildSystemPrompt(
            BTW_SYSTEM_PROMPT,
            resource.getSkillsPrompt(),
            resource.systemMd,
            session.cwd,
          )
        : config.systemPrompt.length > 0
          ? config.systemPrompt
          : this.buildSystemPrompt("", resource.getSkillsPrompt(), resource.systemMd, session.cwd);

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
      session.agentId ?? session.id,
      agent?.name ?? "Session",
      session.cwd,
      this.db,
      this,
    );
    const extensionTools = runtime.collectExtensionTools();
    if (extensionTools.length > 0) {
      const disabledTools = this.getDisabledAgentTools(session.agentId);
      const mergedTools = new Map<string, AgentTool>();
      for (const tool of tools) mergedTools.set(tool.name, tool);
      for (const tool of extensionTools) {
        if (!disabledTools.has(tool.name)) mergedTools.set(tool.name, tool);
      }
      await runtime.setTools([...mergedTools.values()]);
    }

    this.setupRuntime(session.id, runtime);
    this.db.updateStatus(session.id, "idle");
    return runtime;
  }

  private async getOrRestoreRuntime(id: number): Promise<ManagedSessionRuntime> {
    const runtime = this.runtimes.get(id);
    if (runtime) return runtime;
    return this.restoreRuntime(id);
  }

  /** Create a DB record only, no embedded agent. */
  create(options: CreateSessionOptions = {}): Session {
    const branchType = options.parentId == null ? null : (options.branchType ?? "subagent");
    const creationMethod =
      options.creationMethod ??
      (branchType === "subagent" ? "spawn_agent" : branchType === null ? "user" : branchType);
    const showInSessionList =
      options.parentId == null ||
      creationMethod === "spawn_agent" ||
      branchType === "fork" ||
      branchType === "clone";
    const row = this.db.insert({
      parent_id: options.parentId ?? null,
      project_id: this.resolveProjectId(options),
      session_id: null,
      pid: null,
      status: "starting",
      thinking_level: "none",
      cwd: options.cwd ?? getDefaultCwd(),
      agent_id: options.agentId ?? null,
      branch_type: branchType,
      created_via: creationMethod,
      show_in_session_list: showInSessionList ? 1 : 0,
      context_leaf_id: branchType === "btw" ? (options.contextLeafId ?? null) : null,
      meta: JSON.stringify(options.meta ?? {}),
    });
    const session = rowToSession(row);
    if (session.parentId == null) {
      const btwAgentId = findPackagedAgentId(this.db, "btw");
      if (btwAgentId !== undefined) {
        this.db.upsertMember({
          session_id: session.id,
          agent_id: btwAgentId,
          role: "assistant",
          tags: ["btw"],
        });
      }
    }
    return session;
  }

  /**
   * Spawn an embedded agent (AgentHarness + SQLite session).
   * Resources (skills/prompts/extensions) follow session.agentId — main or child session.
   */
  async spawn(options: SpawnSessionOptions = {}): Promise<Session> {
    const agentInDb = this.getAgentForSession(options.agentId ?? null);
    if (options.agentId && !agentInDb) {
      throw new Error(`Agent ${options.agentId} not found`);
    }
    if (agentInDb) {
      assertAgentUserSpawnable(agentInDb, options.agentId);
      const availability = externalAgentAvailability(agentInDb);
      if (!availability.available) {
        throw new Error(
          availability.unavailableReason ?? `Agent ${options.agentId} is unavailable`,
        );
      }
    }

    const session = this.create({
      ...options,
      branchType: options.parentId ? "subagent" : null,
    });

    const activeSession = await prepareSessionLifecycleSpawn(
      this.db,
      session,
      options,
      agentInDb?.name,
    );
    await ensureSessionDir(this.requireProjectId(activeSession), activeSession.id);

    if (
      agentInDb?.backendType === "native" &&
      (agentInDb.providerId == null || agentInDb.modelId == null)
    ) {
      this.db.updateMeta(activeSession.id, { modelRequired: true });
      this.db.updateStatus(activeSession.id, "idle");
      return rowToSession(this.db.get(activeSession.id)!);
    }

    if (agentInDb && agentInDb.backendType !== "native") {
      const runtime = await this.createExternalRuntime(activeSession, agentInDb);
      this.setupRuntime(activeSession.id, runtime);
      if (options.instructions) {
        void runtime.prompt(options.instructions).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`ACP agent prompt error [${activeSession.id}]:`, message);
          this.db.updateStatus(activeSession.id, "error");
        });
      }
      this.db.updateStatus(activeSession.id, options.instructions ? "running" : "idle");
      return rowToSession(this.db.get(activeSession.id)!);
    }

    const modelId = options.model ?? agentInDb?.modelId ?? DEFAULT_MODEL_ID;
    const provider = (options.provider ?? DEFAULT_PROVIDER) as KnownProvider;
    let model =
      agentInDb?.providerId != null
        ? resolveModelWithProviderOverrides(this.db, agentInDb.providerId, modelId)
        : undefined;
    if (!model) {
      model = getModel(provider, modelId as never);
    }

    if (!model) {
      throw new Error(`Model ${modelId} from provider ${provider} not found`);
    }

    const storage = createRuntimeSessionStorage(this.db, activeSession);
    this.enableMessageCheckpoints(storage, activeSession.id);
    const harnessSession = new AgentSession(storage);
    const env = new NodeExecutionEnv({ cwd: activeSession.cwd });

    // Use agent's toolsPreset if available, otherwise use options or default
    const toolsPreset = options.toolsPreset ?? agentInDb?.toolsPreset ?? "coding";
    await this.ensureResourceCatalog();
    const resource = new AgentResource({
      sessionId: activeSession.id,
      agentId: activeSession.agentId ?? activeSession.id,
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

    const baseSystemPrompt = options.systemPrompt ?? "";
    const systemPrompt = this.buildSystemPrompt(
      baseSystemPrompt,
      resource.getSkillsPrompt(),
      resource.systemMd,
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
      activeSession.agentId ?? activeSession.id,
      agentInDb?.name ?? "Session",
      activeSession.cwd,
      this.db,
      this,
    );
    const extensionTools = runtime.collectExtensionTools();
    if (extensionTools.length > 0) {
      const disabledTools = this.getDisabledAgentTools(activeSession.agentId);
      const mergedTools = new Map<string, AgentTool>();
      for (const tool of tools) mergedTools.set(tool.name, tool);
      for (const tool of extensionTools) {
        if (!disabledTools.has(tool.name)) mergedTools.set(tool.name, tool);
      }
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

  async prompt(
    id: number,
    message: string,
    images?: ImageContent[],
    source?: string | null,
    origin?: string,
  ): Promise<void> {
    const session = this.db.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    this.assertSessionProviderEnabled(id);
    await (await this.getOrRestoreRuntime(id)).prompt(message, images, source, origin);
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
      images?: ImageContent[];
      origin?: string;
    },
  ): Promise<SessionInputDisposition> {
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

  async drainSessionInputQueue(sessionId: number): Promise<boolean> {
    const next = this.sessionInputQueues.dequeue(sessionId);
    if (!next) return false;
    await this.prompt(sessionId, next.message, next.images, next.source, next.origin);
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

  async steer(id: number, message: string, images?: ImageContent[]): Promise<void> {
    this.assertSessionProviderEnabled(id);
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Session ${id} is not running`);
    await runtime.steer(message, images);
  }

  followUp(id: number, message: string, source?: string | null, images?: ImageContent[]): void {
    this.assertSessionProviderEnabled(id);
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Session ${id} is not running`);
    runtime.followUp(message, source, images);
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

  async getState(id: number): Promise<SessionState> {
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
    await runtime.clear().catch(() => {});
    this.runtimes.delete(id);
    this.turnTrackers.delete(id);
    this.sessionToolConfigs.delete(id);
    if (current.status !== "error") {
      this.db.updateStatus(id, "finish");
    }
  }

  async complete(id: number): Promise<Session> {
    let session = rowToSession(this.db.get(id)!);
    if (!session) throw new Error(`Session ${id} not found`);
    if (session.status === "finish" || session.status === "finished") return session;

    // Emit session.before_complete
    const runtime = this.runtimes.get(id);
    if (runtime?.extension) {
      void runtime.extension.emit({
        type: "session.before_complete",
        sessionId: id,
      } as any);
    }

    const isSpawnedSubagent = session.creationMethod === "spawn_agent" && session.parentId != null;
    try {
      if (!isSpawnedSubagent) {
        await commitSessionChanges(id, session.cwd, session.meta, this.db);
        session = rowToSession(this.db.get(id)!);
        await finalizeSessionLifecycleGit(this.db, session);
      }
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
        await runtime.clear().catch(() => {});
      }
      this.runtimes.delete(id);
      this.turnTrackers.delete(id);
      this.sessionToolConfigs.delete(id);
    }
    this.db.updateStatus(id, "finish");
    if (isSpawnedSubagent) this.db.updateSessionListVisibility(id, false);
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
    const branch = ensureGitRepositorySync(options.cwd);
    const project = this.db.insertProject(options);
    if (project.defaultBranch !== branch) this.db.updateProjectDefaultBranch(project.id, branch);
    return this.db.getProject(project.id)!;
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
    const availability = externalAgentAvailability(agent);
    if (agent.backendType !== "native") {
      return { ...agent, homeDir: null, systemMd: "", ...availability };
    }
    const homeDir = agent.homeDir ?? getAgentHomeDir(agent.id);
    return { ...agent, homeDir, systemMd: readAgentHomeSystemPrompt(homeDir), ...availability };
  }

  detectExternalAgents(): AgentWithSystemMd[] {
    return this.listAgents();
  }

  insertAgent(
    row: Parameters<SupervisorDb["insertAgent"]>[0],
    options?: { systemMd?: string },
  ): AgentWithSystemMd {
    const agent = this.db.insertAgent(row);
    if (agent.backendType === "native" && options?.systemMd !== undefined) {
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
    if (agent.backendType !== "native") {
      throw new Error("External agents manage their own system instructions");
    }
    const homeDir = agent.homeDir ?? getAgentHomeDir(id);
    writeAgentHomeSystemPrompt(homeDir, content);
    return this.enrichAgentWithSystemMd(agent);
  }

  getAgentSystemMd(id: number): string {
    const agent = this.db.getAgent(id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    if (agent.backendType !== "native") return "";
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

  replaceSessionAgentMembers(
    sessionId: number,
    shadowAgentId: number | null,
    spawnedAgentIds: number[],
  ): Member[] {
    if (!this.db.get(sessionId)) throw new Error(`Session ${sessionId} not found`);
    return this.db.replaceSessionAgentMembers(sessionId, shadowAgentId, spawnedAgentIds);
  }

  listMemberAgentsByTag(sessionId: number, tag: string): MemberAgent[] {
    return this.db.listMemberAgentsByTag(sessionId, tag);
  }

  updateMeta(id: number, patch: Record<string, unknown>): Record<string, unknown> {
    const before = this.getWorkflow(id);
    const meta = this.db.updateMeta(id, patch);
    void this.emitWorkflowChanges(id, before, parseWorkflowState(meta.workflow));
    return meta;
  }

  setMeta(id: number, meta: Record<string, unknown>): void {
    const before = this.getWorkflow(id);
    this.db.setMeta(id, meta);
    void this.emitWorkflowChanges(id, before, parseWorkflowState(meta.workflow));
  }

  getWorkflow(id: number): SessionWorkflowState | null {
    const session = this.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    return parseWorkflowState(session.meta.workflow);
  }

  async setWorkflow(id: number, patch: WorkflowStatePatch): Promise<SessionWorkflowState> {
    const before = this.getWorkflow(id);
    const workflow = applyWorkflowPatch(before, patch);
    this.db.updateMeta(id, { workflow });
    await this.emitWorkflowChanges(id, before, workflow);
    return workflow;
  }

  async clearWorkflow(id: number): Promise<void> {
    const session = this.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    const before = parseWorkflowState(session.meta.workflow);
    if (!before && !Object.hasOwn(session.meta, "workflow")) return;
    const meta = { ...session.meta };
    delete meta.workflow;
    this.db.setMeta(id, meta);
    await this.emitWorkflowChanges(id, before, null);
  }

  private async emitWorkflowChanges(
    id: number,
    before: SessionWorkflowState | null,
    after: SessionWorkflowState | null,
  ): Promise<void> {
    const extension = this.runtimes.get(id)?.extension;
    if (!extension) return;
    if (before?.stage !== after?.stage) {
      await extension.emit({
        type: "workflow.stage_changed",
        sessionId: id,
        from: before?.stage ?? null,
        to: after?.stage ?? null,
        workflow: after,
      });
    }
    if (after && before?.status !== after.status) {
      await extension.emit({
        type: "workflow.status_changed",
        sessionId: id,
        stage: after.stage,
        from: before?.status ?? null,
        to: after.status,
        workflow: after,
      });
    }
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
    for (const child of this.children(id)) {
      if (child.branchType === "subagent" || child.branchType === "btw") {
        this.delete(child.id);
      }
    }
    const session = this._getSession(id);
    const runtime = this.runtimes.get(id);
    if (runtime) {
      void runtime.clear().catch(() => {});
      this.runtimes.delete(id);
      this.turnTrackers.delete(id);
      this.sessionToolConfigs.delete(id);
    }
    this.db.delete(id);
    if (session?.projectId != null) removeSessionDirSync(session.projectId, id);
  }

  // ============ Session Tree Methods ============

  createBtw(id: number): Session {
    const parent = this._getSession(id);
    if (!parent) throw new Error(`Session ${id} not found`);
    const btwAgent =
      this.db.listMemberAgentsByTag(parent.id, "btw")[0] ??
      (() => {
        const agentId = findPackagedAgentId(this.db, "btw");
        return agentId === undefined ? undefined : this.db.getAgent(agentId);
      })();
    if (!btwAgent) throw new Error("BTW agent is not configured");
    const runtimeConfig: RuntimeConfigSnapshot = {
      provider: DEFAULT_PROVIDER,
      modelId: btwAgent.modelId ?? DEFAULT_MODEL_ID,
      systemPrompt: BTW_SYSTEM_PROMPT,
      toolsPreset: "readonly",
    };
    return this.create({
      projectId: parent.projectId,
      parentId: parent.id,
      cwd: parent.cwd,
      agentId: btwAgent.id,
      branchType: "btw",
      contextLeafId: null,
      meta: { runtimeConfig, name: "顺便问" },
    });
  }

  async fork(
    id: number,
    entryId: string,
    options?: { label?: string; customInstructions?: string; position?: "before" | "at" },
  ): Promise<Session> {
    const session = this.db.get(id);
    if (!session) throw new Error(`Session ${id} not found`);

    const project = session.project_id == null ? undefined : this.db.getProject(session.project_id);
    const createOptions: CreateSessionOptions = {
      projectId: session.project_id,
      parentId: id,
      cwd: project?.cwd ?? session.cwd,
      agentId: (session as any).agentId ?? (session as any).agent_id,
      branchType: "fork",
      meta: options?.label ? { name: options.label } : {},
    };
    let newSession = this.create(createOptions);
    newSession = await prepareSessionLifecycleSpawn(this.db, newSession, createOptions);

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
    const meta = typeof session.meta === "string" ? JSON.parse(session.meta) : session.meta;
    const git = meta.git && typeof meta.git === "object" ? meta.git : undefined;
    if (git) this.db.updateMeta(id, { git: { ...git, lastCommit: commit } });
    return commit;
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
   * Agent access is controlled by database resource bindings.
   */
  resolveGlobalResources(): ResourceLayer {
    initializeResourceCatalog(this.db, this.resourceHandlers.values());
    const globalRoot = ensureGlobalResourceRoot();
    const globalSkillsDir = getGlobalSkillsDirectory();
    const globalPromptsDir = getGlobalPromptsDirectory();
    const globalExtDir = getGlobalExtensionsDirectory();

    const { skills } = loadSkills({
      cwd: globalRoot,
      skillPaths: [globalSkillsDir],
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

  getRuntime(id: number): ManagedSessionRuntime {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Session ${id} is not running`);
    return runtime;
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
}
