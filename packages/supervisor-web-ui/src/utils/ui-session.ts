import type { Project, Session } from "@/api";
import type { UISession, UIWorkspace } from "@/types/ui";

export function workspaceNameFromCwd(cwd: string): string {
  if (!cwd || cwd === "unknown") return "unknown";
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

export function toUISession(session: Session): UISession {
  const name =
    (typeof session.meta?.name === "string" && session.meta.name) ||
    `Session ${session.id.substring(0, 8)}`;
  return {
    id: session.id,
    workspaceId: session.projectId ?? "unknown",
    parentId: session.parentId,
    branchType: session.branchType ?? undefined,
    creationMethod: session.creationMethod,
    showInSessionList: session.showInSessionList,
    contextLeafId: session.contextLeafId,
    agentId: session.agentId,
    status: session.status,
    lastActiveAt: session.lastActiveAt,
    meta: {
      ...session.meta,
      name,
      description:
        typeof session.meta?.description === "string" ? session.meta.description : undefined,
    },
    lastMessagePreview: session.lastMessagePreview ?? "",
    pinned: !!session.meta?.pinned,
    muted: !!session.meta?.muted,
    unread: typeof session.meta?.unread === "number" ? session.meta.unread : undefined,
  };
}

export function groupSessionsByWorkspace(
  sessions: UISession[],
  projects: Project[] = [],
): Array<{ workspace: UIWorkspace; sessions: UISession[] }> {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const byCwd = new Map<string, UISession[]>();
  for (const s of sessions) {
    const key = s.workspaceId;
    const list = byCwd.get(key) ?? [];
    list.push(s);
    byCwd.set(key, list);
  }
  return [...byCwd.entries()]
    .map(([id, list]) => ({
      workspace: { id, name: projectById.get(id)?.name ?? "Unknown project" },
      sessions: list,
    }))
    .filter((g) => g.sessions.length > 0);
}
