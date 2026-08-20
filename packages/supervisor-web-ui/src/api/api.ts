/**
 * Supervisor Web UI - API Layer
 *
 * 基于 packages/supervisor-web-ui/example/src/mock 的类型定义
 * 对接 packages/supervisor 的 HTTP API
 *
 * 注意：此文件从 example 复制并修改，用于连接真实 API
 */

import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { translate } from "@/i18n";

// ============ Base Types (from supervisor types) ============

export type SessionStatus =
  | "initializing"
  | "active"
  | "running"
  | "blocked"
  | "idle"
  | "finish"
  | "finished"
  | "error"
  | "stopped";
export type ToolsPreset = "coding" | "readonly" | "none";

export interface FeatureModelRef {
  providerId: number;
  modelId: string;
}

export type UtilityFeature = "assistant";

export interface SupervisorSettings {
  utilityProvider?: string;
  utilityModelId?: string;
  featureModels?: Partial<Record<UtilityFeature, FeatureModelRef>>;
  browserMode?: "headless" | "headed";
  webSearchProvider?: "duckduckgo" | "tavily" | "brave" | "serper" | "firecrawl";
  webFetchProvider?:
    | "native"
    | "tavily"
    | "firecrawl"
    | "native-then-tavily"
    | "native-then-firecrawl";
  tavilyApiKeyEnv?: string;
  braveApiKeyEnv?: string;
  serperApiKeyEnv?: string;
  firecrawlApiKeyEnv?: string;
  tavilyApiKeyConfigured?: boolean;
  braveApiKeyConfigured?: boolean;
  serperApiKeyConfigured?: boolean;
  firecrawlApiKeyConfigured?: boolean;
  tavilyApiKey?: string;
  braveApiKey?: string;
  serperApiKey?: string;
  firecrawlApiKey?: string;
  speechRecognitionMode?: "local" | "qwen" | "doubao" | "browser";
  speechRecognitionLanguage?: string;
  localSpeechModelId?: "zh-en-bilingual" | "zh-int8";
  localSpeechConfigured?: boolean;
  localSpeechModels?: LocalSpeechModelStatus[];
  speechApiKeyConfigured?: boolean;
  speechApiKey?: string;
  doubaoSpeechConfigured?: boolean;
  doubaoSpeechApiKey?: string;
  doubaoSpeechPreset?:
    | "2.0-duration"
    | "2.0-concurrent"
    | "1.0-duration"
    | "1.0-concurrent"
    | "2.0-duration-async"
    | "1.0-duration-async";
}

export type LocalSpeechModelId = "zh-en-bilingual" | "zh-int8";

export interface LocalSpeechModelStatus {
  id: LocalSpeechModelId;
  name: string;
  description: string;
  sizeLabel: string;
  installed: boolean;
  installing: boolean;
  progress: number;
  error?: string;
}
export type SessionBranchType = "subagent" | "fork" | "btw";
export type SessionCreationMethod = "user" | "spawn_agent" | "btw" | "fork";

// ============ Domain Types ============

/** Workspace definition */
export interface Workspace {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  cwd: string;
  homeDir: string;
  meta: Record<string, unknown>;
  /** ISO timestamp when Watson project-parse last succeeded; null if never parsed. */
  parsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Session avatar (persisted in the `avatar` column, falls back to meta.avatar on legacy rows). */
export interface SessionAvatar {
  text?: string;
  color?: string;
  icon?: string | null;
}

export type GitChangedFileStatus = "added" | "modified" | "deleted";

export interface SessionGitChangedFile {
  path: string;
  status: GitChangedFileStatus;
}

export interface SessionGitPendingUpdate {
  sourceSessionId: number;
  sourceTitle?: string | null;
  branch: string;
  files: SessionGitChangedFile[];
  markedAt: number;
}

export interface SessionGitMeta {
  worktreePath?: string;
  branch?: string;
  lastCommit?: { hash: string; message: string };
  mergeError?: string;
  pendingUpdate?: SessionGitPendingUpdate;
}

/** Session with UI-specific fields */
export interface Session {
  id: string;
  projectId: string | null;
  parentId: string | null;
  status: SessionStatus;
  cwd: string;
  leafId: string | null;
  agentId: string | null;
  spawnType: SessionBranchType | null;
  creationMethod: SessionCreationMethod;
  /** Derived from spawnType; not persisted. */
  showInSessionList: boolean;
  createdAt: string; // ISO date
  lastActiveAt: string; // ISO date
  lastMessageAt?: string;
  /** Session title (was meta.name). */
  title?: string | null;
  systemPrompt?: string | null;
  /** Session avatar (was meta.avatar). */
  avatar?: SessionAvatar | null;
  /** Builtin/internal session (was meta.builtin). */
  isBuiltin?: boolean;
  pinned?: boolean;
  muted?: boolean;
  unread?: number;
  externalSessionId?: string | null;
  errorMsg?: string | null;
  /** Current workflow stage label (was meta.workflow.stage). */
  stage?: string | null;
  /** Whether Shadow observation is enabled (was meta.shadowDisabled === false — inverted). */
  shadowEnabled?: boolean;
  currentTaskId?: number | null;
  meta: Record<string, unknown>;
  currentTask: string | null;
  /** UI-specific: last message preview */
  lastMessagePreview?: string;
}

export interface TaskArtifact {
  path: string;
  type: "goal" | "plan";
  title: string;
  status: string;
  content: string;
}

export interface TodoItem {
  id?: string | null;
  title: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  dependsOn?: string[];
  sessionId?: number | null;
}

/** Agent definition */
export type AgentPermissionEffect = "ask" | "deny";
export type AgentPermissionRules = Record<string, Record<string, AgentPermissionEffect>>;

export const DEFAULT_AGENT_PERMISSION_RULES: AgentPermissionRules = {
  read: {
    "external/**": "ask",
    "**/.env": "deny",
    "**/.env.*": "deny",
    "**/.ssh/**": "deny",
  },
  write: { "external/**": "ask" },
  edit: { "external/**": "ask" },
  bash: {
    "rm -rf *": "ask",
    "rm -r *": "ask",
    "sudo *": "ask",
    "git push --force*": "ask",
    "git reset --hard*": "ask",
    "chmod -R *": "ask",
    "chown -R *": "ask",
    "Remove-Item * -Recurse*": "ask",
    "Remove-Item -Recurse *": "ask",
    "shutdown*": "ask",
    "reboot*": "ask",
  },
};

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  providerId: string | null;
  backendType: "native" | "codex" | "claude" | "kimi" | "cursor" | "mimo" | "acp";
  modelId: string | null;
  systemPrompt: string | null;
  toolsPreset: ToolsPreset | null;
  homeDir: string | null;
  isBuiltin: boolean;
  externalConfig: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    permissionPolicy?: "allow_once" | "reject_once";
    detectArgs?: string[];
    installCommand?: string;
  } | null;
  permissionRules: AgentPermissionRules;
  meta: Record<string, unknown>;
  available: boolean;
  executablePath: string | null;
  unavailableReason: string | null;
  detectedVersion: string | null;
  compatibility: "compatible" | "unknown" | "unavailable";
  installCommand: string | null;
  createdAt: string;
  updatedAt: string;
  uiMenus?: UiMenuItem[];
}

/** Wire protocol values (vendor-neutral). */
export type WireProtocol = "messages" | "chat-completions" | "responses";

/** Model definition */
export interface Model {
  id: string;
  providerId: string;
  modelId: string;
  name: string | null;
  contextWindow: number;
  supportsVision: boolean;
  createdAt: string;
  updatedAt: string;
}

type RawModel = Omit<Model, "id" | "providerId"> & {
  id: number | string;
  providerId: number | string;
};

function mapModel(model: RawModel): Model {
  return { ...model, id: String(model.id), providerId: String(model.providerId) };
}

/** Provider definition (apiKey is always null in responses) */
export interface Provider {
  id: string;
  slug: string | null;
  name: string;
  icon: string | null;
  protocol: WireProtocol | string;
  baseUrl: string | null;
  apiKey: null; // Always null in responses
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============ Resource Types ============

export type ResourceKind = "skills" | "extensions" | "prompts" | "mcp";

export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  files: Array<{ relativePath: string; content: string }>;
}

