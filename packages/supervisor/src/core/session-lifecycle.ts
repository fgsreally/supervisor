/** Session lifecycle helpers that are not agent tools. */
import type { AgentHarnessEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { hasPendingAsks } from "../tools/ask/tool.js";
import type { SupervisorDb } from "../db/db.js";
import {
  createSessionWorktree,
  commitAll,
  findGitRoot,
  getGitDiffStat,
  getGitStatusPorcelain,
  mergeSessionBranch,
  parseSessionGitMeta,
  removeSessionWorktree,
  type SessionGitMeta,
} from "../utils/git.js";
import { maybeRunRollingCompaction } from "./compaction/rolling.js";
import type { SessionRuntime } from "./session-runtime.js";
import type {
  CommitSessionOptions,
  CommitSessionResult,
  Session,
  SessionRow,
  SpawnSessionOptions,
} from "../types.js";
import {
  generateCommitMessage,
  generateSessionTitle,
  resolveTaggedModelAuth,
} from "../utils/utility-llm.js";
import { normalizeSessionBranchType } from "./session-history.js";

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
  | "updateProjectMeta"
>;

/** Convert a SessionRow to the Session type expected by callers. */
function rowToSession(row: SessionRow): Session {
  const meta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
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
    branchType: normalizeSessionBranchType(row.branch_type),
    showInSessionList: row.show_in_session_list !== 0,
    contextLeafId: row.context_leaf_id ?? null,
    createdAt: new Date(row.created_at),
    lastActiveAt: new Date(row.last_active_at),
    meta,
    currentTask: typeof meta.currentTask === "string" ? meta.currentTask : null,
  };
}

function findLastAssistantText(messages: AgentMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    const content = message.content as string | Array<{ type: string; text?: string }>;
    if (typeof content === "string") return content.trim();
    return content
      .filter((part): part is { type: "text"; text: string } => part.type === "text" && !!part.text)
      .map((part) => part.text)
      .join("")
      .trim();
  }
  return "";
}

function findFirstUserText(messages: AgentMessage[]): string {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const content = message.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim();
    }
  }
  return "";
}

export function isDefaultSessionName(meta: Record<string, unknown>, sessionId: number): boolean {
  const name = meta.name;
  if (typeof name !== "string" || !name.trim()) return true;
  if (typeof meta.nameDefault === "string" && name === meta.nameDefault) return true;
  if (name === "New chat") return true;
  if (name === `Session ${String(sessionId).slice(0, 8)}`) return true;
  return false;
}

function fallbackCommitMessage(sessionId: number): string {
  return `pi: session ${String(sessionId).slice(0, 8)}`;
}

export async function commitSessionChanges(
  sessionId: number,
  cwd: string,
  meta: Record<string, unknown>,
  db: Pick<SupervisorDb, "updateMeta" | "listProviders" | "listModelsByProvider" | "getProvider">,
  options: CommitSessionOptions = {},
  summaryText?: string,
): Promise<CommitSessionResult | null> {
  const gitMeta = parseSessionGitMeta(meta);
  if (!gitMeta) {
    throw new Error(
      "Session has no git worktree; commit is only available for root sessions in a git repo",
    );
  }

  const status = await getGitStatusPorcelain(cwd);
  if (!status.trim()) return null;

  let message = options.message?.trim() || fallbackCommitMessage(sessionId);
  if (!options.message?.trim()) {
    const auth = await resolveTaggedModelAuth(db, "commit-message");
    if (auth) {
      try {
        const diffStat = (await getGitDiffStat(cwd)) || status;
        message = await generateCommitMessage(auth, summaryText ?? "Agent changes", diffStat);
      } catch {
        // keep fallback message
      }
    }
  }

  const commit = await commitAll(cwd, message);
  if (!commit) return null;

  const nextGit: SessionGitMeta = { ...gitMeta, lastCommit: commit };
  db.updateMeta(sessionId, { git: nextGit });
  return commit;
}

async function maybeAutoNameSession(
  sessionId: number,
  meta: Record<string, unknown>,
  event: Extract<AgentHarnessEvent, { type: "agent_end" }>,
  db: Pick<SupervisorDb, "updateMeta" | "listProviders" | "listModelsByProvider" | "getProvider">,
): Promise<void> {
  if (!isDefaultSessionName(meta, sessionId)) return;

  const userText = findFirstUserText(event.messages);
  const assistantText = findLastAssistantText(event.messages);
  if (!userText || !assistantText) return;

  const auth = await resolveTaggedModelAuth(db, "session-title");
  if (!auth) return;

  try {
    const title = await generateSessionTitle(auth, userText, assistantText);
    if (title) db.updateMeta(sessionId, { name: title });
  } catch {
    // skip auto naming on utility errors
  }
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

  const needsOwnWorktree = options.branchType === "fork" || options.branchType === "clone";
  if ((options?.parentId && !needsOwnWorktree) || options.meta?.builtin) {
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
      if (session.projectId != null) {
        db.updateProjectMeta(session.projectId, { defaultBranch: gitMeta.baseBranch });
      }
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
