/**
 * Supervisor Web UI - API Layer
 *
 * 基于 packages/supervisor-web-ui/example/src/mock 的类型定义
 * 对接 packages/supervisor 的 HTTP API
 *
 * 注意：此文件从 example 复制并修改，用于连接真实 API
 */

import type { AgentEvent } from "@earendil-works/pi-agent-core";

// ============ Base Types (from supervisor types) ============

export type SessionStatus =
  | "starting"
  | "running"
  | "waiting_user"
  | "idle"
  | "finish"
  | "error"
  | "stopped";
export type ToolsPreset = "coding" | "readonly" | "none";
export type SessionBranchType = "spawn" | "fork" | "clone";

// ============ Domain Types ============

/** Workspace definition */
export interface Workspace {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  cwd: string;
  workDir: string;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Session with UI-specific fields */
export interface Session {
  id: string;
  projectId: string | null;
  parentId: string | null;
  sessionId: string | null;
  pid: number | null;
  status: SessionStatus;
  cwd: string;
  leafId: string | null;
  agentId: string | null;
  branchType: SessionBranchType | null;
  createdAt: string; // ISO date
  lastActiveAt: string; // ISO date
  meta: Record<string, unknown>;
  /** UI-specific: last message preview */
  lastMessagePreview?: string;
}

/** Agent definition */
export interface Agent {
  id: string;
  name: string;
  description: string | null;
  providerId: string;
  modelId: string | null;
  toolsPreset: ToolsPreset | null;
  homeDir: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Provider API types */
export type ProviderApiType = "anthropic-messages" | "openai-compatible";

/** Model definition */
export interface Model {
  providerId: string;
  modelId: string;
  name: string | null;
  contextWindow: number;
  maxTokens: number;
  supportsMultimodal: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** Provider definition (apiKey is always null in responses) */
export interface Provider {
  id: string;
  slug: string | null;
  name: string;
  icon: string | null;
  apiType: string;
  baseUrl: string | null;
  apiKey: null; // Always null in responses
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============ Resource Types ============

export type ResourceKind = "skills" | "extensions" | "prompts";

export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  files: Array<{ relativePath: string; content: string }>;
}

export interface PromptTemplateInfo {
  name: string;
  description: string;
  filePath: string;
  content: string;
}

export interface ExtensionResourceInfo {
  id: string;
  rootDir: string;
  entryPath: string;
  fileName: string;
  name: string | null;
  version: string | null;
  description: string | null;
  files: ExtensionFileInfo[];
}

export interface ExtensionFileInfo {
  relativePath: string;
  content: string;
}

export interface ResourceLayer {
  skills: SkillInfo[];
  prompts: PromptTemplateInfo[];
  extensions: ExtensionResourceInfo[];
}

export interface AgentResources {
  agentId: string;
  homeDir: string;
  systemMd: string;
  toolsPreset: ToolsPreset | null;
  tools: Array<{
    name: string;
    source: "preset" | "extension" | "system";
    extensionName?: string;
    description?: string;
  }>;
  layers: {
    agent: ResourceLayer;
  };
}

// ============ Message/Entry Types ============

export interface TextPart {
  type: "text";
  text: string;
}

export interface ToolCallPart {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultContent {
  type: string;
  text: string;
}

export interface SessionTreeEntry {
  id: string;
  parentId: string | null;
  type: "system" | "message" | "toolResult" | "compaction";
  /** Copied from parent session via fork/clone */
  isOld: boolean;
  /** User/orchestrator extensions only */
  meta: Record<string, unknown>;
  createdAt: number;
  // For type='system'
  content?: string;
  // For type='message'
  message?: {
    role: string;
    content: string | TextPart[] | ToolCallPart[];
  };
  // For type='toolResult'
  toolCallId?: string;
  toolName?: string;
  // For type='compaction'
  summary?: string;
  firstKeptEntryId?: string;
  tokensBefore?: number;
}

export interface MessageSearchHit {
  messageId: string;
  sessionId: string;
  messageRole: string | null;
  searchText: string | null;
  isOld: boolean;
  createdAt: number;
  snippet: string;
}

// ============ Slash Command Types ============

export interface SlashCommandInfo {
  name: string;
  description: string;
  /** Source of the command: skill, prompt, extension */
  source?: string;
  /** Additional metadata */
  sourceInfo?: {
    path?: string;
    name?: string;
    description?: string;
  };
}

// ============ Session State Types ============

export interface SupervisorSessionState {
  id: string;
  sessionId: string | null;
  cwd: string;
  status: SessionStatus;
  model: {
    provider: string;
    modelId: string;
  };
  thinkingLevel: string;
  isStreaming: boolean;
  messageCount: number;
  leafId: string | null;
}

export interface CompactResult {
  summary: string;
  firstKeptEntryId: string | null;
  tokensBefore: number;
  details?: {
    keptMessages: number;
    removedMessages: number;
    newSummaryEntryId: string;
  };
}

export interface SessionTreeNode {
  id: string;
  parentId: string | null;
  children: SessionTreeNode[];
}

// ============ SSE Event Types ============

export type SseEventType = "started" | "event" | "done" | "error";

export interface SseEvent {
  type: SseEventType;
  sessionId?: string;
  event?: AgentEvent;
  error?: string;
}

// ============ Request/Response Types ============

export interface CreateSessionRequest {
  id?: string;
  projectId?: string | null;
  parentId?: string;
  cwd?: string;
  meta?: Record<string, unknown>;
  agentId?: string | null;
  branchType?: SessionBranchType | null;
  /** System prompt injected on each turn */
  systemPrompt?: string;
  /** Optional first user message */
  instructions?: string;
  /** LLM provider */
  provider?: string;
  /** Model ID */
  model?: string;
  toolsPreset?: ToolsPreset;
  tools?: unknown[];
}

export interface CreateProjectRequest {
  name?: string;
  cwd: string;
  meta?: Record<string, unknown>;
}

export interface CreateAgentRequest {
  id?: string;
  name: string;
  description?: string;
  providerId: string;
  modelId?: string;
  toolsPreset?: ToolsPreset;
  homeDir?: string;
  meta?: Record<string, unknown>;
  /** Initial content for SYSTEM.md */
  systemMd?: string;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  providerId?: string;
  modelId?: string;
  toolsPreset?: ToolsPreset;
  homeDir?: string;
  meta?: Record<string, unknown>;
}

export interface CreateModelRequest {
  modelId: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  supportsMultimodal?: boolean;
  tags?: string[];
}

export interface UpdateModelRequest {
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  supportsMultimodal?: boolean;
  tags?: string[];
}

export interface UpdateProviderRequest {
  slug?: string | null;
  isEnabled?: boolean;
  name?: string;
  apiType?: string;
  baseUrl?: string | null;
  icon?: string | null;
}

export interface CreateProviderRequest {
  slug?: string | null;
  name: string;
  icon?: string | null;
  apiType: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  isEnabled?: boolean;
}

export interface ForkSessionRequest {
  entryId?: string;
  label?: string;
  customInstructions?: string;
}

export interface SetSystemMdRequest {
  content: string;
}

export interface PromptRequest {
  message: string;
}

export interface SteerRequest {
  message: string;
}

export interface FollowUpRequest {
  message: string;
}

export interface CompactRequest {
  customInstructions?: string;
}

export interface SetModelRequest {
  provider: string;
  modelId: string;
}

export interface SetThinkingLevelRequest {
  level: string;
}

export interface FileContentResponse {
  path: string;
  content: string;
}

// ============ Configuration ============

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

interface RawProvider {
  id: number;
  slug: string | null;
  name: string;
  icon: string | null;
  apiType: string;
  baseUrl: string | null;
  apiKey: null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapProvider(raw: RawProvider): Provider {
  return { ...raw, id: String(raw.id) };
}

interface RawProject {
  id: number;
  name: string;
  cwd: string;
  workDir: string;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function mapProject(raw: RawProject): Project {
  return { ...raw, id: String(raw.id) };
}

interface RawSession {
  id: number;
  projectId: number | null;
  parentId: number | null;
  sessionId: string | null;
  pid: number | null;
  status: SessionStatus;
  cwd: string;
  leafId: string | null;
  agentId: number | null;
  branchType: SessionBranchType | null;
  createdAt: string;
  lastActiveAt: string;
  meta: Record<string, unknown>;
  lastMessagePreview?: string;
}

function mapSession(raw: RawSession): Session {
  return {
    ...raw,
    id: String(raw.id),
    projectId: raw.projectId === null ? null : String(raw.projectId),
    parentId: raw.parentId === null ? null : String(raw.parentId),
    agentId: raw.agentId === null ? null : String(raw.agentId),
  };
}

function toCreateSessionBody(options: CreateSessionRequest) {
  return {
    ...options,
    projectId:
      options.projectId === undefined || options.projectId === null
        ? options.projectId
        : Number.parseInt(options.projectId, 10),
    parentId: options.parentId === undefined ? undefined : Number.parseInt(options.parentId, 10),
    agentId:
      options.agentId === undefined || options.agentId === null
        ? options.agentId
        : Number.parseInt(options.agentId, 10),
  };
}

// ============ HTTP Utilities ============

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function deleteRequest<T = { ok: boolean }>(path: string): Promise<T> {
  return fetchJson<T>(path, { method: "DELETE" });
}

// ============ Project API ============

export async function listProjects(): Promise<Project[]> {
  const projects = await fetchJson<RawProject[]>("/projects");
  return projects.map(mapProject);
}

export async function createProject(options: CreateProjectRequest): Promise<Project> {
  const project = await postJson<RawProject>("/projects", options);
  return mapProject(project);
}

export async function getProject(id: string): Promise<Project> {
  const project = await fetchJson<RawProject>(`/projects/${id}`);
  return mapProject(project);
}

export async function deleteProject(id: string): Promise<{ ok: boolean }> {
  return deleteRequest<{ ok: boolean }>(`/projects/${id}`);
}

// ============ Session API ============

/**
 * List all sessions with optional filtering.
 * Response includes lastMessagePreview.
 */
export async function listSessions(params?: {
  status?: SessionStatus;
  parentId?: string | null;
  projectId?: string;
}): Promise<Session[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.parentId !== undefined) query.set("parentId", params.parentId ?? "null");
  if (params?.projectId) query.set("projectId", params.projectId);
  const qs = query.toString();
  const sessions = await fetchJson<RawSession[]>(`/sessions${qs ? `?${qs}` : ""}`);
  return sessions.map(mapSession);
}

/** Get a single session by ID. */
export async function getSession(id: string): Promise<Session> {
  const session = await fetchJson<RawSession>(`/sessions/${id}`);
  return mapSession(session);
}

/** Get child sessions of a parent session. */
export async function getSessionChildren(id: string): Promise<Session[]> {
  const sessions = await fetchJson<RawSession[]>(`/sessions/${id}/children`);
  return sessions.map(mapSession);
}

/** Create/Spawn a new session. */
export async function createSession(options: CreateSessionRequest): Promise<Session> {
  const session = await postJson<RawSession>("/sessions", toCreateSessionBody(options));
  return mapSession(session);
}

/** Kill a session process (does not delete the record). */
export async function killSession(id: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/sessions/${id}/kill`, {});
}

/** Complete a git work session: merge branch (requires committed changes), mark finished. */
export async function completeSession(id: string): Promise<Session> {
  const session = await postJson<RawSession>(`/sessions/${id}/complete`, {});
  return mapSession(session);
}

export interface SessionCheckpoint {
  id: string;
  entryId: string;
  gitRef: string | null;
  label?: string;
  createdAt: number;
}

/** Create a checkpoint (conversation leaf + optional git snapshot). */
export async function createCheckpoint(
  id: string,
  options?: { label?: string },
): Promise<SessionCheckpoint> {
  return postJson<SessionCheckpoint>(`/sessions/${id}/checkpoints`, options ?? {});
}

/** List session checkpoints. */
export async function listCheckpoints(id: string): Promise<SessionCheckpoint[]> {
  const body = await fetchJson<{ checkpoints: SessionCheckpoint[] }>(`/sessions/${id}/checkpoints`);
  return body.checkpoints;
}

/** Rewind session to a checkpoint (code + conversation). */
export async function rewindSession(id: string, checkpointId: string): Promise<Session> {
  const session = await postJson<RawSession>(`/sessions/${id}/rewind`, { checkpointId });
  return mapSession(session);
}

/** Explicit git commit for session worktree changes. */
export async function commitSession(
  id: string,
  options?: { message?: string },
): Promise<{ commit: { hash: string; message: string } | null }> {
  return postJson<{ commit: { hash: string; message: string } | null }>(
    `/sessions/${id}/commit`,
    options ?? {},
  );
}

/** Delete a session record. */
export async function deleteSession(id: string): Promise<{ ok: boolean }> {
  return deleteRequest<{ ok: boolean }>(`/sessions/${id}`);
}

/**
 * Send a prompt to a session and receive events via SSE.
 * Returns a cleanup function to abort the connection.
 */
export function promptSession(
  id: string,
  message: string,
  onEvent: (event: AgentEvent) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void,
  images?: PromptImageInput[],
): () => void {
  const abortController = new AbortController();

  void (async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${id}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          images: images?.length ? images : undefined,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${res.status}: ${err}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data) {
              try {
                const parsed = JSON.parse(data) as SseEvent;
                if (parsed.type === "event" && parsed.event) {
                  onEvent(parsed.event);
                } else if (parsed.type === "error" && parsed.error) {
                  onError?.(new Error(parsed.error));
                } else if (parsed.type === "done") {
                  onComplete?.();
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      onComplete?.();
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  })();

  return () => abortController.abort();
}

/** Steer the active turn in a session. */
export async function steerSession(id: string, message: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/sessions/${id}/steer`, { message });
}

/** Enqueue a follow-up message for the next turn. */
export async function followUpSession(id: string, message: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/sessions/${id}/follow-up`, { message });
}

/** Abort the current work in a session. */
export async function abortSession(id: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/sessions/${id}/abort`, {});
}

/** Submit an answer for a pending ask tool call. */
export async function submitAskAnswer(
  sessionId: string,
  toolCallId: string,
  answers: Array<{ id: string; value: string; label: string }>,
): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/sessions/${sessionId}/ask-answer`, { toolCallId, answers });
}

/** Compact the session context with optional custom instructions. */
export async function compactSession(
  id: string,
  customInstructions?: string,
): Promise<CompactResult> {
  return postJson<CompactResult>(`/sessions/${id}/compact`, { customInstructions });
}

/** Switch the model for a running session. */
export async function setSessionModel(
  id: string,
  provider: string,
  modelId: string,
): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/sessions/${id}/model`, { provider, modelId });
}

/** Set the thinking level for a session. */
export async function setSessionThinkingLevel(id: string, level: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/sessions/${id}/thinking-level`, { level });
}

/** Get the full message history for a session. */
export async function getSessionMessages(id: string): Promise<SessionTreeEntry[]> {
  return fetchJson<SessionTreeEntry[]>(`/sessions/${id}/messages`);
}

/** Get the hierarchical tree structure of a session. */
export async function getSessionTree(id: string): Promise<SessionTreeNode[]> {
  return fetchJson<SessionTreeNode[]>(`/sessions/${id}/tree`);
}

/** Fork a session from a specific entry point. */
export async function forkSession(id: string, options?: ForkSessionRequest): Promise<Session> {
  const session = await postJson<RawSession>(`/sessions/${id}/fork`, options ?? {});
  return mapSession(session);
}

/** Clone a session completely. */
export async function cloneSession(id: string): Promise<Session> {
  const session = await postJson<RawSession>(`/sessions/${id}/clone`, {});
  return mapSession(session);
}

/** Get the runtime state of a session. */
export async function getSessionState(id: string): Promise<SupervisorSessionState> {
  return fetchJson<SupervisorSessionState>(`/sessions/${id}/state`);
}

/** Get available slash commands for a session. */
export async function getSessionCommands(id: string): Promise<SlashCommandInfo[]> {
  return fetchJson<SlashCommandInfo[]>(`/sessions/${id}/commands`);
}

/** Update session meta (merges with existing). */
export async function updateSessionMeta(
  id: string,
  meta: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return patchJson<Record<string, unknown>>(`/sessions/${id}/meta`, meta);
}

/** Replace session meta completely. */
export async function setSessionMeta(
  id: string,
  meta: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  return putJson<{ ok: boolean }>(`/sessions/${id}/meta`, meta);
}

/** Update message meta (merges with existing). */
export async function updateMessageMeta(
  sessionId: string,
  messageId: string,
  meta: Record<string, unknown>,
): Promise<{ meta: Record<string, unknown> }> {
  return patchJson<{ meta: Record<string, unknown> }>(
    `/sessions/${sessionId}/messages/${messageId}/meta`,
    meta,
  );
}

/** Subscribe to session events via SSE. */
export function subscribeSessionEvents(
  sessionId: string,
  onEvent: (event: { type: string; event?: AgentEvent }) => void,
  onError?: (error: Error) => void,
  onConnected?: () => void,
): () => void {
  const abortController = new AbortController();

  void (async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/events`, {
        signal: abortController.signal,
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${res.status}: ${err}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data) {
              try {
                const parsed = JSON.parse(data);
                onEvent(parsed);
                if (parsed.type === "connected") {
                  onConnected?.();
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  })();

  return () => abortController.abort();
}

// ============ Agent API ============

/** List all agents. */
export async function listAgents(): Promise<Agent[]> {
  return fetchJson<Agent[]>("/agents");
}

/** Get a single agent by ID. */
export async function getAgent(id: string): Promise<Agent> {
  return fetchJson<Agent>(`/agents/${id}`);
}

/** Create a new agent. */
export async function createAgent(options: CreateAgentRequest): Promise<Agent> {
  const providerId = Number.parseInt(options.providerId, 10);
  return postJson<Agent>("/agents", { ...options, providerId });
}

/** Update an agent. */
export async function updateAgent(id: string, patch: UpdateAgentRequest): Promise<Agent> {
  const providerId =
    patch.providerId === undefined ? undefined : Number.parseInt(String(patch.providerId), 10);
  return patchJson<Agent>(`/agents/${id}`, { ...patch, providerId });
}

/** Delete an agent. */
export async function deleteAgent(id: string): Promise<{ ok: boolean }> {
  return deleteRequest<{ ok: boolean }>(`/agents/${id}`);
}

/** Get resources for an agent. */
export async function getAgentResources(id: string, cwd?: string): Promise<AgentResources> {
  const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
  return fetchJson<AgentResources>(`/agents/${id}/resources${qs}`);
}

/** Get the SYSTEM.md content for an agent. */
export async function getAgentSystemMd(id: string): Promise<{ content: string }> {
  return fetchJson<{ content: string }>(`/agents/${id}/system-md`);
}

/** Set the SYSTEM.md content for an agent. */
export async function setAgentSystemMd(id: string, content: string): Promise<{ content: string }> {
  return putJson<{ content: string }>(`/agents/${id}/system-md`, { content });
}

/** Update agent meta (merges with existing). */
export async function updateAgentMeta(
  id: string,
  meta: Record<string, unknown>,
): Promise<{ meta: Record<string, unknown> }> {
  return patchJson<{ meta: Record<string, unknown> }>(`/agents/${id}/meta`, meta);
}

// ============ Provider API ============

/** List all providers (apiKey is stripped). */
export async function listProviders(): Promise<Provider[]> {
  const providers = await fetchJson<RawProvider[]>("/providers");
  return providers.map(mapProvider);
}

/** Get a single provider by ID. */
export async function getProvider(id: string): Promise<Provider> {
  const provider = await fetchJson<RawProvider>(`/providers/${id}`);
  return mapProvider(provider);
}

/** Create a new provider. */
export async function createProvider(provider: CreateProviderRequest): Promise<Provider> {
  const created = await postJson<RawProvider>("/providers", provider);
  return mapProvider(created);
}

/** Update a provider. */
export async function updateProvider(id: string, patch: UpdateProviderRequest): Promise<Provider> {
  const updated = await patchJson<RawProvider>(`/providers/${id}`, patch);
  return mapProvider(updated);
}

/** Delete a provider. */
export async function deleteProvider(id: string): Promise<{ ok: boolean }> {
  return deleteRequest<{ ok: boolean }>(`/providers/${id}`);
}

/** List models for a provider. */
export async function listProviderModels(id: string): Promise<Model[]> {
  return fetchJson<Model[]>(`/providers/${id}/models`);
}

/** Create a new model for a provider. */
export async function createProviderModel(id: string, model: CreateModelRequest): Promise<Model> {
  return postJson<Model>(`/providers/${id}/models`, model);
}

/** Update a model for a provider. */
export async function updateProviderModel(
  providerId: string,
  modelId: string,
  patch: UpdateModelRequest,
): Promise<Model> {
  return patchJson<Model>(`/providers/${providerId}/models/${modelId}`, patch);
}

/** Delete a model from a provider. */
export async function deleteProviderModel(
  providerId: string,
  modelId: string,
): Promise<{ ok: boolean }> {
  return deleteRequest<{ ok: boolean }>(`/providers/${providerId}/models/${modelId}`);
}

// ============ Session Log API ============

export interface LogEntry {
  t: number;
  l: "debug" | "info" | "warn" | "error";
  m: string;
  tags?: string[];
  meta?: Record<string, unknown>;
}

/** Get session log entries with optional filtering by level and tags. */
export async function getSessionLog(
  id: string,
  options?: { level?: string; tags?: string[] },
): Promise<LogEntry[]> {
  const params = new URLSearchParams();
  if (options?.level) params.set("level", options.level);
  if (options?.tags?.length) params.set("tags", options.tags.join(","));
  const qs = params.toString();
  const body = await fetchJson<{ entries: LogEntry[] }>(`/sessions/${id}/log${qs ? `?${qs}` : ""}`);
  return body.entries;
}

// ============ Resource API ============

/** DB-backed resource kind (global catalog + agent bindings). */
export type CatalogResourceKind = "extension" | "skill" | "prompt" | "mcp" | "tool";

export interface CatalogResource {
  id: number;
  kind: CatalogResourceKind;
  slug: string;
  name: string | null;
  description: string | null;
  sourcePath: string | null;
  version: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentResourceBinding {
  id: number;
  agentId: number;
  resourceId: number;
  enabled: boolean;
  priority: number;
  createdAt: string;
  resource?: CatalogResource;
}

export interface InstallCatalogResourceRequest {
  kind: Exclude<CatalogResourceKind, "tool">;
  source: string;
  slug?: string;
  name?: string;
  description?: string;
  agentId?: string;
  priority?: number;
}

export interface InstallCatalogResourceResult {
  resource: CatalogResource;
  details?: Record<string, unknown>;
  binding?: AgentResourceBinding;
}

/** Get global resource catalog (~/.pi/supervisor/global/). */
export async function getGlobalResources(): Promise<ResourceLayer> {
  return fetchJson<ResourceLayer>("/resources/global");
}

/** List resources registered in the database (optional kind filter). */
export async function listResourceCatalog(kind?: CatalogResourceKind): Promise<CatalogResource[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return fetchJson<CatalogResource[]>(`/resources${qs}`);
}

/** Install a resource into the global catalog; optionally bind to an agent. */
export async function installCatalogResource(
  request: InstallCatalogResourceRequest,
): Promise<InstallCatalogResourceResult> {
  const body: Record<string, unknown> = {
    kind: request.kind,
    source: request.source,
    slug: request.slug,
    name: request.name,
    description: request.description,
    priority: request.priority,
  };
  if (request.agentId !== undefined) {
    body.agentId = Number.parseInt(request.agentId, 10);
  }
  return postJson<InstallCatalogResourceResult>("/resources/install", body);
}

/** Remove a resource from the global catalog (fails if still bound to agents). */
export async function uninstallCatalogResource(
  kind: CatalogResourceKind,
  slug: string,
): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>("/resources/uninstall", { kind, slug });
}

export type BindCatalogResourceRequest =
  | { resourceId: number; priority?: number }
  | { kind: CatalogResourceKind; slug: string; priority?: number };

/** Bind a catalog resource to an agent (database binding). */
export async function bindCatalogResourceToAgent(
  agentId: string,
  request: BindCatalogResourceRequest,
): Promise<{ ok: boolean; binding: AgentResourceBinding }> {
  return postJson<{ ok: boolean; binding: AgentResourceBinding }>(
    `/agents/${agentId}/resources`,
    request,
  );
}

/** Unbind a catalog resource from an agent by resource id. */
export async function unbindCatalogResourceFromAgent(
  agentId: string,
  resourceId: number,
): Promise<{ ok: boolean }> {
  return deleteRequest<{ ok: boolean }>(`/agents/${agentId}/resources/${resourceId}`);
}

/** List database resource bindings for an agent. */
export async function listAgentResourceBindings(
  agentId: string,
  kind?: CatalogResourceKind,
): Promise<AgentResourceBinding[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return fetchJson<AgentResourceBinding[]>(`/agents/${agentId}/resource-bindings${qs}`);
}

/** Resolve a catalog entry by source path, then create a database binding. */
export async function bindAgentResourceBySourcePath(
  agentId: string,
  kind: CatalogResourceKind,
  sourcePath: string,
): Promise<{ ok: boolean; binding: AgentResourceBinding }> {
  const resource = (await listResourceCatalog(kind)).find((item) => item.sourcePath === sourcePath);
  if (!resource) throw new Error(`Resource is not registered in the catalog: ${sourcePath}`);
  return bindCatalogResourceToAgent(agentId, { resourceId: resource.id });
}

// ============ Extension Management API ============

export interface ExtensionInstallResult {
  id: string;
  rootDir: string;
  entryPath: string;
  installCommand: "pnpm" | "npm" | "none";
}

/** List all extensions in the global catalog. */
export async function listExtensions(): Promise<ExtensionResourceInfo[]> {
  return fetchJson<ExtensionResourceInfo[]>("/extensions");
}

/** Install extension from npm:<spec>, git:<url>, or local path. */
export async function installExtension(source: string): Promise<ExtensionInstallResult> {
  const result = await installCatalogResource({ kind: "extension", source });
  const details = result.details ?? {};
  return {
    id: result.resource.slug,
    rootDir:
      typeof details.rootDir === "string" ? details.rootDir : (result.resource.sourcePath ?? ""),
    entryPath: typeof details.entryPath === "string" ? details.entryPath : "",
    installCommand:
      details.installCommand === "pnpm" || details.installCommand === "npm"
        ? details.installCommand
        : "none",
  };
}

/** Remove extension from the global catalog. */
export async function uninstallExtension(id: string): Promise<{ ok: boolean }> {
  return uninstallCatalogResource("extension", id);
}

// ============ Message API ============

/** Search messages with optional filtering. */
export async function searchMessages(
  query: string,
  options?: { sessionId?: string; role?: string; limit?: number },
): Promise<MessageSearchHit[]> {
  const params = new URLSearchParams();
  params.set("q", query);
  if (options?.sessionId) params.set("sessionId", options.sessionId);
  if (options?.role) params.set("role", options.role);
  if (options?.limit) params.set("limit", String(options.limit));
  return fetchJson<MessageSearchHit[]>(`/messages/search?${params.toString()}`);
}

// ============ File API ============

/** Get file content from allowed paths. */
export async function getFileContent(path: string): Promise<FileContentResponse> {
  return fetchJson<FileContentResponse>(`/files/content?path=${encodeURIComponent(path)}`);
}

export interface WorkspaceFileEntry {
  path: string;
  isDirectory: boolean;
}

/** List workspace files for @ autocomplete. */
export async function listWorkspaceFiles(cwd: string): Promise<WorkspaceFileEntry[]> {
  const res = await fetchJson<{ files: WorkspaceFileEntry[] }>(
    `/workspace/files?cwd=${encodeURIComponent(cwd)}`,
  );
  return res.files;
}

export interface PromptImageInput {
  mimeType: string;
  data: string;
}

// ============ Health API ============

/** Health check. */
export async function healthCheck(): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/healthz");
}
