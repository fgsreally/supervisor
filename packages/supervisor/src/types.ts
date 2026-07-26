import type { AgentTool, SessionMetadata, SessionTreeEntry } from "@earendil-works/pi-agent-core";
import type { SessionBranchType } from "./core/session-history.js";

/** Runtime shape of SQLiteSessionStorage.getMetadata() in supervisor. */
export interface SupervisorHarnessMetadata extends SessionMetadata {
  meta: Record<string, unknown>;
}

export type ToolsPreset = "coding" | "readonly" | "none";
export type SessionCreationMethod = "user" | "spawn_agent" | "btw" | "fork" | "clone";

/**
 * Session lifecycle status.
 * `initializing` = spawn prep (worktree / runtime); legacy DB value `starting` maps here.
 * `blocked` = needs user intervention (approval, missing model, etc.); detail in `error_msg` when applicable.
 * Legacy: `waiting_user` / `needs_model` → `blocked`.
 * `stopped` is kept for backward compatibility with old DB rows.
 */
export type SessionStatus =
  | "initializing"
  | "running"
  | "blocked"
  | "idle"
  | "finish"
  | "finished"
  | "error"
  | "stopped";

/** Normalize persisted status values (including legacy aliases). */
export function normalizeSessionStatus(status: string | null | undefined): SessionStatus {
  if (status === "starting") return "initializing";
  if (status === "waiting_user" || status === "needs_model") return "blocked";
  if (
    status === "initializing" ||
    status === "running" ||
    status === "blocked" ||
    status === "idle" ||
    status === "finish" ||
    status === "finished" ||
    status === "error" ||
    status === "stopped"
  ) {
    return status;
  }
  return "idle";
}

export interface SessionAvatar {
  text?: string;
  color?: string;
  icon?: string | null;
}

/** Git/worktree state stored in sessions.meta.git (not dedicated columns). */
export interface SessionGitMeta {
  branch?: string;
  worktreePath?: string | null;
  lastCommit?: { hash: string; message: string } | null;
  mergeError?: string | null;
}

export interface SessionRow {
  id: number;
  project_id: number | null;
  parent_id: number | null;
  session_id: string | null;
  pid: number | null;
  status: SessionStatus;
  thinking_level: "none" | "low" | "medium" | "high";
  cwd: string;
  leaf_id: string | null;
  agent_id: number | null;
  branch_type: string | null;
  created_by?: SessionCreationMethod;
  /** @deprecated Use created_by. Present only during migration from older DBs. */
  created_via?: SessionCreationMethod;
  show_in_session_list?: number;
  context_leaf_id?: string | null;
  title?: string | null;
  system_prompt?: string | null;
  avatar?: string | null;
  is_builtin?: number;
  pinned?: number;
  muted?: number;
  unread?: number;
  external_session_id?: string | null;
  error_msg?: string | null;
  stage?: string | null;
  shadow_enabled?: number;
  current_task_id?: number | null;
  created_at: number;
  last_active_at: number;
  meta: string;
}

export interface Session {
  id: number;
  projectId: number | null;
  parentId: number | null;
  sessionId: string | null;
  pid: number | null;
  status: SessionStatus;
  thinkingLevel: "none" | "low" | "medium" | "high";
  cwd: string;
  leafId: string | null;
  agentId: number | null;
  /** How this child session was created. Root sessions use null. */
  branchType: SessionBranchType | null;
  creationMethod: SessionCreationMethod;
  showInSessionList: boolean;
  /** BTW context snapshot in the parent session. */
  contextLeafId: string | null;
  title: string | null;
  systemPrompt: string | null;
  avatar: SessionAvatar | null;
  isBuiltin: boolean;
  pinned: boolean;
  muted: boolean;
  unread: number;
  externalSessionId: string | null;
  errorMsg: string | null;
  stage: string | null;
  shadowEnabled: boolean;
  currentTaskId: number | null;
  createdAt: Date;
  lastActiveAt: Date;
  /** Extension data + meta.git (worktree/commit). Core UI fields live in columns. */
  meta: Record<string, unknown>;
  /** Path of the current session_tasks row, when set. */
  currentTask: string | null;
  /** Derived from meta.git.worktreePath / branch. */
  gitSessionBranch: string | null;
  gitWorktreeEnabled: boolean;
  gitMergeError: string | null;
  gitLastCommit: { hash: string; message: string } | null;
}