export interface PromptTemplateInfo {
  name: string;
  description: string;
  argumentHint?: string;
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

export interface McpResourceInfo {
  id: string;
  name: string;
  description: string;
  filePath: string;
  content: string;
}

export interface ResourceLayer {
  skills: SkillInfo[];
  prompts: PromptTemplateInfo[];
  extensions: ExtensionResourceInfo[];
  mcp: McpResourceInfo[];
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
    enabled: boolean;
  }>;
  layers: {
    agent: ResourceLayer;
    project?: ResourceLayer;
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
  type: "system" | "message" | "toolResult" | "compaction" | "custom";
  /** Copied from parent session via fork */
  isOld: boolean;
  /** User/orchestrator extensions only */
  meta: Record<string, unknown>;
  originMsg?: string | null;
  createdAt: number;
  // For type='system'
  content?: string;
  // For type='custom' (not sent to LLM)
  customType?: string;
  data?: Record<string, unknown>;
  // For type='message'
  message?: {
    role: string;
    content: string | TextPart[] | ToolCallPart[];
    usage?: MessageUsage;
    customType?: string;
    details?: unknown;
  };
  // For type='toolResult'
  toolCallId?: string;
  toolName?: string;
  // For type='compaction'
  summary?: string;
  firstKeptEntryId?: string;
  tokensBefore?: number;
}

export interface MessageUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}

export interface SessionUsage extends MessageUsage {
  messages: number;
}

