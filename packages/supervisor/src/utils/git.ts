import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execGit = promisify(execFile);

/** Trailer appended to every commit created by supervisor. */
export const SV_COMMIT_TRAILER = "Sv: true";

/** Ensure commit message carries the supervisor (sv) marker. */
export function withSvCommitMarker(message: string): string {
  const trimmed = message.replace(/\s+$/u, "").trim() || "sv: changes";
  if (/(?:^|\n)Sv:\s*true\b/iu.test(trimmed)) return trimmed;
  return `${trimmed}\n\n${SV_COMMIT_TRAILER}`;
}

function runGitSync(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * Ensure `projectCwd` itself is a git repository root.
 *
 * Important: if the project sits inside a parent monorepo (e.g. playground/
 * under supervisor/), we still `git init` a nested repo at the project path
 * so session worktrees belong to the project — not the parent repo.
 */
export function ensureProjectGitRootSync(projectCwd: string): string {
  mkdirSync(projectCwd, { recursive: true });
  const root = resolve(projectCwd);
  let toplevel: string | null = null;
  try {
    toplevel = resolve(runGitSync(root, ["rev-parse", "--show-toplevel"]));
  } catch {
    toplevel = null;
  }
  if (toplevel !== root) {
    runGitSync(root, ["init", "-b", "main"]);
  }
  let branch = "";
  try {
    branch = runGitSync(root, ["branch", "--show-current"]);
  } catch {
    // handled below
  }
  if (!branch) {
    branch = "main";
    runGitSync(root, ["symbolic-ref", "HEAD", `refs/heads/${branch}`]);
  }
  // `git worktree add` needs at least one commit.
  try {
    runGitSync(root, ["rev-parse", "HEAD"]);
  } catch {
    runGitSync(root, ["commit", "--allow-empty", "-m", withSvCommitMarker("sv: init project")]);
  }
  return root;
}

export function ensureGitRepositorySync(cwd: string): string {
  ensureProjectGitRootSync(cwd);
  try {
    return runGitSync(cwd, ["branch", "--show-current"]) || "main";
  } catch {
    return "main";
  }
}

export interface CreatedSessionWorktree {
  repoRoot: string;
  worktreePath: string;
  branch: string;
  /** Branch checked out at project root when the worktree was created (log only). */
  startBranch: string;
}

export function sessionBranchName(sessionId: string): string {
  return `pi/session-${sessionId.slice(0, 8)}`;
}

export function sessionWorktreePath(repoRoot: string, sessionId: string): string {
  return join(repoRoot, ".pi", "supervisor", "worktrees", sessionId);
}

export type SessionGitCommit = { hash: string; message: string };

/** Core runtime view of a session worktree (from sessions.meta.git). */
export type SessionGitContext = {
  repoRoot: string;
  worktreePath: string;
  branch: string;
  worktreeEnabled: boolean;
  lastCommit?: SessionGitCommit;
  mergeError?: string;
};

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function parseGitLastCommit(raw: string | null | undefined): SessionGitCommit | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { hash?: unknown; message?: unknown };
    if (typeof parsed.hash === "string" && typeof parsed.message === "string") {
      return { hash: parsed.hash, message: parsed.message };
    }
  } catch {
    // ignore invalid JSON
  }
  return null;
}

function parseGitMetaFromSessionMeta(meta: Record<string, unknown> | undefined | null): {
  worktreePath: string | null;
  branch?: string;
  lastCommit?: SessionGitCommit;
  mergeError?: string;
} {
  const raw = meta?.git;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { worktreePath: null };
  }
  const git = raw as Record<string, unknown>;
  const last =
    git.lastCommit && typeof git.lastCommit === "object"
      ? (git.lastCommit as { hash?: unknown; message?: unknown })
      : null;
  return {
    worktreePath: typeof git.worktreePath === "string" ? git.worktreePath : null,
    branch: typeof git.branch === "string" ? git.branch : undefined,
    lastCommit:
      last && typeof last.hash === "string" && typeof last.message === "string"
        ? { hash: last.hash, message: last.message }
        : undefined,
    mergeError: typeof git.mergeError === "string" ? git.mergeError : undefined,
  };
}

