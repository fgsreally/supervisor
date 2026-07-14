/** Session lifecycle helpers that are not agent tools. */
import type { AgentHarnessEvent } from "@earendil-works/pi-agent-core";
import { hasPendingAsks } from "./tools/ask/tool.js";
import type { SupervisorDb } from "./db/db.js";
import {
  createSessionWorktree,
  findGitRoot,
  getGitStatusPorcelain,
  mergeSessionBranch,
  parseSessionGitMeta,
  removeSessionWorktree,
} from "./git/git-worktree.js";
import { maybeRunRollingCompaction } from "./core/compaction/rolling.js";
import { isDefaultSessionName, maybeAutoNameSession } from "./core/session-git-hooks.js";
import type { SessionRuntime } from "./core/session-runtime.js";
import type { Session, SessionRow, SpawnSessionOptions } from "./types.js";

export type SessionLifecycleDb = Pick<
  SupervisorDb,
  | "get"
  | "updateMeta"
  | "updateStatus"
  | "updateCwd"
  | "listProviders"
  | "listModelsByProvider"
  | "getProvider"
  | "getProject"
>;

/** Convert a SessionRow to the Session type expected by callers. */
function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    sessionId: row.session_id,
    pid: row.pid,
    status: row.status,
    thinkingLevel: row.thinking_level,
    cwd: row.cwd,
    leafId: row.leaf_id,
    agentId: row.agent_id,
    branchType: row.branch_type as Session["branchType"],
    createdAt: new Date(row.created_at),
    lastActiveAt: new Date(row.last_active_at),
    meta: typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta,
  };
}

export async function prepareSessionLifecycleSpawn(
  db: SessionLifecycleDb,
  session: Session,
  options: SpawnSessionOptions,
  agentDisplayName?: string,
): Promise<Session> {
  const projectName = session.cwd
    ? (session.cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? undefined)
    : undefined;

  const initialName =
    typeof options.meta?.name === "string" ? options.meta.name : (agentDisplayName ?? undefined);

  if (options?.parentId || options.meta?.builtin) {
    if (initialName) {
      db.updateMeta(session.id, { name: initialName, nameDefault: initialName, projectName });
      return rowToSession(db.get(session.id)!);
    }
    return session;
  }

  const repoRoot = await findGitRoot(session.cwd);
  if (repoRoot) {
    try {
      const gitMeta = await createSessionWorktree(repoRoot, String(session.id));
      db.updateCwd(session.id, gitMeta.worktreePath);
      db.updateMeta(session.id, {
        git: gitMeta,
        name: initialName ?? "New chat",
        nameDefault: "New chat",
        projectName,
      });
      return rowToSession(db.get(session.id)!);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`session lifecycle worktree create failed [${session.id}]:`, message);
    }
  }

  if (initialName) {
    db.updateMeta(session.id, { name: initialName, nameDefault: initialName, projectName });
    return rowToSession(db.get(session.id)!);
  }
  return session;
}

export function handleSessionLifecycleAgentEnd(
  sessionId: number,
  runtime: SessionRuntime,
  event: AgentHarnessEvent,
  db: SessionLifecycleDb,
): void {
  if (event.type !== "agent_end" || !event.messages) return;
  const session = db.get(sessionId);
  if (!session) return;
  if (hasPendingAsks(String(sessionId))) return;

  void (async () => {
    await maybeRunRollingCompaction(
      sessionId,
      runtime,
      event,
      typeof session.meta === "string" ? JSON.parse(session.meta) : session.meta,
      db,
    );
    const refreshed = db.get(sessionId);
    if (refreshed) {
      await maybeAutoNameSession(
        sessionId,
        typeof refreshed.meta === "string" ? JSON.parse(refreshed.meta) : refreshed.meta,
        event,
        db,
      );
    }
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`session lifecycle agent_end failed [${sessionId}]:`, message);
  });
}

export async function finalizeSessionLifecycleGit(
  db: Pick<SupervisorDb, "updateMeta">,
  session: Session,
): Promise<void> {
  const gitMeta = parseSessionGitMeta(session.meta);
  if (!gitMeta) return;

  const status = await getGitStatusPorcelain(session.cwd);
  if (status.trim()) {
    throw new Error(
      "Uncommitted changes in worktree. Commit with POST /sessions/:id/commit before completing.",
    );
  }
  await mergeSessionBranch(gitMeta.repoRoot, gitMeta.branch, gitMeta.baseBranch);
  await removeSessionWorktree(gitMeta.repoRoot, gitMeta.worktreePath, gitMeta.branch);
  db.updateMeta(session.id, {
    git: {
      ...gitMeta,
      worktreeEnabled: false,
    },
  });
}

export { hasPendingAsks, isDefaultSessionName };