export interface TimelineEvent {
  id: string;
  type: "session" | "todo_task" | "goal";
  entityId: string;
  projectId: string | null;
  kind: "created" | "status_changed" | "phase_changed" | string;
  status: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface MessageSearchHit {
  messageId: string;
  sessionId: string;
  role: string | null;
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
  icon?: string;
  arguments?: { type: "none" } | { type: "text"; required?: boolean; placeholder?: string };
  /** Additional metadata */
  sourceInfo?: {
    path?: string;
    name?: string;
    description?: string;
  };
}

export interface CodexModelInfo {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }>;
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
  /** Reply text currently streaming; used to resume the thinking UI after refresh. */
  streamingReply?: string;
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

// ============ SSE Event Types ============

export type SseEventType = "started" | "event" | "done" | "error";

export interface ShadowSuggestionsEvent {
  type: "shadow_suggestions";
  questions: string[];
  timestamp: number;
}

export interface ShadowRunningEvent {
  type: "shadow_running";
  running: boolean;
  timestamp: number;
}

export interface ShadowMessageEvent {
  type: "shadow_message";
  entryId: string;
  message: string;
  level: "error" | "warning" | "info";
  timestamp: number;
}

/** Operational toast from backend (not an LLM error card). */
export interface UiNotifyEvent {
  type: "ui_notify";
  kind: "error" | "info" | "success";
  message: string;
  timestamp: number;
}

/** Create-time readiness updates (worktree / runtime prep). */
export interface SessionStatusEvent {
  type: "session_status";
  status: SessionStatus;
  timestamp: number;
}

/** Project services registration / active preview updates. */
export interface SessionServicesEvent {
  type: "session_services";
  services: unknown;
  timestamp: number;
}

export interface ApprovalPendingEvent {
  type: "approval.pending";
  sessionId: string | number;
  approvalId: string;
  kind: string;
  title: string;
  body: string;
  actions: Array<"approve" | "approve_session" | "reject" | "revise">;
}

export interface MessageMetaUpdatedEvent {
  type: "message_meta_updated";
  messageId: string;
  meta: Record<string, unknown>;
  timestamp: number;
}

export type SessionStreamEvent =
  | AgentEvent
  | ShadowSuggestionsEvent
  | ShadowRunningEvent
  | ShadowMessageEvent
  | UiNotifyEvent
  | SessionStatusEvent
  | SessionServicesEvent
  | MessageMetaUpdatedEvent
  | ApprovalPendingEvent;

export interface SseEvent {
  type: SseEventType;
  sessionId?: string;
  event?: SessionStreamEvent;
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
  spawnType?: SessionBranchType | null;
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

export interface ExternalSessionCandidate {
  backend: "codex" | "claude";
  externalSessionId: string;
  cwd: string;
  title: string;
  preview: string;
  lastActiveAt: string;
  imported?: boolean;
  importedSessionId?: number;
}

export interface ExternalSessionPage {
  items: ExternalSessionCandidate[];
  hasMore: boolean;
  nextOffset: number;
}

export interface CreateProjectRequest {
  name?: string;
  description?: string | null;
  cwd: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string | null;
  meta?: Record<string, unknown>;
}

export interface CreateAgentRequest {
  id?: string;
  name: string;
  description?: string;
  avatar?: string | null;
  backendType?: "native" | "codex" | "claude" | "kimi" | "cursor" | "mimo" | "acp";
  modelId?: string;
  toolsPreset?: ToolsPreset;
  homeDir?: string;
  externalConfig?: Agent["externalConfig"];
  permissionRules?: AgentPermissionRules;
  meta?: Record<string, unknown>;
  systemPrompt?: string;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  avatar?: string | null;
  backendType?: "native" | "codex" | "claude" | "kimi" | "cursor" | "mimo" | "acp";
  modelId?: string | null;
  systemPrompt?: string | null;
  toolsPreset?: ToolsPreset;
  homeDir?: string;
  externalConfig?: Agent["externalConfig"];
  permissionRules?: AgentPermissionRules;
  meta?: Record<string, unknown>;
}

export interface CreateModelRequest {
  modelId: string;
  name?: string;
  contextWindow?: number;
  supportsVision?: boolean;
}

export interface UpdateModelRequest {
  name?: string;
  contextWindow?: number;
  supportsVision?: boolean;
}

export interface UpdateProviderRequest {
  slug?: string | null;
  isEnabled?: boolean;
  name?: string;
  protocol?: WireProtocol | string;
  baseUrl?: string | null;
  icon?: string | null;
  apiKey?: string | null;
}

export interface CreateProviderRequest {
  slug?: string | null;
  name: string;
  icon?: string | null;
  protocol: WireProtocol | string;
  baseUrl?: string | null;
  apiKey?: string | null;
  isEnabled?: boolean;
}

export interface ForkSessionRequest {
  entryId?: string;
  agentId?: string;
  label?: string;
  customInstructions?: string;
}

export interface UiMenuItem {
  id: string;
  surface: "session" | "message";
  label: string;
  icon?: string;
  order?: number;
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

import { getMobileServerPin, getMobileServerUrl } from "../utils/mobile-server-config";

function getApiBase(): string {
  const mobileUrl = getMobileServerUrl();
  if (mobileUrl) return mobileUrl;
  return import.meta.env.VITE_API_BASE ?? "";
}

interface RawProvider {
  id: number;
  slug: string | null;
  name: string;
  icon: string | null;
  protocol: WireProtocol | string;
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
  description: string | null;
  cwd: string;
  homeDir: string;
  meta: Record<string, unknown>;
  parsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapProject(raw: RawProject): Project {
  return {
    ...raw,
    id: String(raw.id),
    parsedAt: raw.parsedAt ?? null,
  };
}

interface RawSession {
  id: number;
  projectId: number | null;
  parentId: number | null;
  status: SessionStatus;
  cwd: string;
  leafId: string | null;
  agentId: number | null;
  spawnType: SessionBranchType | null;
  creationMethod?: SessionCreationMethod;
  createdAt: string;
  lastActiveAt: string;
  title?: string | null;
  systemPrompt?: string | null;
  avatar?: SessionAvatar | null;
  isBuiltin?: boolean;
  pinned?: boolean;
  muted?: boolean;
  unread?: number;
  externalSessionId?: string | null;
  errorMsg?: string | null;
  stage?: string | null;
  shadowEnabled?: boolean;
  currentTaskId?: number | null;
  meta: Record<string, unknown>;
  currentTask?: Session["currentTask"];
  lastMessagePreview?: string;
  lastMessageAt?: string;
}

function mapSession(raw: RawSession): Session {
  return {
    ...raw,
    id: String(raw.id),
    projectId: raw.projectId === null ? null : String(raw.projectId),
    parentId: raw.parentId === null ? null : String(raw.parentId),
    agentId: raw.agentId === null ? null : String(raw.agentId),
    creationMethod:
      raw.creationMethod ??
      (raw.spawnType === "subagent" ? "spawn_agent" : (raw.spawnType ?? "user")),
    showInSessionList: raw.spawnType === null || raw.spawnType === "fork",
    currentTask: raw.currentTask ?? null,
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

/** True when a fetch/stream was intentionally cancelled via AbortController. */
function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  if (name === "AbortError") return true;
  // Some browsers surface aborted body reads without a standard AbortError name.
  const message = error instanceof Error ? error.message : String(error);
  return /BodyStreamBuffer was aborted|The user aborted a request/i.test(message);
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, withAuth(options));
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    const trimmed = err.trim();
    if (trimmed === "NOT_FOUND" || res.status === 404) {
      throw new Error(translate("api.notFound"));
    }
    try {
      const parsed = JSON.parse(err) as { error?: string; message?: string };
      const message = parsed.error ?? parsed.message;
      if (typeof message === "string" && message.trim()) {
        const lower = message.trim().toLowerCase();
        if (lower === "not found" || lower === "not_found") {
          throw new Error(translate("api.notFound"));
        }
        throw new Error(message);
      }
    } catch (error) {
      // 仅重新抛出业务 Error，忽略 JSON.parse 的 SyntaxError
      if (error instanceof Error && !(error instanceof SyntaxError)) throw error;
    }
    throw new Error(trimmed ? `HTTP ${res.status}: ${trimmed}` : `HTTP ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(translate("api.nonJson", { path }));
  }
  return res.json() as Promise<T>;
}

const WEB_PASSWORD_KEY = "pi-supervisor-web-password";

let tunnelQuickCached: boolean | null = null;

function withAuth(options: RequestInit = {}): RequestInit {
  const password = readStoredPassword();
  if (!password) return options;
  const headers = new Headers(options.headers);
  headers.set("x-supervisor-password", password);
  return { ...options, headers };
}

function readStoredPassword(): string {
  if (typeof localStorage === "undefined") return "";
  const mobilePin = getMobileServerPin();
  if (mobilePin) return mobilePin;
  return localStorage.getItem(WEB_PASSWORD_KEY) ?? "";
}

function hostnameLooksLikeQuickTunnel(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.endsWith(".trycloudflare.com");
}

/** Prefer server flag; fall back to hostname for Quick Tunnel pages. */
export async function shouldUseSessionWebSocket(): Promise<boolean> {
  if (tunnelQuickCached !== null) return tunnelQuickCached;
  if (hostnameLooksLikeQuickTunnel()) {
    tunnelQuickCached = true;
    return true;
  }
  try {
    const response = await fetch(`${getApiBase()}/healthz`);
    if (response.ok) {
      const body = (await response.json()) as { tunnelQuick?: boolean };
      tunnelQuickCached = Boolean(body.tunnelQuick);
      return tunnelQuickCached;
    }
  } catch {
    // ignore — fall through
  }
  tunnelQuickCached = false;
  return false;
}

function sessionWebSocketUrl(): string {
  const base = new URL(getApiBase() || window.location.origin);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `${base.pathname.replace(/\/$/, "")}/ws`;
  const password = readStoredPassword();
  base.search = password ? `?password=${encodeURIComponent(password)}` : "";
  return base.toString();
}

function openSessionSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(sessionWebSocketUrl());
    const timer = window.setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket connection timeout"));
    }, 15_000);
    ws.addEventListener("open", () => {
      window.clearTimeout(timer);
      resolve(ws);
    });
    ws.addEventListener("error", () => {
      window.clearTimeout(timer);
      reject(new Error("WebSocket connection failed"));
    });
  });
}

export function saveWebPassword(password: string): void {
  localStorage.setItem(WEB_PASSWORD_KEY, password);
}

export function clearWebPassword(): void {
  localStorage.removeItem(WEB_PASSWORD_KEY);
}

export async function getAuthStatus(): Promise<{
  required: boolean;
  authenticated: boolean;
  tunnelQuick?: boolean;
}> {
  const response = await fetch(`${getApiBase()}/auth/status`, withAuth());
  // Backward compatibility while the web UI and Supervisor process are being
  // upgraded independently: an older server has no auth endpoint and therefore
  // must be treated as password protection disabled.
  if (response.status === 404) return { required: false, authenticated: true };
  if (!response.ok) throw new Error(translate("api.authStatusFailed"));
  const body = (await response.json()) as {
    required: boolean;
    authenticated: boolean;
    tunnelQuick?: boolean;
  };
  if (typeof body.tunnelQuick === "boolean") {
    tunnelQuickCached = body.tunnelQuick || hostnameLooksLikeQuickTunnel();
  }
  return body;
}

/** Upload an avatar image and return its public path. */
export async function uploadIcon(file: File): Promise<{ path: string }> {
  const body = new FormData();
  body.append("file", file);
  return fetchJson<{ path: string }>("/upload/icons", { method: "POST", body });
}

/** Upload an image into supervisor public static dir (~/.pi/supervisor/public). */
export async function uploadPublicFile(file: File): Promise<{ path: string }> {
  const body = new FormData();
  body.append("file", file);
  return fetchJson<{ path: string }>("/upload/public", { method: "POST", body });
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

export function getSupervisorSettings(): Promise<SupervisorSettings> {
  return fetchJson<SupervisorSettings>("/settings");
}

export function updateSupervisorSettings(
  patch: Partial<SupervisorSettings>,
): Promise<SupervisorSettings> {
  return patchJson<SupervisorSettings>("/settings", patch);
}

export function listLocalSpeechModels(): Promise<{
  selectedId: LocalSpeechModelId;
  models: LocalSpeechModelStatus[];
}> {
  return fetchJson("/settings/local-speech/models");
}

export function installLocalSpeechModel(id: LocalSpeechModelId): Promise<{
  selectedId: LocalSpeechModelId;
  models: LocalSpeechModelStatus[];
}> {
  return postJson("/settings/local-speech/install", { id });
}

export function testSettingsApiKey(
  provider: "qwen" | "doubao" | "tavily" | "brave" | "serper" | "firecrawl",
  apiKey?: string,
  options?: {
    preset?: SupervisorSettings["doubaoSpeechPreset"];
  },
): Promise<{ ok: true }> {
  return postJson<{ ok: true }>("/settings/test-api-key", { provider, apiKey, ...options });
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

export type ClientCacheGroupKey = "project-session" | "agents" | "provider-model" | "messages";

export type ProjectSessionSnapshot = {
  projects: Project[];
  sessions: Session[];
};

export type ProviderModelSnapshot = {
  providers: Provider[];
  models: Record<string, Model[]>;
};

export type ClientCacheSyncRequest = {
  resources: Array<{
    key: string;
    queryKey?: string;
    fingerprint?: string | null;
    savedAt?: number;
  }>;
};

export type ClientCacheSyncResponse = {
  resources: Array<{
    key: string;
    queryKey?: string;
    status: "updated" | "unchanged" | "deleted";
    fingerprint: string;
    data?: unknown;
    syncedAt: number;
  }>;
};

export function syncClientCache(request: ClientCacheSyncRequest): Promise<ClientCacheSyncResponse> {
  return postJson<ClientCacheSyncResponse>("/client-cache/sync", request).then((response) => ({
    ...response,
    resources: response.resources.map((resource) => {
      if (resource.data === undefined) return resource;
      if (resource.key === "project-session") {
        const data = resource.data as {
          projects?: RawProject[];
          sessions?: RawSession[];
        };
        return {
          ...resource,
          data: {
            projects: (data.projects ?? []).map(mapProject),
            sessions: (data.sessions ?? []).map(mapSession),
          },
        };
      }
      if (resource.key === "agents")
        return { ...resource, data: (resource.data as RawAgent[]).map(mapAgent) };
      if (resource.key === "projects")
        return { ...resource, data: (resource.data as RawProject[]).map(mapProject) };
      if (resource.key === "providers")
        return { ...resource, data: (resource.data as RawProvider[]).map(mapProvider) };
      if (resource.key === "providers:models")
        return { ...resource, data: (resource.data as RawModel[]).map(mapModel) };
      if (resource.key === "sessions")
        return { ...resource, data: (resource.data as RawSession[]).map(mapSession) };
      if (resource.key === "provider-model") {
        const data = resource.data as {
          providers?: RawProvider[];
          models?: Record<string, RawModel[]>;
        };
        return {
          ...resource,
          data: {
            providers: (data.providers ?? []).map(mapProvider),
            models: Object.fromEntries(
              Object.entries(data.models ?? {}).map(([providerId, models]) => [
                providerId,
                models.map(mapModel),
              ]),
            ),
          },
        };
      }
      return resource;
    }),
  }));
}

export async function listProjectSessionSnapshot(): Promise<ProjectSessionSnapshot> {
  const [projects, sessions] = await Promise.all([listProjects(), listSessions()]);
  return { projects, sessions };
}

export async function listProviderModelSnapshot(): Promise<ProviderModelSnapshot> {
  const providers = await listProviders();
  const models = Object.fromEntries(
    await Promise.all(
      providers.map(
        async (provider) => [provider.id, await listProviderModels(provider.id)] as const,
      ),
    ),
  );
  return { providers, models };
}

export async function createProject(options: CreateProjectRequest): Promise<Project> {
  const project = await postJson<RawProject>("/projects", options);
  return mapProject(project);
}

export async function getProject(id: string): Promise<Project> {
  const project = await fetchJson<RawProject>(`/projects/${id}`);
  return mapProject(project);
}

export async function updateProject(id: string, options: UpdateProjectRequest): Promise<Project> {
  const project = await patchJson<RawProject>(`/projects/${id}`, options);
  return mapProject(project);
}

export async function deleteProject(id: string, name: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/projects/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export interface ProjectGitResult {
  ok: true;
  stdout: string;
  stderr: string;
}

export interface ProjectGitInfo {
  currentBranch: string;
  branches: string[];
}

export async function getProjectGitInfo(id: string): Promise<ProjectGitInfo> {
  return fetchJson<ProjectGitInfo>(`/projects/${id}/git`);
}

export async function pullProjectGit(id: string): Promise<ProjectGitResult> {
  return postJson<ProjectGitResult>(`/projects/${id}/git/pull`, {});
}

export async function checkoutProjectGit(id: string, branch: string): Promise<ProjectGitResult> {
  return postJson<ProjectGitResult>(`/projects/${id}/git/checkout`, { branch });
}

export async function pushProjectGit(id: string): Promise<ProjectGitResult> {
  return postJson<ProjectGitResult>(`/projects/${id}/git/push`, {});
}

export async function pickDirectory(
  defaultPath?: string,
): Promise<{ cancelled: boolean; path: string | null }> {
  return postJson<{ cancelled: boolean; path: string | null }>("/system/pick-directory", {
    defaultPath,
  });
}

/** Check whether a path exists on the supervisor host filesystem. */
export async function pathExists(path: string): Promise<{ exists: boolean; path: string | null }> {
  return postJson<{ exists: boolean; path: string | null }>("/system/path-exists", { path });
}

/** Open a path in the supervisor host OS file manager (Explorer / Finder / xdg-open). */
export async function openPath(path: string): Promise<{ ok: true; path: string }> {
  return postJson<{ ok: true; path: string }>("/system/open-path", { path });
}

export async function parseProject(id: string): Promise<{
  description: string | null;
  status: "ready" | "skipped" | "error";
  error?: string;
  project: Project;
}> {
  const result = await postJson<{
    description: string | null;
    status: "ready" | "skipped" | "error";
    error?: string;
    project: RawProject;
  }>(`/projects/${id}/parse`, {});
  return {
    ...result,
    project: mapProject(result.project),
  };
}

export async function getAgentLogs(
  id: string,
  options?: { limit?: number },
): Promise<{ agentId: number; files: string[]; text: string }> {
  const query = options?.limit != null ? `?limit=${options.limit}` : "";
  return fetchJson(`/agents/${id}/logs${query}`);
}

export async function getWatsonLogs(options?: { limit?: number }): Promise<{
  files: string[];
  text: string;
}> {
  const query = options?.limit ? `?limit=${options.limit}` : "";
  return fetchJson(`/system/watson/logs${query}`);
}

export async function getSystemLogs(options?: { limit?: number }): Promise<{
  files: string[];
  text: string;
}> {
  const query = options?.limit ? `?limit=${options.limit}` : "";
  return fetchJson(`/system/logs${query}`);
}

// ============ Home API ============

export type HomeTaskStatus = "backlog" | "todo" | "in_progress" | "blocked" | "done" | "error";
export type HomeTaskPriority = "urgent" | "high" | "normal" | "low";
export type HomeTaskPhase =
  | "draft"
  | "planning"
  | "awaiting_confirm"
  | "executing"
  | "done"
  | "error";

export interface HomeTask {
  id: number;
  title: string;
  description: string;
  projectId: number | null;
  status: HomeTaskStatus;
  priority: HomeTaskPriority;
  parentId: number | null;
  sessionId: number | null;
  agentId: number | null;
  dependsOn: number[];
  subagentIds: number[];
  phase: HomeTaskPhase;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyWorkRecord {
  dayKey: string;
  summary: string;
  sections: Array<{
    projectId: number;
    projectName: string;
    cwd: string;
    commits: Array<{
      hash: string;
      shortHash: string;
      subject: string;
      author: string;
      timestamp: number;
    }>;
  }>;
  generatedAt: string;
  usedModel: boolean;
}

export function listDailyWork(params?: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<DailyWorkRecord[]> {
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return fetchJson<DailyWorkRecord[]>(`/home/daily-work${qs ? `?${qs}` : ""}`);
}

export function runDailyWork(day?: string): Promise<DailyWorkRecord> {
  return postJson<DailyWorkRecord>("/home/daily-work/run", day ? { day } : {});
}

export function listTimelineEvents(options?: {
  from?: string;
  to?: string;
  projectId?: string;
  type?: "session" | "todo_task" | "goal";
}) {
  const params = new URLSearchParams();
  if (options?.from) params.set("from", options.from);
  if (options?.to) params.set("to", options.to);
  if (options?.projectId) params.set("projectId", options.projectId);
  if (options?.type) params.set("type", options.type);
  const qs = params.toString();
  return fetchJson<TimelineEvent[]>(`/home/timeline-events${qs ? `?${qs}` : ""}`);
}

export function recordGoalEvent(body: { objective: string; source?: string }) {
  return postJson<{ ok: boolean }>("/home/goal-events", body);
}

export function listHomeTasks(params?: {
  parentId?: number | null;
  projectId?: number;
}): Promise<HomeTask[]> {
  const search = new URLSearchParams();
  if (params?.parentId === null) search.set("parentId", "null");
  else if (typeof params?.parentId === "number") search.set("parentId", String(params.parentId));
  if (typeof params?.projectId === "number") search.set("projectId", String(params.projectId));
  const qs = search.toString();
  return fetchJson<HomeTask[]>(`/home/tasks${qs ? `?${qs}` : ""}`);
}

export function createHomeTask(body: {
  title: string;
  description?: string;
  projectId?: number | null;
  status?: HomeTaskStatus;
  priority?: HomeTaskPriority;
}): Promise<HomeTask> {
  return postJson<HomeTask>("/home/tasks", body);
}

export function updateHomeTask(
  id: number,
  patch: Partial<{
    title: string;
    description: string;
    projectId: number | null;
    agentId: number | null;
    dependsOn: number[];
    subagentIds: number[];
    status: HomeTaskStatus;
    priority: HomeTaskPriority;
    phase: HomeTaskPhase;
    error: string | null;
  }>,
): Promise<HomeTask> {
  return patchJson<HomeTask>(`/home/tasks/${id}`, patch);
}

export function deleteHomeTask(id: number): Promise<{ ok: boolean }> {
  return deleteRequest<{ ok: boolean }>(`/home/tasks/${id}`);
}

export function planHomeTask(id: number): Promise<{ task: HomeTask; children: HomeTask[] }> {
  return postJson(`/home/tasks/${id}/plan`, {});
}

export function confirmHomeTask(id: number): Promise<{ task: HomeTask; children: HomeTask[] }> {
  return postJson(`/home/tasks/${id}/confirm`, {});
}

/** @deprecated Prefer planHomeTask */
export function decomposeHomeTask(id: number): Promise<{ task: HomeTask; children: HomeTask[] }> {
  return planHomeTask(id);
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

export interface WorktreeCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  timestamp: number;
}

export function getSessionCommits(id: string): Promise<WorktreeCommit[]> {
  return fetchJson<WorktreeCommit[]>(`/sessions/${id}/commits`);
}

export function setSessionSubagents(
  id: string,
  agentIds: string[],
): Promise<{ agentIds: number[] }> {
  return putJson<{ agentIds: number[] }>(`/sessions/${id}/subagents`, {
    agentIds: agentIds.map(Number).filter(Number.isInteger),
  });
}

/** Create/Spawn a new session. */
export async function createSession(options: CreateSessionRequest): Promise<Session> {
  const session = await postJson<RawSession>("/sessions", toCreateSessionBody(options));
  return mapSession(session);
}

export function listExternalSessions(
  options: { limit?: number; offset?: number } = {},
): Promise<ExternalSessionPage> {
  const limit = options.limit ?? 40;
  const offset = options.offset ?? 0;
  return fetchJson<ExternalSessionPage>(`/external-sessions?limit=${limit}&offset=${offset}`);
}

export async function importExternalSession(options: {
  backend: "codex" | "claude";
  externalSessionId: string;
  replace?: boolean;
}): Promise<Session> {
  const session = await postJson<RawSession>("/external-sessions/import", options);
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

/** Merge the project current branch into this session and restart its project services. */
export async function syncSession(id: string): Promise<Session> {
  const session = await postJson<RawSession>(`/sessions/${id}/sync`, {});
  return mapSession(session);
}

export interface SessionServicesSnapshot {
  status:
    | "registered"
    | "starting"
    | "running"
    | "active"
    | "idle"
    | "stopped"
    | "error"
    | "unregistered"
    | "none";
  sleepAt?: number;
  installedAt?: string;
  services: Array<{
    name: string;
    port: number;
    path?: string;
  }>;
  views: Array<{
    name: string;
    service: string;
    port: number;
    path?: string;
  }>;
  previews: Array<{
    name: string;
    port: number;
    path?: string;
    previewUrl: string;
    scriptName?: string;
    label?: string;
  }>;
  error?: string;
}

export async function getSessionServices(id: string): Promise<SessionServicesSnapshot> {
  return fetchJson<SessionServicesSnapshot>(`/sessions/${id}/services`);
}

export async function wakeSessionServices(id: string): Promise<SessionServicesSnapshot> {
  return postJson<SessionServicesSnapshot>(`/sessions/${id}/services/wake`, {});
}

export function buildSessionPreviewUrl(sessionId: string, scriptName: string, path = "/"): string {
  const base = getApiBase();
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  const encoded = encodeURIComponent(scriptName);
  const url = normalized
    ? `${base}/sessions/${sessionId}/preview/${encoded}/${normalized}`
    : `${base}/sessions/${sessionId}/preview/${encoded}/`;
  const password = readStoredPassword();
  if (!password) return url;
  return `${url}${url.includes("?") ? "&" : "?"}password=${encodeURIComponent(password)}`;
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

export async function rewindSessionToEntry(id: string, entryId: string): Promise<Session> {
  const session = await postJson<RawSession>(`/sessions/${id}/rewind`, { entryId });
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
 * Send a prompt to a session and receive events via SSE (or WebSocket under Quick Tunnel).
 * Returns a cleanup function to abort the connection.
 */
export function promptSession(
  id: string,
  message: string,
  onEvent: (event: SessionStreamEvent) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void,
  images?: PromptImageInput[],
  pastedTexts?: Array<{ id: string; text: string }>,
  attachments?: SessionAttachmentInput[],
): () => void {
  const abortController = new AbortController();
  let ws: WebSocket | null = null;

  void (async () => {
    try {
      if (await shouldUseSessionWebSocket()) {
        ws = await openSessionSocket();
        if (abortController.signal.aborted) {
          ws.close();
          return;
        }
        const requestId = `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await new Promise<void>((resolve, reject) => {
          const onMessage = (event: MessageEvent) => {
            let parsed: {
              id?: string;
              channel?: string;
              type?: string;
              event?: SessionStreamEvent;
              error?: string;
            };
            try {
              parsed = JSON.parse(String(event.data)) as typeof parsed;
            } catch {
              return;
            }
            if (parsed.channel !== "session") return;
            if (parsed.id && parsed.id !== requestId) return;
            if (parsed.type === "event" && parsed.event) {
              onEvent(parsed.event);
            } else if (parsed.type === "error") {
              cleanup();
              reject(new Error(parsed.error || "prompt failed"));
            } else if (parsed.type === "done" || parsed.type === "queued") {
              cleanup();
              resolve();
            }
          };
          const cleanup = () => {
            ws?.removeEventListener("message", onMessage);
            ws?.close();
            ws = null;
          };
          abortController.signal.addEventListener(
            "abort",
            () => {
              cleanup();
              resolve();
            },
            { once: true },
          );
          ws!.addEventListener("message", onMessage);
          ws!.send(
            JSON.stringify({
              id: requestId,
              channel: "session",
              type: "prompt",
              sessionId: id,
              message,
              images: images?.length ? images : undefined,
              pastedTexts: pastedTexts?.length ? pastedTexts : undefined,
              attachments: attachments?.length ? attachments : undefined,
            }),
          );
        });
        onComplete?.();
        return;
      }

      const res = await fetch(
        `${getApiBase()}/sessions/${id}/prompt`,
        withAuth({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            images: images?.length ? images : undefined,
            pastedTexts: pastedTexts?.length ? pastedTexts : undefined,
            attachments: attachments?.length ? attachments : undefined,
          }),
          signal: abortController.signal,
        }),
      );

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
      if (isAbortError(error) || abortController.signal.aborted) return;
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  })();

