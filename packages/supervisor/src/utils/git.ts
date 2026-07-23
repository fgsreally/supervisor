import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

export function ensureGitRepositorySync(cwd: string): string {
  mkdirSync(cwd, { recursive: true });
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    git(["rev-parse", "--show-toplevel"]);
  } catch {
    git(["init", "-b", "main"]);
  }
  let branch = "";
  try {
    branch = git(["branch", "--show-current"]);
  } catch {
    // handled below
  }
  if (!branch) {
    branch = "main";
    git(["symbolic-ref", "HEAD", `refs/heads/${branch}`]);
  }
  return branch;
}

export interface SessionGitMeta {
  repoRoot: string;
  worktreePath: string;
  branch: string;
  baseBranch: string;
  worktreeEnabled: true;
  turnCount?: number;
  lastCommit?: { hash: string; message: string };
  mergeError?: string;
}

export function sessionBranchName(sessionId: string): string {
  return `pi/session-${sessionId.slice(0, 8)}`;
}

export function sessionWorktreePath(repoRoot: string, sessionId: string): string {
  return join(repoRoot, ".pi", "supervisor", "worktrees", sessionId);
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
  try {
    const { stdout } = await runGit(repoRoot, ["branch", "--show-current"]);
    if (stdout) return stdout;
  } catch {
    // fall through
  }
  return "main";
}

export async function createSessionWorktree(
  repoRoot: string,
  sessionId: string,
): Promise<SessionGitMeta> {
  const branch = sessionBranchName(sessionId);
  const worktreePath = sessionWorktreePath(repoRoot, sessionId);
  mkdirSync(join(repoRoot, ".pi", "supervisor", "worktrees"), { recursive: true });
  const baseBranch = await getDefaultBranch(repoRoot);
  await runGit(repoRoot, ["worktree", "add", "-b", branch, worktreePath, baseBranch]);
  return {
    repoRoot,
    worktreePath,
    branch,
    baseBranch,
    worktreeEnabled: true,
    turnCount: 0,
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
  baseBranch: string,
): Promise<void> {
  await runGit(repoRoot, ["checkout", baseBranch]);
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
): Promise<void> {
  try {
    await runGit(repoRoot, ["worktree", "remove", worktreePath, "--force"]);
  } catch {
    // worktree may already be gone
  }
  try {
    await runGit(repoRoot, ["branch", "-d", branch]);
  } catch {
    // branch may already be deleted
  }
}

export function parseSessionGitMeta(meta: Record<string, unknown>): SessionGitMeta | null {
  const git = meta.git;
  if (!git || typeof git !== "object") return null;
  const item = git as Record<string, unknown>;
  if (item.worktreeEnabled !== true) return null;
  if (
    typeof item.repoRoot !== "string" ||
    typeof item.worktreePath !== "string" ||
    typeof item.branch !== "string" ||
    typeof item.baseBranch !== "string"
  ) {
    return null;
  }
  return {
    repoRoot: item.repoRoot,
    worktreePath: item.worktreePath,
    branch: item.branch,
    baseBranch: item.baseBranch,
    worktreeEnabled: true,
    ...(typeof item.turnCount === "number" ? { turnCount: item.turnCount } : {}),
    ...(item.lastCommit && typeof item.lastCommit === "object"
      ? { lastCommit: item.lastCommit as SessionGitMeta["lastCommit"] }
      : {}),
    ...(typeof item.mergeError === "string" ? { mergeError: item.mergeError } : {}),
  };
}

export async function listWorktreeCommits(
  cwd: string,
  limit = 30,
): Promise<
  Array<{ hash: string; shortHash: string; subject: string; author: string; timestamp: number }>
> {
  const { stdout } = await runGit(cwd, [
    "log",
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
