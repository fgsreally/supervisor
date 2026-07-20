import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentHarnessEvent } from "@earendil-works/pi-agent-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SupervisorDb } from "../src/db/db.js";
import {
  commitGitSnapshot,
  createGitSnapshot,
  getGitHead,
  getGitStatusPorcelain,
  parseSessionGitMeta,
} from "../src/utils/git.js";
import { handleSessionLifecycleAgentEnd } from "../src/core/session-lifecycle.js";
import { commitSessionChanges } from "../src/core/session-lifecycle.js";
import type { SessionRuntime } from "../src/core/session-runtime.js";

let db: SupervisorDb;
let tmpDir: string;
let repoDir: string;

function initGitRepo(dir: string): void {
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "test"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "init\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
}

function sessionGitMeta() {
  return {
    repoRoot: repoDir,
    worktreePath: repoDir,
    branch: "pi/session-test",
    baseBranch: "main",
    worktreeEnabled: true as const,
  };
}

beforeEach(() => {
  tmpDir = join(tmpdir(), `supervisor-git-commit-${Date.now()}`);
  repoDir = join(tmpDir, "repo");
  mkdirSync(repoDir, { recursive: true });
  initGitRepo(repoDir);
  db = new SupervisorDb(join(tmpDir, "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("supervisor: explicit commit", () => {
  it("commits exactly a captured snapshot and preserves newer worktree changes", async () => {
    writeFileSync(join(repoDir, "feature.txt"), "round one\n");
    const head = await getGitHead(repoDir);
    const snapshot = await createGitSnapshot(repoDir);
    expect(head).toBeTruthy();
    expect(snapshot).toBeTruthy();

    writeFileSync(join(repoDir, "feature.txt"), "round two\n");
    writeFileSync(join(repoDir, "second.txt"), "newer work\n");
    await commitGitSnapshot(repoDir, snapshot!, head!, "feat: save round one");

    const committed = execFileSync("git", ["show", "HEAD:feature.txt"], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(committed).toBe("round one\n");
    expect(readFileSync(join(repoDir, "feature.txt"), "utf8")).toBe("round two\n");
    expect(readFileSync(join(repoDir, "second.txt"), "utf8")).toBe("newer work\n");
    const status = await getGitStatusPorcelain(repoDir);
    expect(status).toContain("feature.txt");
    expect(status).toContain("second.txt");
  });

  it("commitSessionChanges updates meta.git.lastCommit", async () => {
    const session = db.insert({
      project_id: null,
      parent_id: null,
      session_id: null,
      pid: null,
      status: "idle",
      cwd: repoDir,
      meta: JSON.stringify({ git: sessionGitMeta() }),
    });

    writeFileSync(join(repoDir, "feature.txt"), "new work\n");

    const commit = await commitSessionChanges(session.id, repoDir, session.meta, db, {
      message: "explicit commit",
    });
    expect(commit?.message).toBe("explicit commit");
    expect(commit?.hash).toMatch(/^[0-9a-f]+$/);

    const refreshed = db.get(session.id)!;
    const gitMeta = parseSessionGitMeta(refreshed.meta);
    expect(gitMeta?.lastCommit?.hash).toBe(commit?.hash);
    expect(await getGitStatusPorcelain(repoDir)).toBe("");
  });

  it("agent_end does not auto-commit dirty worktree", async () => {
    const session = db.insert({
      project_id: null,
      parent_id: null,
      session_id: null,
      pid: null,
      status: "idle",
      cwd: repoDir,
      meta: JSON.stringify({ git: sessionGitMeta(), name: "Named session" }),
    });

    writeFileSync(join(repoDir, "dirty.txt"), "uncommitted\n");

    const event: Extract<AgentHarnessEvent, { type: "agent_end" }> = {
      type: "agent_end",
      messages: [
        { role: "user", content: "hello", timestamp: Date.now() },
        { role: "assistant", content: "hi", timestamp: Date.now() },
      ],
    };
    const runtime = {
      harness: {
        agent: { state: { model: null, messages: [] } },
        session: {},
      },
    } as unknown as SessionRuntime;

    handleSessionLifecycleAgentEnd(session.id, runtime, event, db);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const refreshed = db.get(session.id)!;
    expect(parseSessionGitMeta(refreshed.meta)?.lastCommit).toBeUndefined();
    expect((await getGitStatusPorcelain(repoDir)).trim()).toContain("dirty.txt");
  });
});
