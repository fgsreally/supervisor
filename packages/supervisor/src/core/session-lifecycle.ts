/** Session lifecycle helpers that are not agent tools. */
import type { AgentHarnessEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { hasPendingAsks } from "../tools/ask/tool.js";
import type { SupervisorDb } from "../db/db.js";
// SupervisorDb used by Watson cleanup retry path
import {
  createSessionWorktree,
  commitAll,
  ensureProjectGitRootSync,
  getGitDiffStat,
  getGitStatusPorcelain,
  mergeSessionBranch,
  removeSessionWorktree,
  resolveMergeTargetBranch,
  resolveSessionGitContext,
} from "../utils/git.js";
import { sessionLog } from "../utils/session-log.js";
import { timedSessionStep } from "../utils/session-timing.js";
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
  resolveFeatureModelAuth,
} from "../utils/utility-llm.js";
import type { JobManager } from "./jobs.js";
import {
  parseSessionServicesMeta,
  startSessionProjectServices,
  stopSessionProjectServices,
} from "./session-services.js";
import { runWatsonTask } from "./watson.js";
import { mapRowToSession, parseSessionMeta } from "./session-fields.js";

export type SessionLifecycleDb = Pick<
  SupervisorDb,
  | "get"
  | "updateMeta"
  | "updateStatus"
  | "updateCwd"
  | "updateSessionFields"
  | "listProviders"
  | "listModelsByProvider"
  | "getProvider"
  | "getModel"
  | "getProject"
  | "listProjectScripts"
>;

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
    const auth = await resolveFeatureModelAuth(db, "commit-message");
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

  const auth = await resolveFeatureModelAuth(db, "session-title");
  if (!auth) return;

  try {
    const title = await generateSessionTitle(auth, userText, assistantText);
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
  jobs?: JobManager,
): Promise<Session> {
  const initialName =
    options.title ??
    (typeof options.meta?.name === "string" ? options.meta.name : undefined) ??
    agentDisplayName ??
    undefined;
  const isBuiltin = options.isBuiltin === true || session.isBuiltin;

  const needsOwnWorktree = options.spawnType === "fork" || options.spawnType === "clone";
  // Child sessions (except fork/clone) and builtin sessions do not get a worktree.
  if ((options?.parentId && !needsOwnWorktree) || isBuiltin) {
    if (initialName) {
      db.updateSessionFields(session.id, { title: initialName, isBuiltin });
      return rowToSession(db.get(session.id)!, db);
    }
    return session;
  }

  // Always treat the selected project cwd as the git root (nested init if the
  // project sits inside a parent monorepo). Worktrees then live under
  // <project>/.pi/supervisor/worktrees/<sessionId> — same project tree.
  try {
    sessionLog(session.id, "info", "Creating session worktree", ["system", "git", "worktree"], {
      cwd: session.cwd,
    });
    const repoRoot = await timedSessionStep(session.id, "ensureProjectGitRoot", async () =>
      ensureProjectGitRootSync(session.cwd),
    );
    sessionLog(session.id, "info", `Git root ready: ${repoRoot}`, ["system", "git"], { repoRoot });
    const gitMeta = await timedSessionStep(session.id, "createSessionWorktree", () =>
      createSessionWorktree(repoRoot, String(session.id)),
    );
    db.updateCwd(session.id, gitMeta.worktreePath);
    db.updateSessionFields(session.id, { title: initialName ?? "New chat" });
    sessionLog(
      session.id,
      "info",
      `Worktree ready: ${gitMeta.worktreePath} (branch ${gitMeta.branch}, from ${gitMeta.startBranch})`,
      ["system", "git", "worktree"],
      {
        worktreePath: gitMeta.worktreePath,
        branch: gitMeta.branch,
        startBranch: gitMeta.startBranch,
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`session lifecycle worktree create failed [${session.id}]:`, message);
    sessionLog(
      session.id,
      "error",
      `Worktree create failed: ${message}`,
      ["system", "git", "worktree"],
      { error: message },
    );
    if (initialName) {
      db.updateSessionFields(session.id, { title: initialName });
      return rowToSession(db.get(session.id)!, db);
    }
    return session;
  }

  let ready = rowToSession(db.get(session.id)!, db);
  if (ready.cwd !== session.cwd && session.projectId != null && jobs) {
    const project = db.getProject(session.projectId);
    if (project) {
      try {
        const scripts = db.listProjectScripts(project.id);
        const services = await timedSessionStep(session.id, "startProjectServices", () =>
          startSessionProjectServices({
            sessionId: session.id,
            cwd: ready.cwd,
            project,
            scripts,
            jobs,
          }),
        );
        if (services) {
          db.updateMeta(session.id, { services });
          ready = rowToSession(db.get(session.id)!, db);
          sessionLog(session.id, "info", "Project services started", ["system", "services"], {
            portEnv: services.portEnv,
            scripts: services.scripts.map((s) => s.name),
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        db.updateMeta(session.id, {
          services: {
            status: "error",
            error: message,
            portEnv: {},
            scripts: [],
          },
        });
        throw new Error(`项目服务启动失败: ${message}`);
      }
    }
  }
  return ready;
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
    await maybeRunRollingCompaction(String(sessionId), runtime, event, parseSessionMeta(session.meta), db);
    await maybeAutoNameSession(sessionId, event, db);
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`session lifecycle agent_end failed [${sessionId}]:`, message);
  });
}

export async function finalizeSessionLifecycleGit(
  db: SupervisorDb,
  session: Session,
  jobs?: JobManager,
): Promise<void> {
  const row = db.get(session.id);
  if (!row) return;
  const projectCwd = session.projectId != null ? db.getProject(session.projectId)?.cwd : undefined;
  const git = resolveSessionGitContext({
    sessionId: session.id,
    cwd: session.cwd,
    projectCwd,
  });
  if (!git) return;

  const services = parseSessionServicesMeta(session.meta);
  const destroyScripts =
    session.projectId != null ? db.listProjectScripts(session.projectId, "destroy") : [];
  await stopSessionProjectServices({
    sessionId: session.id,
    cwd: session.cwd,
    services,
    destroyScripts,
    jobs,
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
  await mergeSessionBranch(git.repoRoot, git.branch, await resolveMergeTargetBranch(git.repoRoot));
  try {
    await removeSessionWorktree(git.repoRoot, git.worktreePath, git.branch);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    sessionLog(session.id, "warn", `worktree remove failed, asking Watson: ${message}`, [
      "system",
      "git",
      "worktree",
      "watson",
    ]);
    await runWatsonTask({
      db,
      cwd: git.repoRoot,
      kind: "worktree-cleanup",
      prompt: [
        "`git worktree remove` 失败，请诊断并尽量安全修复，使该 worktree 可被移除。",
        "优先结束占用该目录的进程（如 vite/node），不要 rm -rf 强删整个仓库。",
        "修复后可自行再试 `git worktree remove --force <path>`。",
        "",
        `worktreePath: ${git.worktreePath}`,
        `branch: ${git.branch}`,
        `error: ${message}`,
      ].join("\n"),
    }).catch((watsonError: unknown) => {
      const detail = watsonError instanceof Error ? watsonError.message : String(watsonError);
      console.error(`Watson worktree cleanup failed [${session.id}]:`, detail);
    });
    await removeSessionWorktree(git.repoRoot, git.worktreePath, git.branch);
  }
  sessionLog(
    session.id,
    "info",
    `Worktree removed after achieve: ${git.worktreePath}`,
    ["system", "git", "worktree"],
    { worktreePath: git.worktreePath, branch: git.branch },
  );
  db.updateCwd(session.id, git.repoRoot);
}
