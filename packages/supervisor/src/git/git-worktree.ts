import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execGit = promisify(execFile);

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

async function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
	const result = await execGit("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
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
		const { stdout } = await runGit(repoRoot, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
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

export async function createSessionWorktree(repoRoot: string, sessionId: string): Promise<SessionGitMeta> {
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

export async function commitAll(cwd: string, message: string): Promise<{ hash: string; message: string } | null> {
	const status = await getGitStatusPorcelain(cwd);
	if (!status.trim()) return null;
	await runGit(cwd, ["add", "-A"]);
	await runGit(cwd, ["commit", "-m", message]);
	const { stdout: hash } = await runGit(cwd, ["rev-parse", "--short", "HEAD"]);
	return { hash, message };
}

/** Create a stash-style snapshot of the working tree without mutating it. Returns commit object name or null. */
export async function createGitSnapshot(cwd: string): Promise<string | null> {
	const inRepo = await findGitRoot(cwd);
	if (!inRepo) return null;
	try {
		const { stdout } = await runGit(cwd, ["stash", "create"]);
		const ref = stdout.trim();
		return ref || null;
	} catch {
		return null;
	}
}

/** Restore working tree to a snapshot created by createGitSnapshot. */
export async function restoreGitSnapshot(cwd: string, ref: string): Promise<void> {
	if (!ref.trim()) return;
	try {
		await runGit(cwd, ["reset", "--hard", "HEAD"]);
	} catch {
		// fresh repo may not have commits; continue to apply snapshot
	}
	try {
		await runGit(cwd, ["clean", "-fd"]);
	} catch {
		// ignore clean failures
	}
	try {
		await runGit(cwd, ["stash", "apply", "--index", ref]);
		return;
	} catch {
		await runGit(cwd, ["stash", "apply", ref]);
	}
}

export async function mergeSessionBranch(repoRoot: string, branch: string, baseBranch: string): Promise<void> {
	await runGit(repoRoot, ["checkout", baseBranch]);
	await runGit(repoRoot, ["merge", "--no-ff", branch, "-m", `Merge ${branch}`]);
}

export async function removeSessionWorktree(repoRoot: string, worktreePath: string, branch: string): Promise<void> {
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
