/** Session lifecycle helpers that are not agent tools. */
import type { AgentHarnessEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { hasPendingAsks } from "../tools/ask/tool.js";
import type { SupervisorDb } from "../db/db.js";
// SupervisorDb used by Watson cleanup retry path
import {
  commitAll,
  getGitDiffStat,
  getGitStatusPorcelain,
  getHeadHash,
  listChangedFilesBetween,
  mergeSessionBranch,
  removeSessionWorktree,
  resolveMergeTargetBranch,
  resolveSessionGitContext,
  type GitChangedFile,
} from "../utils/git.js";
import { sessionLog } from "../utils/session-log.js";
import { maybeRunRollingCompaction } from "./compaction/rolling.js";
import type { SessionRuntime } from "./session-runtime.js";
import type {
  CommitSessionOptions,
  CommitSessionResult,
  Session,
  SessionRow,
  SpawnSessionOptions,
} from "../types.js";
import type { JobManager } from "./jobs.js";
import { parseSessionServicesMeta, stopSessionProjectServices } from "./session-services.js";
import { runWatson } from "./watson.js";
import { mapRowToSession, parseSessionMeta } from "./session-fields.js";

export type SessionLifecycleDb = Pick<
  SupervisorDb,
  | "get"
  | "list"
  | "updateMeta"
  | "updateStatus"
  | "updateCwd"
  | "updateSessionFields"
  | "listProviders"
  | "listModelsByProvider"
  | "getProvider"
  | "getModel"
  | "getProject"
>;

export type SessionGitPendingUpdate = {
  sourceSessionId: number;
  sourceTitle?: string | null;
  branch: string;
  files: GitChangedFile[];
  markedAt: number;
};

export type AchieveMergeResult = {
  branch: string;
  files: GitChangedFile[];
};

/** Convert a SessionRow to the Session type expected by callers. */
function rowToSession(row: SessionRow, _db?: unknown): Session {
  return mapRowToSession(row);
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

export function isDefaultSessionName(
  title: string | null | undefined,
  sessionId: number,
  agentDisplayName?: string | null,
): boolean {
  if (typeof title !== "string" || !title.trim()) return true;
  if (title === "New chat") return true;
  if (agentDisplayName && title === agentDisplayName) return true;
  if (title === `Session ${String(sessionId).slice(0, 8)}`) return true;
  return false;
}

function fallbackCommitMessage(sessionId: number): string {
  return `sv: session ${String(sessionId).slice(0, 8)}`;
}

export async function commitSessionChanges(
  sessionId: number,
  cwd: string,
  db: Pick<
    SupervisorDb,
    "get" | "getProject" | "listProviders" | "listModelsByProvider" | "getProvider" | "getModel"
  >,
  options: CommitSessionOptions = {},
  summaryText?: string,
): Promise<CommitSessionResult | null> {
  const row = db.get(sessionId);
  if (!row) throw new Error(`Session ${sessionId} not found`);
  const projectCwd = row.project_id != null ? db.getProject(row.project_id)?.cwd : undefined;
  const git = resolveSessionGitContext({
    sessionId,
    cwd,
    projectCwd,
  });
  if (!git?.worktreeEnabled) {
    throw new Error(
      "Session has no git worktree; commit is only available for root sessions in a git repo",
    );
  }

  const status = await getGitStatusPorcelain(cwd);
  if (!status.trim()) return null;

  let message = options.message?.trim() || fallbackCommitMessage(sessionId);
  if (!options.message?.trim()) {
    try {
      const diffStat = (await getGitDiffStat(cwd)) || status;
      const run = await runWatson({
        mode: "simple",
        kind: "commit-message",
        prompt: [
          "Write a concise git commit subject line for the latest work.",
          "Return only one line, at most 72 characters, in imperative mood.",
          "",
          `Turn summary: ${(summaryText ?? "Agent changes").slice(0, 800)}`,
          `Diff stat:\n${diffStat.slice(0, 1200)}`,
        ].join("\n"),
      });
      message = run.text.split("\n")[0]?.trim().slice(0, 72) || message;
    } catch {
      // keep fallback message
    }
  }

  const commit = await commitAll(cwd, message);
  if (!commit) return null;

  return commit;
}

async function maybeAutoNameSession(
  sessionId: number,
  event: Extract<AgentHarnessEvent, { type: "agent_end" }>,
  db: Pick<
    SupervisorDb,
    | "get"
    | "updateSessionFields"
    | "listProviders"
    | "listModelsByProvider"
    | "getProvider"
    | "getModel"
  >,
): Promise<void> {
  const row = db.get(sessionId);
  if (!row) return;
  if (!isDefaultSessionName(row.title, sessionId)) return;

  const userText = findFirstUserText(event.messages);
  const assistantText = findLastAssistantText(event.messages);
  if (!userText || !assistantText) return;

  try {
    const run = await runWatson({
      mode: "simple",
      kind: "session-title",
      prompt: [
        "Generate a short chat session title (6-20 Chinese or English characters).",
        "Return only the title text without quotes.",
        "",
        `User: ${userText.slice(0, 500)}`,
        `Assistant: ${assistantText.slice(0, 500)}`,
      ].join("\n"),
    });
    const title = run.text
      .replace(/^["'`]+|["'`]+$/g, "")
      .slice(0, 40)
      .trim();
    if (title) db.updateSessionFields(sessionId, { title });
  } catch {
    // skip auto naming on utility errors
  }
}

export async function prepareSessionLifecycleSpawn(
  db: SessionLifecycleDb,
  session: Session,
  options: SpawnSessionOptions,
  agentDisplayName?: string,
  _jobs?: JobManager,
): Promise<Session> {
  const initialName =
    options.title ??
    (typeof options.meta?.name === "string" ? options.meta.name : undefined) ??
    agentDisplayName ??
    undefined;
  const isBuiltin = options.isBuiltin === true || session.isBuiltin;

  const needsOwnWorktree = options.spawnType === "fork" || options.spawnType === "clone";
  if ((options?.parentId && !needsOwnWorktree) || isBuiltin) {
    if (initialName) {
      db.updateSessionFields(session.id, { title: initialName, isBuiltin });
      return rowToSession(db.get(session.id)!, db);
    }
    if (isBuiltin !== session.isBuiltin) {
      db.updateSessionFields(session.id, { isBuiltin });
    }
    return session;
  }

  db.updateSessionFields(session.id, {
    title: initialName ?? "New chat",
    isBuiltin,
  });
  return rowToSession(db.get(session.id)!, db);
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
      String(sessionId),
      runtime,
      event,
      parseSessionMeta(session.meta),
      db,
    );
    await maybeAutoNameSession(sessionId, event, db);
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`session lifecycle agent_end failed [${sessionId}]:`, message);
  });
}