  return () => {
    abortController.abort();
    ws?.close();
  };
}

/** Steer the active turn in a session. */
export async function steerSession(
  id: string,
  message: string,
  images?: PromptImageInput[],
): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/sessions/${id}/steer`, { message, images });
}

/** Enqueue a follow-up message for the next turn. */
export type SessionInputDisposition = "interrupt" | "queued" | "drained";

export interface QueuedSessionInput {
  id: string;
  message: string;
  level: number;
  source: string | null;
  enqueuedAt: number;
  images?: PromptImageInput[];
  displayMessage?: string;
  pastedTexts?: Array<{ id: string; text: string; chars?: number }>;
  attachments?: SessionAttachmentInput[];
}

export async function followUpSession(
  id: string,
  message: string,
  images?: PromptImageInput[],
  pastedTexts?: Array<{ id: string; text: string }>,
  attachments?: SessionAttachmentInput[],
): Promise<{ ok: boolean; disposition: SessionInputDisposition }> {
  return postJson<{ ok: boolean; disposition: SessionInputDisposition }>(
    `/sessions/${id}/follow-up`,
    {
      message,
      images,
      pastedTexts: pastedTexts?.length ? pastedTexts : undefined,
      attachments: attachments?.length ? attachments : undefined,
    },
  );
}

/** List inputs that have been accepted but have not started executing. */
export async function getQueuedSessionInputs(id: string): Promise<QueuedSessionInput[]> {
  return fetchJson<QueuedSessionInput[]>(`/sessions/${id}/queued-inputs`);
}

/** Remove a queued input without sending. */
export async function cancelQueuedSessionInput(
  sessionId: string,
  inputId: string,
): Promise<{ ok: boolean }> {
  return deleteRequest<{ ok: boolean }>(`/sessions/${sessionId}/queued-inputs/${inputId}`);
}

/** Interrupt the active turn and send this queued input immediately. */
export async function submitQueuedSessionInput(
  sessionId: string,
  inputId: string,
): Promise<{ ok: boolean; input: QueuedSessionInput }> {
  return postJson<{ ok: boolean; input: QueuedSessionInput }>(
    `/sessions/${sessionId}/queued-inputs/${inputId}/submit`,
    {},
  );
}

export type JobStatus =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface SessionTimer {
  id: string;
  sessionId: number;
  kind: string;
  name: string;
  label: string;
  prompt: string;
  nextRunAt: number;
  intervalMs?: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export function getSessionTimers(id: string): Promise<{ timers: SessionTimer[] }> {
  return fetchJson<{ timers: SessionTimer[] }>(`/sessions/${id}/timers`);
}

export interface SessionShell {
  id: string;
  kind: "bash" | "service" | "eval";
  title: string;
  status: JobStatus | "active";
  output: string;
  command?: string;
  cwd?: string;
  createdAt: number;
  updatedAt: number;
  capabilities: Array<"cancel" | "input" | "read_output" | "retry">;
  metadata: Record<string, unknown>;
}

export interface SessionShellsSnapshot {
  shells: SessionShell[];
}

export function getSessionShells(id: string): Promise<SessionShellsSnapshot> {
  return fetchJson<SessionShellsSnapshot>(`/sessions/${id}/shells`);
}

export function sendSessionShellInput(
  sessionId: string,
  shellId: string,
  input: string,
): Promise<{ ok: boolean }> {
  return postJson(`/sessions/${sessionId}/shells/${shellId}/input`, { input });
}

export function cancelSessionShell(
  sessionId: string,
  shellId: string,
): Promise<{ shell: SessionShell }> {
  return fetchJson(`/sessions/${sessionId}/shells/${shellId}`, { method: "DELETE" });
}

/** Abort the current work in a session. */
export async function abortSession(
  id: string,
  options?: { retractIfNoAssistant?: boolean },
): Promise<{ ok: boolean; retracted: boolean }> {
  return postJson<{ ok: boolean; retracted: boolean }>(`/sessions/${id}/abort`, options ?? {});
}

/** Retry after an LLM failure (clears error card and continues the turn). */
export async function retrySession(id: string): Promise<Session> {
  return postJson<Session>(`/sessions/${id}/retry`, {});
}

/** Submit an answer for a pending ask tool call. */
export async function submitAskAnswer(
  sessionId: string,
  toolCallId: string,
  answers: Array<{ id: string; value: string; label: string }>,
): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/sessions/${sessionId}/ask-answer`, { toolCallId, answers });
}

