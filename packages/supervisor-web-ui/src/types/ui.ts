import type { ProviderApiType, SessionCreationMethod, SessionStatus } from "@/api";
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
  branchType?: SessionBranchType;
  creationMethod: SessionCreationMethod;
  showInSessionList: boolean;
  contextLeafId?: string | null;
  agentId?: string | null;
  status: SessionStatus;
  lastActiveAt: string;
  meta: {
    name: string;
    description?: string;
    avatar?: SessionAvatarValue;
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
  maxTokens: number;
  supportsMultimodal: boolean;
  tags: string[];
}

export interface UIProvider {
  id: string;
  slug: string | null;
  name: string;
  icon: string | null;
  apiType: ProviderApiType;
  baseUrl: string | null;
  isEnabled: boolean;
  models: UIProviderModel[];
}

export type UIResourceKind = "skills" | "extensions" | "prompts" | "mcp";
export type UIResourceLayer = "global" | "agent";

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