/** Resolve worktree paths from sessions.meta.git + project cwd. */
export function resolveSessionGitContext(input: {
  sessionId: number;
  cwd: string;
  projectCwd?: string | null;
  meta?: Record<string, unknown> | null;
  /** @deprecated Prefer meta.git.worktreePath */
  gitWorktreeEnabled?: boolean;
}): SessionGitContext | null {
  const repoRoot = input.projectCwd;
  if (!repoRoot) return null;

  const git = parseGitMetaFromSessionMeta(input.meta);
  const defaultWorktreePath = sessionWorktreePath(repoRoot, String(input.sessionId));
  const worktreePath = git.worktreePath ?? defaultWorktreePath;
  const onWorktree = normalizeRepoPath(input.cwd) === normalizeRepoPath(worktreePath);
  const worktreeEnabled = Boolean(git.worktreePath) || input.gitWorktreeEnabled === true;
  if (!onWorktree && !worktreeEnabled) return null;

  return {
    repoRoot,
    worktreePath: onWorktree ? input.cwd : worktreePath,
    branch: git.branch ?? sessionBranchName(String(input.sessionId)),
    worktreeEnabled: true,
    ...(git.lastCommit ? { lastCommit: git.lastCommit } : {}),
    ...(git.mergeError ? { mergeError: git.mergeError } : {}),
  };
}

/** Achieve merge target: project repo current checkout (never stored on session). */
export async function resolveMergeTargetBranch(repoRoot: string): Promise<string> {
  return getCurrentBranch(repoRoot);
}

async function runGit(
  cwd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  const result = await execGit("git", args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

export async function findGitRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
    return stdout || null;
  } catch {
    return null;
  }
}

export async function getDefaultBranch(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await runGit(repoRoot, [
      "symbolic-ref",
      "--short",
      "refs/remotes/origin/HEAD",
    ]);
    const remote = stdout.replace(/^origin\//, "").trim();
    if (remote) return remote;
  } catch {
    // fall through
  }
  return getCurrentBranch(repoRoot);
}

/** Branch checked out at the project repo root — source of truth for new session worktrees. */
export async function getCurrentBranch(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await runGit(repoRoot, ["branch", "--show-current"]);
    if (stdout.trim()) return stdout.trim();
  } catch {
    // fall through
  }
  try {
    const { stdout } = await runGit(repoRoot, ["rev-parse", "--short", "HEAD"]);
    if (stdout.trim()) return stdout.trim();
  } catch {
    // fall through
  }
  return "main";
}

