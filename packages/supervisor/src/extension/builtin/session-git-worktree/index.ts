import type { ExtensionContext, ExtensionDefinition } from "../../types.js";
import { parseSessionMeta } from "../../../core/session-fields.js";
import type { SessionRow } from "../../../types.js";
import {
  createSessionWorktree,
  ensureProjectGitRootSync,
  getGitStatusPorcelain,
  getHeadHash,
  listChangedFilesBetween,
  mergeSessionBranch,
  removeSessionWorktree,
  resolveMergeTargetBranch,
  resolveSessionGitContext,
  syncSessionWorktree,
} from "../../../utils/git.js";
import { sessionLog } from "../../../utils/session-log.js";

function patchSessionMeta(
  ctx: ExtensionContext,
  sessionId: number,
  patch: Record<string, unknown>,
): void {
  const row = ctx.db.queryOne<{ meta: string }>("SELECT meta FROM sessions WHERE id = ?", [
    sessionId,
  ]);
  if (!row) return;
  const merged = { ...JSON.parse(row.meta || "{}"), ...patch };
  ctx.db.execute("UPDATE sessions SET meta = ? WHERE id = ?", [JSON.stringify(merged), sessionId]);
}

function markSiblingsPendingUpdate(
  ctx: ExtensionContext,
  achievedSessionId: number,
  projectId: number,
  projectCwd: string,
  mergeResult: { branch: string; files: Array<{ path: string; status: string }> },
): void {
  const achieved = ctx.db.queryOne<{ title: string | null }>(
    "SELECT title FROM sessions WHERE id = ?",
    [achievedSessionId],
  );
  const pendingUpdate = {
    sourceSessionId: achievedSessionId,
    sourceTitle: achieved?.title ?? null,
    branch: mergeResult.branch,
    files: mergeResult.files,
    markedAt: Date.now(),
  };
  const rows = ctx.db.query<Pick<SessionRow, "id" | "cwd" | "status" | "meta">>(
    "SELECT id, cwd, status, meta FROM sessions WHERE project_id = ?",
    [projectId],
  );
  for (const row of rows) {
    if (row.id === achievedSessionId) continue;
    if (row.status === "finish" || row.status === "finished") continue;
    const git = resolveSessionGitContext({
      sessionId: row.id,
      cwd: row.cwd,
      projectCwd,
    });
    if (!git) continue;
    const meta = parseSessionMeta(row.meta);
    const existingGit =
      meta.git && typeof meta.git === "object" && !Array.isArray(meta.git)
        ? (meta.git as Record<string, unknown>)
        : {};
    patchSessionMeta(ctx, row.id, { git: { ...existingGit, pendingUpdate } });
  }
}

function shouldCreateWorktree(input: {
  isBuiltin: boolean;
  parentId: number | null;
  spawnType: string | null;
}): boolean {
  if (input.isBuiltin) return false;
  const needsOwnWorktree = input.spawnType === "fork" || input.spawnType === "clone";
  if (input.parentId != null && !needsOwnWorktree) return false;
  return true;
}

async function isCodingAgent(ctx: ExtensionContext, sessionId: number): Promise<boolean> {
  const row = ctx.db.queryOne<{ tools_preset: string }>(
    `SELECT a.tools_preset FROM agents a
     JOIN sessions s ON s.agent_id = a.id WHERE s.id = ?`,
    [sessionId],
  );
  return row?.tools_preset === "coding";
}

type SessionGit = {
  repoRoot: string;
  worktreePath: string;
  branch: string;
};

/**
 * Remove worktree; on failure ask Watson to read AGENTS.md (service stop etc.)
 * and retry until the path is gone.
 */