export function markSiblingSessionsPendingUpdate(
  db: Pick<SupervisorDb, "list" | "updateMeta" | "getProject">,
  achievedSession: Session,
  mergeResult: AchieveMergeResult,
  onNotify?: (sessionId: number) => void,
): void {
  if (achievedSession.projectId == null) return;
  const project = db.getProject(achievedSession.projectId);
  if (!project) return;

  const pendingUpdate: SessionGitPendingUpdate = {
    sourceSessionId: achievedSession.id,
    sourceTitle: achievedSession.title ?? null,
    branch: mergeResult.branch,
    files: mergeResult.files,
    markedAt: Date.now(),
  };

  for (const row of db.list({ projectId: achievedSession.projectId })) {
    if (row.id === achievedSession.id) continue;
    if (row.status === "finish" || row.status === "finished") continue;

    const git = resolveSessionGitContext({
      sessionId: row.id,
      cwd: row.cwd,
      projectCwd: project.cwd,
    });
    if (!git) continue;

    const meta = parseSessionMeta(row.meta);
    const existingGit =
      meta.git && typeof meta.git === "object" && !Array.isArray(meta.git)
        ? (meta.git as Record<string, unknown>)
        : {};

    db.updateMeta(row.id, {
      git: { ...existingGit, pendingUpdate },
    });
    onNotify?.(row.id);
  }
}

