import { describe, expect, it } from "vitest";
import {
  resolveSessionGitContext,
  sessionBranchName,
  sessionWorktreePath,
} from "../src/utils/git.js";
import { isDefaultSessionName } from "../src/core/session-lifecycle.js";

describe("supervisor: git-worktree helpers", () => {
  it("sessionBranchName uses short session id", () => {
    expect(sessionBranchName("abcdef12-0000-0000-0000-000000000000")).toBe("pi/session-abcdef12");
  });

  it("sessionWorktreePath is under .pi/supervisor/worktrees", () => {
    const path = sessionWorktreePath("/repo", "sess-1").replace(/\\/g, "/");
    expect(path).toBe("/repo/.pi/supervisor/worktrees/sess-1");
  });

  it("resolveSessionGitContext uses meta.git.worktreePath and project cwd", () => {
    const repoRoot = "/repo";
    const sessionId = 42;
    const worktreePath = sessionWorktreePath(repoRoot, String(sessionId));
    const ctx = resolveSessionGitContext({
      sessionId,
      cwd: worktreePath,
      projectCwd: repoRoot,
      meta: { git: { worktreePath, branch: "pi/session-42" } },
    });
    expect(ctx?.branch).toBe("pi/session-42");
    expect(ctx?.worktreeEnabled).toBe(true);
  });

  it("resolveSessionGitContext returns null without project cwd", () => {
    expect(
      resolveSessionGitContext({
        sessionId: 1,
        cwd: "/repo/.pi/supervisor/worktrees/1",
        meta: { git: { worktreePath: "/repo/.pi/supervisor/worktrees/1" } },
      }),
    ).toBeNull();
  });
});

describe("supervisor: session-git-hooks", () => {
  it("isDefaultSessionName detects placeholder names", () => {
    const id = 0xabcdef12;
    expect(isDefaultSessionName(null, id)).toBe(true);
    expect(isDefaultSessionName("New chat", id)).toBe(true);
    expect(isDefaultSessionName(`Session ${String(id).slice(0, 8)}`, id)).toBe(true);
    expect(isDefaultSessionName("Agent", id, "Agent")).toBe(true);
    expect(isDefaultSessionName("我的功能分支", id)).toBe(false);
  });
});