async function removeWorktreeWithWatson(
  ctx: ExtensionContext,
  sessionId: number,
  git: SessionGit,
  options?: { forceBranch?: boolean; reason?: string },
): Promise<void> {
  const tryRemove = () =>
    removeSessionWorktree(git.repoRoot, git.worktreePath, git.branch, {
      forceBranch: options?.forceBranch,
    });

  let lastError = "";
  try {
    await tryRemove();
    return;
  } catch (error: unknown) {
    lastError = error instanceof Error ? error.message : String(error);
  }

  const reason = options?.reason ?? "worktree remove failed";
  const maxRounds = 3;
  for (let round = 1; round <= maxRounds; round++) {
    sessionLog(
      sessionId,
      "warn",
      `worktree remove failed (${reason}), Watson cleanup ${round}/${maxRounds}: ${lastError}`,
      ["system", "git", "worktree", "watson"],
    );
    try {
      await ctx.watson.run({
        mode: "agent",
        cwd: git.repoRoot,
        kind: "worktree-cleanup",
        toolsPreset: "coding",
        prompt: [
          "Session 删除/收尾时无法移除 git worktree，目录很可能仍被本地服务或进程占用。",
          "请先阅读项目根目录与该 worktree 内的 AGENTS.md（尤其「本地开发服务」启停、安装/销毁说明），",
          "按文档停止相关服务与占用该目录的进程，再执行：",
          `git -C ${JSON.stringify(git.repoRoot)} worktree remove --force ${JSON.stringify(git.worktreePath)}`,
          "必要时可 `git worktree prune`。不要 rm -rf 整个仓库或无关路径。",
          "目标：使 worktree 目录不再存在，分支可随后删除。",
          "",
          `reason: ${reason}`,
          `worktreePath: ${git.worktreePath}`,
          `branch: ${git.branch}`,
          `error: ${lastError}`,
          `attempt: ${round}/${maxRounds}`,
        ].join("\n"),
      });
    } catch (watsonError: unknown) {
      const detail = watsonError instanceof Error ? watsonError.message : String(watsonError);
      ctx.log("error", `Watson worktree cleanup failed: ${detail}`);
      sessionLog(sessionId, "error", `Watson worktree cleanup failed: ${detail}`, [
        "system",
        "git",
        "worktree",
        "watson",
      ]);
    }

    try {
      await tryRemove();
      sessionLog(sessionId, "info", `Worktree removed after Watson cleanup: ${git.worktreePath}`, [
        "system",
        "git",
        "worktree",
        "watson",
      ]);
      return;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(
    `Worktree still present after Watson cleanup: ${git.worktreePath} (${lastError})`,
  );
}

const sessionGitWorktreeExtension: ExtensionDefinition = {
  name: "session-git-worktree",
  async setup(ctx) {
    if (!(await isCodingAgent(ctx, ctx.session.id))) {
      return () => {};
    }

    const sessionId = ctx.session.id;
    const projectCwd = ctx.project.cwd;
    const projectRow = ctx.db.queryOne<{ id: number }>(
      "SELECT project_id as id FROM sessions WHERE id = ?",
      [sessionId],
    );
    const projectId = projectRow?.id;

    const resolveGit = () =>
      resolveSessionGitContext({
        sessionId,
        cwd: ctx.session.cwd,
        projectCwd,
      });

    ctx.on("session.create", async (event) => {
      const row = ctx.db.queryOne<Pick<SessionRow, "is_builtin" | "parent_id" | "spawn_type">>(
        "SELECT is_builtin, parent_id, spawn_type FROM sessions WHERE id = ?",
        [sessionId],
      );
      if (!row) return;
      if (
        !shouldCreateWorktree({
          isBuiltin: !!row.is_builtin,
          parentId: row.parent_id,
          spawnType: event.spawnType ?? row.spawn_type,
        })
      ) {
        return;
      }
      try {
        sessionLog(sessionId, "info", "Creating session worktree", ["system", "git", "worktree"]);
        const repoRoot = ensureProjectGitRootSync(projectCwd);
        const gitMeta = await createSessionWorktree(repoRoot, String(sessionId));
        await ctx.session.setCwd(gitMeta.worktreePath);
        sessionLog(
          sessionId,
          "info",
          `Worktree ready: ${gitMeta.worktreePath} (branch ${gitMeta.branch})`,
          ["system", "git", "worktree"],
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.log("error", `Worktree create failed: ${message}`);
        sessionLog(sessionId, "error", `Worktree create failed: ${message}`, [
          "system",
          "git",
          "worktree",
        ]);
      }
    });

    ctx.on(
      "session.achieve",
      async () => {
        const git = resolveGit();
        if (!git) return;
        const status = await getGitStatusPorcelain(ctx.session.cwd);
        if (status.trim()) {
          throw new Error(
            "Uncommitted changes in worktree. Commit with POST /sessions/:id/commit before completing.",
          );
        }
        const oldHead = await getHeadHash(git.repoRoot);
        const targetBranch = await resolveMergeTargetBranch(git.repoRoot);
        await mergeSessionBranch(git.repoRoot, git.branch, targetBranch);
        const newHead = await getHeadHash(git.repoRoot);
        const files = await listChangedFilesBetween(git.repoRoot, oldHead, newHead);
        await removeWorktreeWithWatson(ctx, sessionId, git, { reason: "session.achieve" });
        await ctx.session.setCwd(git.repoRoot);
        if (projectId != null) {
          markSiblingsPendingUpdate(ctx, sessionId, projectId, projectCwd, {
            branch: targetBranch,
            files,
          });
        }
      },
      { priority: 100, mode: "sync" },
    );

    ctx.on(
      "session.before_delete",
      async () => {
        const git = resolveGit();
        if (!git) return;
        await removeWorktreeWithWatson(ctx, sessionId, git, {
          forceBranch: true,
          reason: "session.before_delete",
        });
      },
      { priority: 100, mode: "sync" },
    );

    ctx.on(
      "session.before_sync",
      async () => {
        const git = resolveGit();
        if (!git) return;
        if ((await getGitStatusPorcelain(ctx.session.cwd)).trim()) {
          throw new Error("同步前请先提交或清理当前会话中的修改");
        }
        await syncSessionWorktree(projectCwd, ctx.session.cwd);
        const meta = await ctx.session.meta.get();
        if (meta.git && typeof meta.git === "object" && !Array.isArray(meta.git)) {
          const gitMeta = { ...(meta.git as Record<string, unknown>) };
          delete gitMeta.pendingUpdate;
          await ctx.session.meta.patch({ git: gitMeta });
        }
      },
      { priority: 100, mode: "sync" },
    );

    return () => {};
  },
};

export default sessionGitWorktreeExtension;