export async function finalizeSessionLifecycleGit(
  db: SupervisorDb,
  session: Session,
  jobs?: JobManager,
): Promise<AchieveMergeResult | null> {
  const row = db.get(session.id);
  if (!row) return null;
  const projectCwd = session.projectId != null ? db.getProject(session.projectId)?.cwd : undefined;
  const git = resolveSessionGitContext({
    sessionId: session.id,
    cwd: session.cwd,
    projectCwd,
  });
  if (!git) return null;

  const services = parseSessionServicesMeta(session.meta);
  await stopSessionProjectServices({
    sessionId: session.id,
    cwd: session.cwd,
    services,
    jobs,
    mode: "destroy",
  });
  if (services) {
    db.updateMeta(session.id, {
      services: { ...services, status: "stopped" },
    });
  }

  const status = await getGitStatusPorcelain(session.cwd);
  if (status.trim()) {
    throw new Error(
      "Uncommitted changes in worktree. Commit with POST /sessions/:id/commit before completing.",
    );
  }
  const oldHead = await getHeadHash(git.repoRoot);
  const targetBranch = await resolveMergeTargetBranch(git.repoRoot);
  await mergeSessionBranch(git.repoRoot, git.branch, targetBranch);
  const branch = targetBranch;
  const newHead = await getHeadHash(git.repoRoot);
  const files = await listChangedFilesBetween(git.repoRoot, oldHead, newHead);
  try {
    await removeSessionWorktree(git.repoRoot, git.worktreePath, git.branch);
  } catch (error: unknown) {
    let lastError = error instanceof Error ? error.message : String(error);
    const maxRounds = 3;
    for (let round = 1; round <= maxRounds; round++) {
      sessionLog(
        session.id,
        "warn",
        `worktree remove failed, asking Watson (${round}/${maxRounds}): ${lastError}`,
        ["system", "git", "worktree", "watson"],
      );
      await runWatson({
        mode: "agent",
        cwd: git.repoRoot,
        kind: "worktree-cleanup",
        toolsPreset: "coding",
        prompt: [
          "Session 收尾时无法移除 git worktree，目录很可能仍被本地服务或进程占用。",
          "请先阅读项目根目录与该 worktree 内的 AGENTS.md（尤其「本地开发服务」启停说明），",
          "按文档停止相关服务与占用该目录的进程，再执行：",
          `git -C ${JSON.stringify(git.repoRoot)} worktree remove --force ${JSON.stringify(git.worktreePath)}`,
          "必要时可 `git worktree prune`。不要 rm -rf 整个仓库或无关路径。",
          "",
          `worktreePath: ${git.worktreePath}`,
          `branch: ${git.branch}`,
          `error: ${lastError}`,
          `attempt: ${round}/${maxRounds}`,
        ].join("\n"),
      }).catch((watsonError: unknown) => {
        const detail = watsonError instanceof Error ? watsonError.message : String(watsonError);
        console.error(`Watson worktree cleanup failed [${session.id}]:`, detail);
      });
      try {
        await removeSessionWorktree(git.repoRoot, git.worktreePath, git.branch);
        lastError = "";
        break;
      } catch (retryError: unknown) {
        lastError = retryError instanceof Error ? retryError.message : String(retryError);
      }
    }
    if (lastError) {
      throw new Error(
        `Worktree still present after Watson cleanup: ${git.worktreePath} (${lastError})`,
      );
    }
  }
  sessionLog(
    session.id,
    "info",
    `Worktree removed after achieve: ${git.worktreePath}`,
    ["system", "git", "worktree"],
    { worktreePath: git.worktreePath, branch: git.branch },
  );
  db.updateCwd(session.id, git.repoRoot);
  return { branch, files };
}

export function clearSessionGitPendingUpdate(
  db: Pick<SupervisorDb, "get" | "updateMeta">,
  sessionId: number,
): void {
  const row = db.get(sessionId);
  if (!row) return;
  const meta = parseSessionMeta(row.meta);
  if (!meta.git || typeof meta.git !== "object" || Array.isArray(meta.git)) return;
  const existingGit = { ...(meta.git as Record<string, unknown>) };
  if (!Object.hasOwn(existingGit, "pendingUpdate")) return;
  delete existingGit.pendingUpdate;
  db.updateMeta(sessionId, { git: existingGit });
}