export interface CreateSessionOptions {
  projectId?: number | null;
  parentId?: number;
  cwd?: string;
  meta?: Record<string, unknown>;
  agentId?: number | null;
  branchType?: SessionBranchType | null;
  creationMethod?: SessionCreationMethod;
  contextLeafId?: string | null;
  /** Override default list visibility (root sessions are visible by default). */
  showInSessionList?: boolean;
  title?: string | null;
  systemPrompt?: string | null;
  avatar?: SessionAvatar | null;
  isBuiltin?: boolean;
  pinned?: boolean;
  muted?: boolean;
  shadowEnabled?: boolean;
  externalSessionId?: string | null;
  stage?: string | null;
}

export type SessionTaskKind = "goal" | "plan";

export interface SessionTaskRow {
  id: number;
  session_id: number;
  path: string;
  kind: SessionTaskKind;
  title: string | null;
  status: string | null;
  created_at: number;
  updated_at: number;
}

export interface SessionTask {
  id: number;
  sessionId: number;
  path: string;
  kind: SessionTaskKind;
  title: string | null;
  status: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SessionTodoStatus = "pending" | "in_progress" | "done";

export interface SessionTodoRow {
  id: number;
  session_id: number;
  title: string;
  status: SessionTodoStatus;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface SessionTodoItem {
  id: number;
  sessionId: number;
  title: string;
  status: SessionTodoStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectRow {
  id: number;
  name: string;
  cwd: string;
  work_dir: string;
  default_branch: string;
  install_command: string | null;
  start_command: string | null;
  destroy_command: string | null;
  meta: string;
  created_at: number;
  updated_at: number;
}

export interface Project {
  id: number;
  name: string;
  cwd: string;
  workDir: string;
  defaultBranch: string;
  installCommand: string | null;
  startCommand: string | null;
  destroyCommand: string | null;
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectOptions {
  name?: string;
  cwd: string;
  meta?: Record<string, unknown>;
}

export interface SpawnSessionOptions extends CreateSessionOptions {
  /** System prompt injected on each turn (from SDD orchestrator). */
  systemPrompt?: string;
  /** Optional first user message, run after spawn. */
  instructions?: string;
  /** LLM provider slug (default: anthropic). Used when providerId is absent. */
  provider?: string;
  /** DB provider id — preferred when binding a settings feature model. */
  providerId?: number;
  /** Model ID (default: claude-sonnet-4-6). */
  model?: string;
  toolsPreset?: ToolsPreset;
  tools?: AgentTool[];
  /** Create worktree / session row only; attach runtime later via ensureRuntime. */
  skipRuntime?: boolean;
  /**
   * When false, return the session row immediately with status `initializing` while
   * worktree + runtime prepare in the background. Defaults to true.
   */
  awaitReady?: boolean;
}

// ============ Agent Types ============
export const AGENT_BACKEND_TYPES = ["native", "codex", "claude", "kimi", "acp"] as const;
export type AgentBackendType = (typeof AGENT_BACKEND_TYPES)[number];

export interface AgentRow {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  provider_id: number | null;
  backend_type: AgentBackendType;
  model_id: string | null;
  tools_preset: string | null;
  home_dir: string | null;
  is_internal: number;
  meta: string;
  created_at: number;
  updated_at: number;
}

export interface Agent {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  providerId: number | null;
  backendType: AgentBackendType;
  modelId: string | null;
  toolsPreset: ToolsPreset | null;
  homeDir: string | null;
  /** Shipped/runtime agents (e.g. shadow) that cannot back user-facing sessions. */
  isInternal: boolean;
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Agent row plus SYSTEM.md content (not stored in DB). */
export interface AgentWithSystemMd extends Agent {
  systemMd: string;
  available: boolean;
  executablePath: string | null;
  unavailableReason: string | null;
  detectedVersion: string | null;
  compatibility: "compatible" | "unknown" | "unavailable";
}

export interface MemberRow {
  id: number;
  session_id: number;
  agent_id: number;
  role: string;
  tags: string;
  created_at: number;
  updated_at: number;
}

export interface Member {
  id: number;
  sessionId: number;
  agentId: number;
  role: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type MemberAgent = Agent & {
  member: Member;
};

export interface CreateAgentOptions {
  name: string;
  description?: string;
  providerId: number;
  modelId?: string;
  /** Initial content for `<agent-home>/SYSTEM.md`. */
  systemMd?: string;
  toolsPreset?: ToolsPreset;
  homeDir?: string;
  meta?: Record<string, unknown>;
}

// ============ Message Types ============

export interface MessageRow {
  id: number;
  entry_id: string;
  session_id: number;
  parent_entry_id: string | null;
  type: string;
  payload: string;
  meta: string;
  is_old: number;
  source: string | null;
  origin: string | null;
  message_role: string | null;
  search_text: string | null;
  created_at: number;
}

export interface MessageSearchHit {
  messageId: string;
  sessionId: number;
  messageRole: string | null;
  searchText: string | null;
  isOld: boolean;
  createdAt: number;
  snippet: string;
}

/** API / storage view: pi session entry + supervisor columns. */
export type SessionMessageResponse = SessionTreeEntry & {
  /** Copied from parent session via fork/clone. */
  isOld: boolean;
  /** Originating shadow collaborator agent id, null for normal user/main-agent messages. */
  source: string | null;
  /** Original user input before slash/template expansion. */
  origin: string | null;
  /** User/orchestrator extensions only. */
  meta: Record<string, unknown>;
  createdAt: number;
};

/** Paginated chat history for the Web UI (newest page first fetch). */
export interface SessionMessagesPage {
  messages: SessionMessageResponse[];
  hasMore: boolean;
  /** Smallest messages.id in this page; pass as `beforeId` for older pages. */
  oldestRowId: number | null;
  /** Largest messages.id in this page. */
  newestRowId: number | null;
}

// ============ Provider/Model Types ============
export interface ProviderRow {
  id: number;
  slug: string | null;
  name: string;
  icon: string | null;
  api_type: string;
  base_url: string | null;
  api_key: string | null;
  is_enabled: number;
  created_at: number;
  updated_at: number;
}

export interface Provider {
  id: number;
  slug: string | null;
  name: string;
  icon: string | null;
  apiType: string;
  baseUrl: string | null;
  apiKey: string | null;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelRow {
  id: number;
  provider_id: number;
  model_id: string;
  name: string | null;
  context_window: number;
  max_tokens: number;
  supports_multimodal: number;
  tags: string;
  created_at: number;
  updated_at: number;
}

export interface Model {
  id: number;
  providerId: number;
  modelId: string;
  name: string | null;
  contextWindow: number;
  maxTokens: number;
  supportsMultimodal: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateModelOptions {
  modelId: string;
  name?: string | null;
  contextWindow?: number;
  maxTokens?: number;
  supportsMultimodal?: boolean;
  tags?: string[];
}

export interface UpdateModelOptions {
  name?: string | null;
  contextWindow?: number;
  maxTokens?: number;
  supportsMultimodal?: boolean;
  tags?: string[];
}

// ============ Checkpoint Types ============

/** Session snapshot for rewind (conversation leaf + optional git stash ref). */
export interface SessionCheckpoint {
  id: string;
  entryId: string;
  gitRef: string | null;
  gitHead?: string | null;
  label?: string;
  createdAt: number;
}

export interface CreateCheckpointOptions {
  label?: string;
}

export interface CommitSessionOptions {
  message?: string;
}

export interface CommitSessionResult {
  hash: string;
  message: string;
}

// ============ Home Task Types ============

export const HOME_TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "blocked",
  "done",
  "error",
] as const;
export type HomeTaskStatus = (typeof HOME_TASK_STATUSES)[number];

export const HOME_TASK_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type HomeTaskPriority = (typeof HOME_TASK_PRIORITIES)[number];

export interface HomeTaskRow {
  id: number;
  title: string;
  description: string;
  project_id: number | null;
  status: string;
  priority: string;
  parent_id: number | null;
  session_id: number | null;
  error: string | null;
  meta: string;
  created_at: number;
  updated_at: number;
}

export interface HomeTask {
  id: number;
  title: string;
  description: string;
  projectId: number | null;
  status: HomeTaskStatus;
  priority: HomeTaskPriority;
  parentId: number | null;
  sessionId: number | null;
  error: string | null;
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateHomeTaskOptions {
  title: string;
  description?: string;
  projectId?: number | null;
  status?: HomeTaskStatus;
  priority?: HomeTaskPriority;
  parentId?: number | null;
  sessionId?: number | null;
  meta?: Record<string, unknown>;
}

export interface UpdateHomeTaskOptions {
  title?: string;
  description?: string;
  projectId?: number | null;
  status?: HomeTaskStatus;
  priority?: HomeTaskPriority;
  parentId?: number | null;
  sessionId?: number | null;
  error?: string | null;
  meta?: Record<string, unknown>;
}
