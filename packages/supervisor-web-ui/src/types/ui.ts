import type { WireProtocol, SessionCreationMethod, SessionStatus } from "@/api";
import type { SessionBranchType } from "@/utils/session-branch";
import type { SessionAvatarValue } from "@/utils/session-avatar";

export interface UIWorkspace {
  id: string;
  name: string;
}

/** Flat session row for list panels (matches example layout). */
export interface UISession {
  id: string;
  workspaceId: string;
  parentId?: string | null;
  spawnType?: SessionBranchType;
  creationMethod: SessionCreationMethod;
  showInSessionList: boolean;
  agentId?: string | null;
  status: SessionStatus;
  createdAt: string;
  lastActiveAt: string;
  lastMessageAt?: string;
  /** Session title (was meta.name). */
  title: string;
  /** Builtin/internal session (was meta.builtin). */
  isBuiltin?: boolean;
  avatar?: Partial<SessionAvatarValue> | null;
  /** Current workflow stage label (was meta.workflow.stage). */
  stage?: string | null;
  /** Extension data only; core fields (title/avatar/pinned/...) live on the session itself. */
  meta: {
    description?: string;
    /** Native Agent IDs authorized for the subagent extension in this session. */
    subagentIds?: number[];
    [key: string]: unknown;
  };
  lastMessagePreview: string;
  pinned?: boolean;
  muted?: boolean;
  unread?: number;
}

export interface UIProviderModel {
  id: string;
  name: string;
  contextWindow: number;
  supportsVision: boolean;
}

export interface UIProvider {
  id: string;
  slug: string | null;
  name: string;
  icon: string | null;
  protocol: WireProtocol;
  baseUrl: string | null;
  isEnabled: boolean;
  models: UIProviderModel[];
}

export type UIResourceKind = "skills" | "extensions" | "prompts" | "mcp";
export type UIResourceLayer = "global" | "agent" | "project";

export interface UISkillFile {
  id: string;
  fileName: string;
  content: string;
}

export interface UIResourceItemBase {
  id: string;
  kind: UIResourceKind;
  layer: UIResourceLayer;
  name: string;
  description: string;
  agentIds?: string[];
}

export interface UISkillItem extends UIResourceItemBase {
  kind: "skills";
  rootPath?: string;
  files: UISkillFile[];
}

export interface UIFileItem extends UIResourceItemBase {
  kind: "extensions" | "prompts" | "mcp";
  fileName: string;
  path: string;
  content: string;
  rootPath?: string;
  files?: UISkillFile[];
}

export type UIResourceItem = UISkillItem | UIFileItem;
