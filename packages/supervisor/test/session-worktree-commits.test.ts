import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitAll, createSessionWorktree, listWorktreeCommits } from "../src/utils/git.js";

let tmpDir: string;
let repoDir: string;

function initGitRepo(dir: string): void {
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "test"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "init\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
}

function addMainCommit(message: string): void {
  writeFileSync(join(repoDir, `${message}.txt`), `${message}\n`);
  execFileSync("git", ["add", "-A"], { cwd: repoDir });
  execFileSync("git", ["commit", "-m", message], { cwd: repoDir });
}

beforeEach(() => {
  tmpDir = join(tmpdir(), `supervisor-worktree-commits-${Date.now()}`);
  repoDir = join(tmpDir, "repo");
  mkdirSync(repoDir, { recursive: true });
  initGitRepo(repoDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("supervisor: session worktree commits", () => {
  it("lists only commits on the session branch since project branch", async () => {
    addMainCommit("main-one");
    addMainCommit("main-two");

    const gitMeta = await createSessionWorktree(repoDir, "session-1");
    writeFileSync(join(gitMeta.worktreePath, "feature.txt"), "session work\n");
    await commitAll(gitMeta.worktreePath, "session commit one");
    writeFileSync(join(gitMeta.worktreePath, "feature.txt"), "more work\n");
    await commitAll(gitMeta.worktreePath, "session commit two");

    const commits = await listWorktreeCommits(gitMeta.worktreePath, gitMeta.startBranch);
    expect(commits.map((item) => item.subject)).toEqual([
      "session commit two",
      "session commit one",
    ]);
  });

  it("returns empty list when session branch has no new commits", async () => {
    const gitMeta = await createSessionWorktree(repoDir, "session-2");
    const commits = await listWorktreeCommits(gitMeta.worktreePath, gitMeta.startBranch);
    expect(commits).toEqual([]);
  });
});
