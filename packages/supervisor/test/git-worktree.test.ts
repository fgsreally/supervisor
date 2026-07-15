import { describe, expect, it } from "vitest";
import { parseSessionGitMeta, sessionBranchName, sessionWorktreePath } from "../src/utils/git.js";
import { isDefaultSessionName } from "../src/core/session-lifecycle.js";

describe("supervisor: git-worktree helpers", () => {
  it("sessionBranchName uses short session id", () => {
    expect(sessionBranchName("abcdef12-0000-0000-0000-000000000000")).toBe("pi/session-abcdef12");
  });

  it("sessionWorktreePath is under .pi/supervisor/worktrees", () => {
    const path = sessionWorktreePath("/repo", "sess-1").replace(/\\/g, "/");
    expect(path).toBe("/repo/.pi/supervisor/worktrees/sess-1");
  });

  it("parseSessionGitMeta returns null when worktree disabled", () => {
    expect(parseSessionGitMeta({ git: { worktreeEnabled: false } })).toBeNull();
    expect(parseSessionGitMeta({})).toBeNull();
  });

  it("parseSessionGitMeta parses active worktree meta", () => {
    const meta = parseSessionGitMeta({
      git: {
        repoRoot: "/repo",
        worktreePath: "/repo/.pi/supervisor/worktrees/s1",
        branch: "pi/session-abc",
        baseBranch: "main",
        worktreeEnabled: true,
        turnCount: 2,
      },
    });
    expect(meta?.branch).toBe("pi/session-abc");
    expect(meta?.turnCount).toBe(2);
  });
});

describe("supervisor: session-git-hooks", () => {
  it("isDefaultSessionName detects placeholder names", () => {
    const id = "abcdef12-0000-0000-0000-000000000000";
    expect(isDefaultSessionName({}, id)).toBe(true);
    expect(isDefaultSessionName({ name: "New chat" }, id)).toBe(true);
    expect(isDefaultSessionName({ name: "Session abcdef12" }, id)).toBe(true);
    expect(isDefaultSessionName({ name: "Agent", nameDefault: "Agent" }, id)).toBe(true);
    expect(isDefaultSessionName({ name: "我的功能分支" }, id)).toBe(false);
  });
});
