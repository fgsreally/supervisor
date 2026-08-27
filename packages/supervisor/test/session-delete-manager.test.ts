import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/git.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/git.js")>()),
  removeSessionWorktree: vi.fn(async () => undefined),
}));

import { SupervisorDb } from "../src/db.js";
import { SessionManager } from "../src/session-manager.js";
import { removeSessionWorktree } from "../src/utils/git.js";

let root = "";
let manager: SessionManager | undefined;

afterEach(async () => {
  await manager?.dispose();
  manager = undefined;
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("session deletion", () => {
  it("closes the runtime before removing its worktree", async () => {
    root = join(tmpdir(), `supervisor-delete-test-${Date.now()}`);
    const projectCwd = join(root, "project");
    const worktreePath = join(projectCwd, ".supervisor", "worktrees", "1");
    mkdirSync(worktreePath, { recursive: true });
    const db = new SupervisorDb(join(root, "test.db"));
    const project = db.insertProject({ cwd: projectCwd });
    manager = new SessionManager(db);
    const session = manager.create({ projectId: project.id, cwd: worktreePath });
    const clear = vi.fn(async () => undefined);
    const runtimes = (
      manager as unknown as {
        runtimes: Map<number, { extension: null; clear: () => Promise<void> }>;
      }
    ).runtimes;
    runtimes.set(session.id, { extension: null, clear });

    await manager.delete(session.id);
    await vi.waitFor(() => expect(removeSessionWorktree).toHaveBeenCalledOnce());

    expect(clear.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(removeSessionWorktree).mock.invocationCallOrder[0]!,
    );
  });

  it("clears a runtime deleted by another Supervisor process", async () => {
    root = join(tmpdir(), `supervisor-delete-test-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    const db = new SupervisorDb(join(root, "test.db"));
    manager = new SessionManager(db);
    const session = manager.create();
    const clear = vi.fn(async () => undefined);
    const internal = manager as unknown as {
      runtimes: Map<number, { extension: null; clear: () => Promise<void> }>;
      clearDeletedRuntimes: () => void;
    };
    internal.runtimes.set(session.id, { extension: null, clear });
    db.delete(session.id);

    internal.clearDeletedRuntimes();

    await vi.waitFor(() => expect(clear).toHaveBeenCalledOnce());
    expect(internal.runtimes.has(session.id)).toBe(false);
  });
});