export async function resolveSessionApproval(
  sessionId: string,
  approvalId: string,
  result:
    | { action: "approve" | "approve_session" | "reject" }
    | { action: "revise"; feedback: string },
): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/sessions/${sessionId}/approval-resolve`, {
    approvalId,
    result,
  });
}

export async function getPendingSessionApprovals(
  sessionId: string,
): Promise<ApprovalPendingEvent[]> {
  const result = await fetchJson<{ approvals: ApprovalPendingEvent[] }>(
    `/sessions/${sessionId}/approvals`,
  );
  return result.approvals;
}

export interface ExternalInteractionResponse {
  action: "approve" | "approve_session" | "deny" | "cancel" | "answer";
  answers?: Record<string, string[]>;
  optionId?: string;
}

export function respondToExternalInteraction(
  sessionId: string,
  interactionId: string,
  response: ExternalInteractionResponse,
): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(
    `/sessions/${sessionId}/external-interactions/${encodeURIComponent(interactionId)}/respond`,
    response,
  );
}

/** Compact the session context with optional custom instructions. */
export async function compactSession(
  id: string,
  customInstructions?: string,
): Promise<CompactResult> {
  return postJson<CompactResult>(`/sessions/${id}/compact`, { customInstructions });
}

/** Set the thinking level for a session. */
export async function setSessionThinkingLevel(id: string, level: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/sessions/${id}/thinking-level`, { level });
}

