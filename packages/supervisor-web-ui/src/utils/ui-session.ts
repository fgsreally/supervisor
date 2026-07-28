import type { Project, Session } from "@/api";
import type { UISession, UIWorkspace } from "@/types/ui";
import type { SessionAvatarValue } from "@/utils/session-avatar";
import { parseSessionStage } from "@/utils/workflow";
import { viewPreferences } from "@/utils/view-preferences";

export function workspaceNameFromCwd(cwd: string): string {
  if (!cwd || cwd === "unknown") return "unknown";
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

export function toUISession(session: Session): UISession {
  const title =
    (typeof session.title === "string" && session.title) ||
    (typeof session.meta?.name === "string" && session.meta.name) ||
    `Session ${session.id.substring(0, 8)}`;
  const avatar =
    session.avatar ?? (session.meta?.avatar as Partial<SessionAvatarValue> | undefined);
  return {
    id: session.id,
    workspaceId: session.projectId ?? "none",
    parentId: session.parentId,
    spawnType: session.spawnType ?? undefined,
    creationMethod: session.creationMethod,
    showInSessionList: session.showInSessionList,
    agentId: session.agentId,
    status: session.status,
    lastActiveAt: session.lastActiveAt,
    title,
    isBuiltin: !!session.isBuiltin || session.meta?.builtin === true,
    avatar: avatar ?? undefined,
    stage: parseSessionStage(session),
    meta: {
      ...session.meta,
      description:
        typeof session.meta?.description === "string" ? session.meta.description : undefined,
    },
    lastMessagePreview: session.lastMessagePreview ?? "",
    pinned: viewPreferences.pinnedSessionIds.includes(session.id),
    muted: viewPreferences.mutedSessionIds.includes(session.id),
    unread: viewPreferences.unreadBySession[session.id],
  };
}

export function groupSessionsByWorkspace(
  sessions: UISession[],
  projects: Project[] = [],
): Array<{ workspace: UIWorkspace; sessions: UISession[] }> {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const byId = new Map<string, UISession[]>();
  // Always surface registered projects, even when they have no sessions yet.
  for (const project of projects) {
    byId.set(project.id, []);
  }
  for (const s of sessions) {
    const key = s.workspaceId;
    const list = byId.get(key) ?? [];
    list.push(s);
    byId.set(key, list);
  }
  return [...byId.entries()].map(([id, list]) => ({
    workspace: {
      id,
      name: id === "none" ? "No project" : (projectById.get(id)?.name ?? "Unknown project"),
    },
    sessions: list,
  }));
}

function parseActivityTime(value: string | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Latest activity for a session subtree (self + descendants). */
export function sessionRecentActivity(session: UISession, all: UISession[]): number {
  const childrenByParent = new Map<string, UISession[]>();
  for (const candidate of all) {
    if (!candidate.parentId) continue;
    const list = childrenByParent.get(candidate.parentId) ?? [];
    list.push(candidate);
    childrenByParent.set(candidate.parentId, list);
  }

  let max = parseActivityTime(session.lastActiveAt);
  const stack = [session.id];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) continue;
    for (const child of childrenByParent.get(id) ?? []) {
      max = Math.max(max, parseActivityTime(child.lastActiveAt));
      stack.push(child.id);
    }
  }
  return max;
}

export function compareSessionsByRecentActivity(
  left: UISession,
  right: UISession,
  all: UISession[],
): number {
  return sessionRecentActivity(right, all) - sessionRecentActivity(left, all);
}
