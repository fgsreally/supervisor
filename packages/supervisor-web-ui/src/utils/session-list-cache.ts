import type {
  Project,
  Session,
  SessionAvatar,
  SessionBranchType,
  SessionCreationMethod,
  SessionStatus,
} from "@/api";

const STORAGE_KEY = "pi-supervisor:session-list-cache:v2";

/** Fields needed to paint the chat session list — never persist meta / prompts / cwd. */
export type CachedSessionListItem = {
  id: string;
  projectId: string | null;
  parentId: string | null;
  status: SessionStatus;
  agentId: string | null;
  spawnType: SessionBranchType | null;
  creationMethod: SessionCreationMethod;
  showInSessionList: boolean;
  createdAt: string;
  lastActiveAt: string;
  lastMessageAt?: string;
  title?: string | null;
  avatar?: SessionAvatar | null;
  isBuiltin?: boolean;
  stage?: string | null;
  lastMessagePreview?: string;
};

/** Project section headers in the list only need id + name. */
export type CachedProjectListItem = {
  id: string;
  name: string;
};

export type SessionListCachePayload = {
  version: 2;
  savedAt: number;
  sessions: CachedSessionListItem[];
  projects: CachedProjectListItem[];
};

function toCachedSession(session: Session): CachedSessionListItem {
  return {
    id: session.id,
    projectId: session.projectId,
    parentId: session.parentId,
    status: session.status,
    agentId: session.agentId,
    spawnType: session.spawnType,
    creationMethod: session.creationMethod,
    showInSessionList: session.showInSessionList,
    createdAt: session.createdAt,
    lastActiveAt: session.lastActiveAt,
    lastMessageAt: session.lastMessageAt,
    title: session.title ?? null,
    avatar: session.avatar ?? null,
    isBuiltin: session.isBuiltin,
    stage: session.stage ?? null,
    lastMessagePreview: session.lastMessagePreview,
  };
}

function toCachedProject(project: Project): CachedProjectListItem {
  return { id: project.id, name: project.name };
}

/** Expand a slim cache row into a Session stub safe for list rendering. */
export function sessionFromListCache(item: CachedSessionListItem): Session {
  return {
    id: item.id,
    projectId: item.projectId,
    parentId: item.parentId,
    status: item.status,
    cwd: "",
    leafId: null,
    agentId: item.agentId,
    spawnType: item.spawnType,
    creationMethod: item.creationMethod,
    showInSessionList: item.showInSessionList,
    createdAt: item.createdAt,
    lastActiveAt: item.lastActiveAt,
    lastMessageAt: item.lastMessageAt,
    title: item.title ?? null,
    avatar: item.avatar ?? null,
    isBuiltin: item.isBuiltin,
    stage: item.stage ?? null,
    meta: {},
    currentTask: null,
    lastMessagePreview: item.lastMessagePreview,
  };
}

export function projectFromListCache(item: CachedProjectListItem): Project {
  return {
    id: item.id,
    name: item.name,
    description: null,
    cwd: "",
    homeDir: "",
    meta: {},
    parsedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

export function loadSessionListCache(): SessionListCachePayload | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionListCachePayload;
    if (
      parsed?.version !== 2 ||
      !Array.isArray(parsed.sessions) ||
      !Array.isArray(parsed.projects)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSessionListCache(sessions: Session[], projects: Project[]): void {
  if (typeof localStorage === "undefined") return;
  const payload: SessionListCachePayload = {
    version: 2,
    savedAt: Date.now(),
    sessions: sessions.map(toCachedSession),
    projects: projects.map(toCachedProject),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[session-list-cache] save failed", error);
  }
}

export function clearSessionListCache(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