/** Get the full message history for a session (legacy unpaged). */
export async function getSessionMessages(id: string): Promise<SessionTreeEntry[]> {
  return fetchJson<SessionTreeEntry[]>(`/sessions/${id}/messages`);
}

export function getSessionUsage(id: string): Promise<SessionUsage> {
  return fetchJson<SessionUsage>(`/sessions/${id}/usage`);
}

export interface SessionMessagesPage {
  messages: SessionTreeEntry[];
  hasMore: boolean;
  oldestRowId: number | null;
  newestRowId: number | null;
}

/** Paginated chat history; default view is lite (truncated heavy fields). */
export async function getSessionMessagesPage(
  id: string,
  options?: { limit?: number; beforeId?: number; view?: "lite" | "full" },
): Promise<SessionMessagesPage> {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? 80));
  if (options?.beforeId != null) params.set("beforeId", String(options.beforeId));
  if (options?.view) params.set("view", options.view);
  const data = await fetchJson<SessionMessagesPage | SessionTreeEntry[]>(
    `/sessions/${id}/messages?${params.toString()}`,
  );
  // Legacy backends ignore limit/view and return a bare array.
  if (Array.isArray(data)) {
    return {
      messages: data,
      hasMore: false,
      oldestRowId: null,
      newestRowId: null,
    };
  }
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    hasMore: Boolean(data.hasMore),
    oldestRowId: typeof data.oldestRowId === "number" ? data.oldestRowId : null,
    newestRowId: typeof data.newestRowId === "number" ? data.newestRowId : null,
  };
}

/** Full single message payload (for opening truncated tool results etc.). */
export async function getSessionMessage(id: string, entryId: string): Promise<SessionTreeEntry> {
  return fetchJson<SessionTreeEntry>(`/sessions/${id}/messages/${encodeURIComponent(entryId)}`);
}

/** Read task artifacts; default summary from session meta without disk reads. */
export async function getSessionTasks(
  id: string,
  options?: { includeContent?: boolean },
): Promise<TaskArtifact[]> {
  const params = new URLSearchParams();
  if (options?.includeContent) params.set("includeContent", "1");
  const query = params.toString();
  return fetchJson<TaskArtifact[]>(`/sessions/${id}/tasks${query ? `?${query}` : ""}`);
}

/** Read the structured todo state managed by the Agent. */
export async function getSessionTodos(id: string): Promise<TodoItem[]> {
  return fetchJson<TodoItem[]>(`/sessions/${id}/todos`);
}

/** Fork a session from a specific entry point. */
export async function forkSession(id: string, options?: ForkSessionRequest): Promise<Session> {
  const session = await postJson<RawSession>(`/sessions/${id}/fork`, options ?? {});
  return mapSession(session);
}

export function listSessionUiMenus(
  id: string,
  surface: UiMenuItem["surface"],
  entryId?: string,
): Promise<UiMenuItem[]> {
  const query = new URLSearchParams({ surface });
  if (entryId) query.set("entryId", entryId);
  return fetchJson<UiMenuItem[]>(`/sessions/${id}/ui-menus?${query.toString()}`);
}

export function executeSessionUiMenu(
  id: string,
  menuId: string,
  entryId?: string,
): Promise<{ action?: "select-agent-for-fork"; message?: string; refresh?: boolean }> {
  return postJson(
    `/sessions/${id}/ui-menus/${encodeURIComponent(menuId)}`,
    entryId ? { entryId } : {},
  );
}

/** Create a child that inherits a frozen context snapshot without copying messages. */
export async function createBtwSession(id: string): Promise<Session> {
  const session = await postJson<RawSession>(`/sessions/${id}/btw`, {});
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

export interface EvalRuntimeState {
  kernels: Array<"js" | "py">;
  history: Array<{
    language: "js" | "py";
    code: string;
    output: string;
    error?: string;
    at: number;
  }>;
}

export function getSessionEvalState(id: string): Promise<EvalRuntimeState> {
  return fetchJson<EvalRuntimeState>(`/sessions/${id}/eval-state`);
}

export async function executeSessionCommand(
  id: string,
  command: string,
  argument?: string,
): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/sessions/${id}/commands`, { command, argument });
}

export async function getCodexSessionModels(id: string): Promise<CodexModelInfo[]> {
  return fetchJson<CodexModelInfo[]>(`/sessions/${id}/external/codex/models`);
}

export async function updateCodexSessionSettings(
  id: string,
  settings: { model: string; effort?: string },
): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/sessions/${id}/external/codex/settings`, settings);
}