export async function listLocalBranches(repoRoot: string): Promise<string[]> {
  try {
    const { stdout } = await runGit(repoRoot, ["branch", "--format=%(refname:short)"]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function createSessionWorktree(
  repoRoot: string,
  sessionId: string,
): Promise<CreatedSessionWorktree> {
  const branch = sessionBranchName(sessionId);
  const worktreePath = sessionWorktreePath(repoRoot, sessionId);
  mkdirSync(join(repoRoot, ".pi", "supervisor", "worktrees"), { recursive: true });
  const startBranch = await getCurrentBranch(repoRoot);
  await runGit(repoRoot, ["worktree", "add", "-b", branch, worktreePath, startBranch]);
  return {
    repoRoot,
    worktreePath,
    branch,
    startBranch,
  };
}

export async function getGitStatusPorcelain(cwd: string): Promise<string> {
  try {
    const { stdout } = await runGit(cwd, ["status", "--porcelain"]);
    return stdout;
  } catch {
    return "";
  }
}

export async function getGitDiffStat(cwd: string): Promise<string> {
  try {
    const { stdout } = await runGit(cwd, ["diff", "--stat", "HEAD"]);
    return stdout;
  } catch {
    return "";
  }
}

export async function getGitHead(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(cwd, ["rev-parse", "HEAD"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function commitAll(
  cwd: string,
  message: string,
): Promise<{ hash: string; message: string } | null> {
  const status = await getGitStatusPorcelain(cwd);
  if (!status.trim()) return null;
  const marked = withSvCommitMarker(message);
  await runGit(cwd, ["add", "-A"]);
  await runGit(cwd, ["commit", "-m", marked]);
  const { stdout: hash } = await runGit(cwd, ["rev-parse", "--short", "HEAD"]);
  return { hash, message: marked };
}

/** Create an immutable commit object representing the worktree without moving HEAD. */
export async function createGitSnapshot(cwd: string): Promise<string | null> {
  const inRepo = await findGitRoot(cwd);
  if (!inRepo) return null;
  const directory = mkdtempSync(join(tmpdir(), "supervisor-git-index-"));
  const indexPath = join(directory, "index");
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    const head = await getGitHead(cwd);
    if (!head) return null;
    await runGit(cwd, ["read-tree", head], env);
    await runGit(cwd, ["add", "-A"], env);
    const { stdout: tree } = await runGit(cwd, ["write-tree"], env);
    const { stdout: snapshot } = await runGit(
      cwd,
      ["commit-tree", tree, "-p", head, "-m", "supervisor worktree snapshot"],
      env,
    );
    return snapshot.trim() || null;
  } catch {
    return null;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Restore working tree to a snapshot created by createGitSnapshot. */
export async function restoreGitSnapshot(
  cwd: string,
  ref: string | null,
  _head?: string | null,
): Promise<void> {
  try {
    await runGit(cwd, ["reset", "--hard", "HEAD"]);
  } catch {
    // fresh repo may not have commits; continue to apply snapshot
  }
  if (!ref?.trim()) return;
  try {
    await runGit(cwd, ["clean", "-fd"]);
  } catch {
    // ignore clean failures
  }
  await runGit(cwd, ["restore", "--source", ref, "--staged", "--worktree", "--", "."]);
}

/** Commit exactly a prior worktree snapshot while preserving newer working-tree changes. */
export async function commitGitSnapshot(
  cwd: string,
  snapshotRef: string,
  expectedHead: string,
  message: string,
): Promise<{ hash: string; message: string }> {
  const currentHead = await getGitHead(cwd);
  if (currentHead !== expectedHead) {
    throw new Error("Snapshot base has changed; refusing to commit a stale Shadow result");
  }
  const marked = withSvCommitMarker(message);
  const { stdout: tree } = await runGit(cwd, ["rev-parse", `${snapshotRef}^{tree}`]);
  const { stdout: commit } = await runGit(cwd, [
    "commit-tree",
    tree,
    "-p",
    expectedHead,
    "-m",
    marked,
  ]);
  const hash = commit.trim();
  await runGit(cwd, ["update-ref", "HEAD", hash, expectedHead]);
  await runGit(cwd, ["reset", "--mixed", hash]);
  return { hash: hash.slice(0, 12), message: marked };
}

export async function mergeSessionBranch(
  repoRoot: string,
  branch: string,
  targetBranch: string,
): Promise<void> {
  await runGit(repoRoot, ["checkout", targetBranch]);
  await runGit(repoRoot, [
    "merge",
    "--no-ff",
    branch,
    "-m",
    withSvCommitMarker(`Merge ${branch}`),
  ]);
}

export interface SvCommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  timestamp: number;
}

/** List supervisor-marked commits in [sinceMs, untilMs) across all refs. */
export async function listSvCommitsBetween(
  cwd: string,
  sinceMs: number,
  untilMs: number,
): Promise<SvCommitInfo[]> {
  const repoRoot = await findGitRoot(cwd);
  if (!repoRoot) return [];
  const since = new Date(sinceMs).toISOString();
  const until = new Date(untilMs).toISOString();
  const { stdout } = await runGit(repoRoot, [
    "log",
    "--all",
    `--since=${since}`,
    `--until=${until}`,
    "--grep=^Sv: true",
    "--extended-regexp",
    "--regexp-ignore-case",
    "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ct%x1e",
  ]).catch(() => ({ stdout: "", stderr: "" }));

  const seen = new Set<string>();
  const commits: SvCommitInfo[] = [];
  for (const chunk of stdout.split("\x1e")) {
    const line = chunk.trim();
    if (!line) continue;
    const [hash = "", shortHash = "", subject = "", author = "", timestamp = "0"] =
      line.split("\x1f");
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);
    commits.push({
      hash,
      shortHash,
      subject,
      author,
      timestamp: Number(timestamp) * 1000,
    });
  }
  commits.sort((left, right) => left.timestamp - right.timestamp);
  return commits;
}

export async function removeSessionWorktree(
  repoRoot: string,
  worktreePath: string,
  branch: string,
  options?: { forceBranch?: boolean },
): Promise<void> {
  try {
    await runGit(repoRoot, ["worktree", "remove", worktreePath, "--force"]);
  } catch {
    // worktree may already be gone / not registered
  }
  const branchFlag = options?.forceBranch ? "-D" : "-d";
  try {
    await runGit(repoRoot, ["branch", branchFlag, branch]);
  } catch {
    // branch may already be deleted or still has commits (non-force)
  }
}

export async function listWorktreeCommits(
  cwd: string,
  sinceBranch: string,
  limit = 30,
): Promise<
  Array<{ hash: string; shortHash: string; subject: string; author: string; timestamp: number }>
> {
  const { stdout } = await runGit(cwd, [
    "log",
    `${sinceBranch}..HEAD`,
    `-${Math.max(1, Math.min(limit, 100))}`,
    "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ct%x1e",
  ]).catch(() => ({ stdout: "", stderr: "" }));
  return stdout
    .split("\x1e")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash = "", shortHash = "", subject = "", author = "", timestamp = "0"] =
        line.split("\x1f");
      return { hash, shortHash, subject, author, timestamp: Number(timestamp) * 1000 };
    });
}

export interface GitRemoteResult {
  ok: true;
  stdout: string;
  stderr: string;
}

export interface ProjectGitInfo {
  currentBranch: string;
  branches: string[];
}

export async function getProjectGitInfo(cwd: string): Promise<ProjectGitInfo> {
  const repoRoot = await findGitRoot(cwd);
  if (!repoRoot) throw new Error("not a git repository");
  const [currentBranch, branches] = await Promise.all([
    getCurrentBranch(repoRoot),
    listLocalBranches(repoRoot),
  ]);
  return { currentBranch, branches };
}

function formatGitError(error: unknown): Error {
  if (
    error &&
    typeof error === "object" &&
    "stderr" in error &&
    typeof (error as { stderr?: unknown }).stderr === "string" &&
    (error as { stderr: string }).stderr.trim()
  ) {
    return new Error((error as { stderr: string }).stderr.trim());
  }
  if (error instanceof Error) return error;
  return new Error(String(error));
}

/** Run `git pull` in the given repository working directory. */
export async function gitPull(cwd: string): Promise<GitRemoteResult> {
  const repoRoot = await findGitRoot(cwd);
  if (!repoRoot) throw new Error("not a git repository");
  try {
    const result = await runGit(repoRoot, ["pull"]);
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    throw formatGitError(error);
  }
}

/** Run `git push` in the given repository working directory. */
export async function gitPush(cwd: string): Promise<GitRemoteResult> {
  const repoRoot = await findGitRoot(cwd);
  if (!repoRoot) throw new Error("not a git repository");
  try {
    const result = await runGit(repoRoot, ["push"]);
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    throw formatGitError(error);
  }
}

/** Checkout a local branch at the project repo root. */
export async function gitCheckout(cwd: string, branch: string): Promise<GitRemoteResult> {
  const repoRoot = await findGitRoot(cwd);
  if (!repoRoot) throw new Error("not a git repository");
  const name = branch.trim();
  if (!name) throw new Error("branch name is required");
  try {
    const result = await runGit(repoRoot, ["checkout", name]);
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    throw formatGitError(error);
  }
}
