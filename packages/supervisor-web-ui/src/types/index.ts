import type { Agent, Model, Provider, Session } from "@earendil-works/pi-supervisor";

// ============ Session UI Extensions ============

/**
 * Extended Session with UI-specific fields stored in meta.
 * These fields are managed by the frontend and stored in session.meta.
 */
export interface SessionUiState {
  /** Whether the session is pinned to top */
  pinned?: boolean;
  /** Whether the session is muted (no notifications) */
  muted?: boolean;
  /** Number of unread messages */
  unread?: number;
  /** Workspace ID for grouping sessions */
  workspaceId?: string;
  /** Display name for the session */
  name?: string;
  /** Session description */
  description?: string;
}

/** Session with UI-specific fields extracted from meta */
export interface SessionWithUiState extends Session {
  /** Last message preview text (returned by API) */
  lastMessagePreview?: string;
  /** UI state from meta */
  uiState: SessionUiState;
}

/** Session branch types */
export type SessionBranchType = "subagent" | "fork" | "clone" | "btw";

// ============ Agent UI Extensions ============

/**
 * Extended Agent with UI-specific fields stored in meta.
 */
export interface AgentUiState {
  /** Category for grouping in contacts list: frontend, backend, qa, general */
  category?: "frontend" | "backend" | "qa" | "general" | string;
}

/** Agent with UI-specific fields extracted from meta */
export interface AgentWithUiState extends Agent {
  /** UI state from meta */
  uiState: AgentUiState;
}

/** Agent category for display */
export interface AgentCategory {
  id: string;
  label: string;
}

/** Default agent categories */
export const DEFAULT_AGENT_CATEGORIES: AgentCategory[] = [
  { id: "frontend", label: "前端" },
  { id: "backend", label: "后端" },
  { id: "qa", label: "测试" },
  { id: "general", label: "通用" },
];

// ============ Provider UI Extensions ============

/**
 * Provider with optional UI state.
 */
export interface ProviderWithUiState extends Provider {
  /** Optional UI metadata */
  uiState?: Record<string, unknown>;
}

/**
 * Extended Model with display name.
 */
export interface ModelWithDisplay extends Model {
  /** Display name for the model */
  displayName: string;
}

// ============ Resource Types ============

/** Resource kinds */
export type ResourceKind = "skills" | "extensions" | "prompts";

/** Resource layers */
export type ResourceLayer = "global" | "agent";

/** Base resource item */
export interface ResourceItemBase {
  id: string;
  kind: ResourceKind;
  layer: ResourceLayer;
  name: string;
  description: string;
  agentIds?: string[];
}

/** Skill file definition */
export interface SkillFile {
  id: string;
  path: string;
  content: string;
}

/** Skill resource item */
export interface SkillResourceItem extends ResourceItemBase {
  kind: "skills";
  rootPath?: string;
  files: SkillFile[];
}

/** Extension resource item */
export interface ExtensionResourceItem extends ResourceItemBase {
  kind: "extensions";
  entryPath?: string;
  version?: string;
}

/** Prompt template resource item */
export interface PromptResourceItem extends ResourceItemBase {
  kind: "prompts";
  content: string;
}

/** Union type for all resource items */
export type ResourceItem = SkillResourceItem | ExtensionResourceItem | PromptResourceItem;

// ============ Workspace Types ============

/** Workspace definition */
export interface Workspace {
  id: string;
  name: string;
}

/** Default workspace */
export const DEFAULT_WORKSPACE: Workspace = {
  id: "default",
  name: "默认工作区",
};

// ============ Message Types ============

/** User message content types */
export type UserMessageContent = string | { type: "file"; path: string; content?: string };

/** Chat autocomplete context */
export interface ChatAutocompleteContext {
  sessionId?: string;
  agentId?: string;
  workspaceId?: string;
}

/** Autocomplete item */
export interface ChatAutocompleteItem {
  type: "file" | "skill" | "agent";
  value: string;
  displayText: string;
  description?: string;
}

// ============ UI State Types ============

/** Theme settings */
export interface ThemeSettings {
  isDark: boolean;
}

/** View modes */
export type ViewMode = "chat" | "contacts" | "resources" | "providers" | "settings";

/** App state */
export interface AppState {
  currentView: ViewMode;
  selectedSessionId?: string;
  selectedAgentId?: string;
  selectedResourceId?: string;
  selectedProviderId?: string;
}
