import type { AgentTool, SessionMetadata, SessionTreeEntry } from "@earendil-works/pi-agent-core";
import type { SessionBranchType } from "./core/session-history.js";
export type {
  SessionWorkflowState,
  WorkflowStatePatch,
  WorkflowStatus,
} from "./core/session-workflow.js";

/** Runtime shape of SQLiteSessionStorage.getMetadata() in supervisor. */
export interface SupervisorHarnessMetadata extends SessionMetadata {
  meta: Record<string, unknown>;
}

export type ToolsPreset = "coding" | "readonly" | "none";
export type SessionCreationMethod = "user" | "spawn_agent" | "btw" | "fork" | "clone";

/** `stopped` is kept for backward compatibility with old DB rows. */
export type SessionStatus =
  | "starting"
  | "running"
  | "waiting_user"
  | "idle"
  | "finish"
  | "finished"
  | "error"
  | "stopped";

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
  created_via?: SessionCreationMethod;
  show_in_session_list?: number;
  context_leaf_id?: string | null;
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
  createdAt: Date;
  lastActiveAt: Date;
  /** User/orchestrator extensions only. */
  meta: Record<string, unknown>;
  /** The task currently driving this session, mirrored from meta.currentTask. */
  currentTask: string | null;
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
}

export interface ProjectRow {
  id: number;
  name: string;
  cwd: string;
  work_dir: string;
  default_branch: string;
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
  /** LLM provider (default: anthropic). */
  provider?: string;
  /** Model ID (default: claude-sonnet-4-6). */
  model?: string;
  toolsPreset?: ToolsPreset;
  tools?: AgentTool[];
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