export async function executeCodexSessionCommand(
  id: string,
  command: string,
  argument?: string,
): Promise<Record<string, unknown>> {
  return postJson<Record<string, unknown>>(`/sessions/${id}/external/codex/commands`, {
    command,
    argument,
  });
}

/**
 * Update session fields/meta (merges with existing). Known column keys
 * (title/name, avatar, pinned, muted, unread, shadowEnabled/shadowDisabled,
 * stage, isBuiltin/builtin) are promoted to their own columns server-side;
 * everything else is merged into `meta`. Returns the full updated Session.
 */
export async function updateSessionMeta(
  id: string,
  meta: Record<string, unknown>,
): Promise<Session> {
  const session = await patchJson<RawSession>(`/sessions/${id}/meta`, meta);
  return mapSession(session);
}

/** Mark all session messages as read and clear unread count. */
export async function markSessionRead(id: string): Promise<Session> {
  const session = await postJson<RawSession>(`/sessions/${id}/read`, {});
  return mapSession(session);
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

/** Subscribe to session events via SSE (or WebSocket under Quick Tunnel). */
export function subscribeSessionEvents(
  sessionId: string,
  onEvent: (event: { type: string; event?: SessionStreamEvent }) => void,
  onError?: (error: Error) => void,
  onConnected?: () => void,
  onClose?: () => void,
): () => void {
  const abortController = new AbortController();
  let ws: WebSocket | null = null;

  void (async () => {
    try {
      if (await shouldUseSessionWebSocket()) {
        ws = await openSessionSocket();
        if (abortController.signal.aborted) {
          ws.close();
          return;
        }
        const onMessage = (event: MessageEvent) => {
          let parsed: { channel?: string; type?: string; event?: SessionStreamEvent };
          try {
            parsed = JSON.parse(String(event.data)) as typeof parsed;
          } catch {
            return;
          }
          if (parsed.channel !== "session") return;
          if (typeof parsed.type !== "string") return;
          onEvent({ type: parsed.type, event: parsed.event });
          if (parsed.type === "connected") onConnected?.();
        };
        ws.addEventListener("message", onMessage);
        ws.addEventListener("close", () => {
          if (!abortController.signal.aborted) onClose?.();
        });
        abortController.signal.addEventListener(
          "abort",
          () => {
            try {
              ws?.send(JSON.stringify({ channel: "session", type: "unsubscribe" }));
            } catch {
              // ignore
            }
            ws?.close();
            ws = null;
          },
          { once: true },
        );
        ws.send(
          JSON.stringify({
            channel: "session",
            type: "subscribe",
            sessionId,
          }),
        );
        return;
      }

      const res = await fetch(
        `${getApiBase()}/sessions/${sessionId}/events`,
        withAuth({
          signal: abortController.signal,
        }),
      );

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
      // Cleanup aborts the SSE on purpose (session switch / unmount).
      if (isAbortError(error) || abortController.signal.aborted) return;
      onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (!abortController.signal.aborted && !ws) onClose?.();
    }
  })();

  return () => {
    abortController.abort();
    ws?.close();
  };
}

export type AgentUiMenusEvent = {
  type: "ui_menus";
  agentId?: string;
  menus?: UiMenuItem[];
  agents?: Array<{ agentId: string; menus: UiMenuItem[] }>;
};

/** Subscribe to agent UI menu snapshots over the shared /ws channel. */
export function subscribeAgentUiMenus(
  onEvent: (event: AgentUiMenusEvent) => void,
  onError?: (error: Error) => void,
): () => void {
  const abortController = new AbortController();
  let ws: WebSocket | null = null;
  let retryTimer: number | null = null;

  const mapMenusPayload = (parsed: {
    type?: string;
    agentId?: number | string;
    menus?: UiMenuItem[];
    agents?: Array<{ agentId: number | string; menus: UiMenuItem[] }>;
  }): AgentUiMenusEvent | null => {
    if (parsed.type !== "ui_menus") return null;
    return {
      type: "ui_menus",
      ...(parsed.agentId !== undefined ? { agentId: String(parsed.agentId) } : {}),
      ...(parsed.menus ? { menus: parsed.menus } : {}),
      ...(parsed.agents
        ? {
            agents: parsed.agents.map((item) => ({
              agentId: String(item.agentId),
              menus: item.menus,
            })),
          }
        : {}),
    };
  };

  const connect = () => {
    if (abortController.signal.aborted) return;
    void (async () => {
      try {
        ws = await openSessionSocket();
        if (abortController.signal.aborted) {
          ws.close();
          ws = null;
          return;
        }
        const onMessage = (event: MessageEvent) => {
          let parsed: {
            channel?: string;
            type?: string;
            agentId?: number | string;
            menus?: UiMenuItem[];
            agents?: Array<{ agentId: number | string; menus: UiMenuItem[] }>;
          };
          try {
            parsed = JSON.parse(String(event.data)) as typeof parsed;
          } catch {
            return;
          }
          if (parsed.channel !== "agent") return;
          const mapped = mapMenusPayload(parsed);
          if (mapped) onEvent(mapped);
        };
        ws.addEventListener("message", onMessage);
        ws.addEventListener("close", () => {
          ws = null;
          if (abortController.signal.aborted) return;
          retryTimer = window.setTimeout(connect, 1500);
        });
        abortController.signal.addEventListener(
          "abort",
          () => {
            if (retryTimer != null) window.clearTimeout(retryTimer);
            try {
              ws?.send(JSON.stringify({ channel: "agent", type: "unsubscribe" }));
            } catch {
              // ignore
            }
            ws?.close();
            ws = null;
          },
          { once: true },
        );
        ws.send(JSON.stringify({ channel: "agent", type: "subscribe" }));
      } catch (error) {
        if (abortController.signal.aborted) return;
        onError?.(error instanceof Error ? error : new Error(String(error)));
        retryTimer = window.setTimeout(connect, 1500);
      }
    })();
  };

  connect();

  return () => {
    abortController.abort();
    if (retryTimer != null) window.clearTimeout(retryTimer);
    ws?.close();
  };
}

// ============ Agent API ============

type RawAgent = Omit<Agent, "id" | "providerId" | "modelId"> & {
  id: number | string;
  providerId: number | string | null;
  modelId: number | string | null;
};

function mapAgent(agent: RawAgent): Agent {
  return {
    ...agent,
    id: String(agent.id),
    providerId: agent.providerId == null ? null : String(agent.providerId),
    modelId: agent.modelId == null ? null : String(agent.modelId),
  };
}

/** List all agents. */
export async function listAgents(): Promise<Agent[]> {
  return (await fetchJson<RawAgent[]>("/agents")).map(mapAgent);
}

export async function detectExternalAgents(): Promise<Agent[]> {
  return (await postJson<RawAgent[]>("/agents/detect", {})).map(mapAgent);
}

/** Install an external agent via its packaged install command. */
export async function installExternalAgent(id: string): Promise<Agent> {
  return mapAgent(await postJson<RawAgent>(`/agents/${id}/install`, {}));
}

/** Ask Watson to repair an unavailable external agent. */
export async function repairExternalAgent(
  id: string,
): Promise<{ agent: Agent; summary: string; fixed: boolean }> {
  const raw = await postJson<{ agent: RawAgent; summary: string; fixed: boolean }>(
    `/agents/${id}/repair`,
    {},
  );
  return {
    agent: mapAgent(raw.agent),
    summary: raw.summary,
    fixed: raw.fixed,
  };
}

/** Get a single agent by ID. */
export async function getAgent(id: string): Promise<Agent> {
  return mapAgent(await fetchJson<RawAgent>(`/agents/${id}`));
}

/** Create a new agent. */
export async function createAgent(options: CreateAgentRequest): Promise<Agent> {
  const modelId = options.modelId ? Number.parseInt(options.modelId, 10) : null;
  return mapAgent(await postJson<RawAgent>("/agents", { ...options, modelId }));
}

/** Update an agent. */
export async function updateAgent(id: string, patch: UpdateAgentRequest): Promise<Agent> {
  const modelId =
    patch.modelId === undefined
      ? undefined
      : patch.modelId === null
        ? null
        : Number.parseInt(String(patch.modelId), 10);
  return mapAgent(await patchJson<RawAgent>(`/agents/${id}`, { ...patch, modelId }));
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
  return (await fetchJson<RawModel[]>(`/providers/${id}/models`)).map(mapModel);
}

/** Create a new model for a provider. */
export async function createProviderModel(id: string, model: CreateModelRequest): Promise<Model> {
  return mapModel(await postJson<RawModel>(`/providers/${id}/models`, model));
}

/** Update a model for a provider. */
export async function updateProviderModel(
  providerId: string,
  modelId: string,
  patch: UpdateModelRequest,
): Promise<Model> {
  return mapModel(await patchJson<RawModel>(`/providers/${providerId}/models/${modelId}`, patch));
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

/** Get session log entries with optional filtering and pagination. */
export async function getSessionLog(
  id: string,
  options?: {
    level?: string;
    tags?: string[];
    limit?: number;
    before?: number;
    after?: number;
  },
): Promise<{ entries: LogEntry[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options?.level) params.set("level", options.level);
  if (options?.tags?.length) params.set("tags", options.tags.join(","));
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.before != null) params.set("before", String(options.before));
  if (options?.after != null) params.set("after", String(options.after));
  const qs = params.toString();
  return fetchJson<{ entries: LogEntry[]; hasMore: boolean }>(
    `/sessions/${id}/log${qs ? `?${qs}` : ""}`,
  );
}

// ============ Session Files API ============

export interface SessionWorkspaceFileEntry {
  path: string;
  isDirectory: boolean;
}

export type SessionFileKind =
  | "text"
  | "markdown"
  | "json"
  | "code"
  | "image"
  | "pdf"
  | "docx"
  | "pptx"
  | "xlsx"
  | "binary";

export interface SessionFileContent {
  path: string;
  kind: SessionFileKind;
  size: number;
  encoding: "utf8" | "base64" | "none";
  content: string | null;
  mimeType: string;
  truncated?: boolean;
  language?: string;
}

/** List files under the session workspace (cwd / worktree). */
export async function getSessionFiles(
  id: string,
): Promise<{ cwd: string; files: SessionWorkspaceFileEntry[] }> {
  return fetchJson<{ cwd: string; files: SessionWorkspaceFileEntry[] }>(`/sessions/${id}/files`);
}

/** Read a file relative to the session workspace for preview. */
export async function getSessionFileContent(id: string, path: string): Promise<SessionFileContent> {
  const params = new URLSearchParams({ path });
  return fetchJson<SessionFileContent>(`/sessions/${id}/files/content?${params}`);
}

export interface SessionFileDiffLine {
  type: "context" | "add" | "del";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export type SessionFileDiffStatus = "added" | "modified" | "deleted" | "unchanged" | "binary";

export interface SessionFileDiff {
  path: string;
  status: SessionFileDiffStatus;
  lines: SessionFileDiffLine[];
  truncated?: boolean;
}

/** Inline diff vs git HEAD for a session workspace file. */
export async function getSessionFileDiff(id: string, path: string): Promise<SessionFileDiff> {
  const params = new URLSearchParams({ path });
  return fetchJson<SessionFileDiff>(`/sessions/${id}/files/diff?${params}`);
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

export interface UpsertResourceContentRequest {
  kind: "prompt" | "mcp";
  slug: string;
  content: string;
  name?: string;
  description?: string;
}

/** Create or overwrite prompt/mcp content in the global catalog. */
export async function upsertResourceContent(
  request: UpsertResourceContentRequest,
): Promise<InstallCatalogResourceResult> {
  return putJson<InstallCatalogResourceResult>("/resources/content", request);
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

export interface AgentExtensionInfo {
  slug: string;
  name: string;
  description: string | null;
  builtin: boolean;
  enabled: boolean;
  resourceId: number;
  bindingId: number;
}

/** List agent extensions (shipped builtins + user bindings) with enabled flags. */
export async function listAgentExtensions(agentId: string): Promise<AgentExtensionInfo[]> {
  return fetchJson<AgentExtensionInfo[]>(`/agents/${agentId}/extensions`);
}

/** Enable or disable an extension binding (builtins included). */
export async function setAgentExtensionEnabled(
  agentId: string,
  resourceId: number,
  enabled: boolean,
): Promise<{ ok: boolean; binding: AgentResourceBinding }> {
  return patchJson<{ ok: boolean; binding: AgentResourceBinding }>(
    `/agents/${agentId}/extensions/${resourceId}`,
    { enabled },
  );
}

/** List database resource bindings for an agent. */
export async function listAgentResourceBindings(
  agentId: string,
  kind?: CatalogResourceKind,
  options?: { includeDisabled?: boolean },
): Promise<AgentResourceBinding[]> {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (options?.includeDisabled) params.set("includeDisabled", "1");
  const qs = params.toString() ? `?${params.toString()}` : "";
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

/** Install a skill from a local path, GitHub URL, or owner/repo[/path] source. */
export async function installSkill(source: string, slug?: string): Promise<CatalogResource> {
  const result = await installCatalogResource({ kind: "skill", source, slug });
  return result.resource;
}

/** Remove a skill from the global catalog. */
export async function uninstallSkill(slug: string): Promise<{ ok: boolean }> {
  return uninstallCatalogResource("skill", slug);
}

export interface SkillsShSearchHit {
  id: string;
  name: string;
  source: string;
  installs: number;
}

export interface SkillsShSearchResult {
  query: string;
  skills: SkillsShSearchHit[];
  count: number;
}

/** Search the public skills.sh registry (proxied by supervisor). */
export async function searchSkills(
  query: string,
  options?: { owner?: string; limit?: number },
): Promise<SkillsShSearchResult> {
  const params = new URLSearchParams({ q: query });
  if (options?.owner) params.set("owner", options.owner);
  if (options?.limit != null) params.set("limit", String(options.limit));
  return fetchJson<SkillsShSearchResult>(`/skills/search?${params.toString()}`);
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
  mediaId: string;
  mimeType: string;
  name?: string;
}

export interface SessionAttachmentInput {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
}

export async function uploadSessionMedia(sessionId: string, file: File): Promise<PromptImageInput> {
  const body = new FormData();
  body.append("file", file, file.name || "image.png");
  const res = await fetch(
    `${getApiBase()}/sessions/${encodeURIComponent(sessionId)}/media`,
    withAuth({
      method: "POST",
      body,
    }),
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "upload failed");
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  const json = (await res.json()) as { mediaId: string; mimeType: string; name?: string };
  return {
    mediaId: json.mediaId,
    mimeType: json.mimeType,
    name: json.name,
  };
}

export async function uploadSessionAttachment(
  sessionId: string,
  file: File,
): Promise<SessionAttachmentInput> {
  const body = new FormData();
  body.append("file", file, file.name || "attachment");
  const res = await fetch(
    `${getApiBase()}/sessions/${encodeURIComponent(sessionId)}/attachments`,
    withAuth({ method: "POST", body }),
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "upload failed");
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  return (await res.json()) as SessionAttachmentInput;
}

export function sessionMediaUrl(sessionId: string, mediaId: string): string {
  const base = `${getApiBase()}/sessions/${encodeURIComponent(sessionId)}/media/${encodeURIComponent(mediaId)}`;
  const password = localStorage.getItem(WEB_PASSWORD_KEY);
  return password ? `${base}?password=${encodeURIComponent(password)}` : base;
}

// ============ Health API ============

/** Health check. */
export async function healthCheck(): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/healthz");
}

export interface PushDeviceRegistration {
  deviceId: string;
  platform: "ios" | "android" | "web";
  pushToken: string;
  manufacturerPushToken?: string;
  manufacturer?: string;
  model?: string;
  appVersion?: string;
}

export async function registerPushDevice(input: PushDeviceRegistration): Promise<void> {
  await fetchJson("/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function unregisterPushDevice(deviceId: string): Promise<void> {
  await fetchJson(`/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
}
