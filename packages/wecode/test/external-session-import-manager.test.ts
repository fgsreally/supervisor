import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/core/session/external/external-session-import.js", () => ({
  listExternalSessions: vi.fn(),
  loadExternalSession: vi.fn(async (_backend: string, externalSessionId: string) => ({
    candidate: {
      backend: "codex",
      externalSessionId,
      cwd: importedCwd || testCwd,
      title: "Imported chat",
      preview: "",
      lastActiveAt: new Date().toISOString(),
    },
    entries: [
      {
        id: "message-1",
        parentId: null,
        timestamp: new Date().toISOString(),
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "hello" }] },
      },
    ],
  })),
  materializeImportedImages: vi.fn(
    async (_projectId: number, _sessionId: number, entries: []) => entries,
  ),
}));

vi.mock("../src/utils/git.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/git.js")>()),
  commitAll: vi.fn(async () => undefined),
}));

import { WecodeDb } from "../src/db.js";
import { SessionManager } from "../src/session-manager.js";
import { commitAll } from "../src/utils/git.js";

let testCwd = "";
let importedCwd = "";
let manager: SessionManager | undefined;

afterEach(async () => {
  await manager?.dispose();
  manager = undefined;
  importedCwd = "";
  if (testCwd) rmSync(testCwd, { recursive: true, force: true });
});

describe("external session import", () => {
  it("returns imported history without waiting for project parsing", async () => {
    testCwd = join(tmpdir(), `wecode-import-test-${Date.now()}`);
    mkdirSync(testCwd, { recursive: true });
    const db = new WecodeDb(join(testCwd, "test.db"));
    db.insertAgent({ name: "Codex", backend_type: "codex" });
    manager = new SessionManager(db);

    let finishParse!: () => void;
    const parsing = new Promise<void>((resolve) => {
      finishParse = resolve;
    });
    vi.spyOn(manager as any, "parseProject").mockReturnValue(parsing);
    const restore = vi.spyOn(manager as any, "restoreRuntime").mockResolvedValue({});

    const imported = await manager.importExternalSession({
      backend: "codex",
      externalSessionId: "external-1",
    });

    expect(imported).toMatchObject({ title: "Imported chat", status: "active" });
    await expect(manager.getMessages(imported.id)).resolves.toHaveLength(1);
    expect(commitAll).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();

    finishParse();
    await vi.waitFor(() => expect(restore).toHaveBeenCalledWith(imported.id));
  });

  it("starts an imported external runtime without session plugins", async () => {
    testCwd = join(tmpdir(), `wecode-import-test-${Date.now()}`);
    mkdirSync(testCwd, { recursive: true });
    const db = new WecodeDb(join(testCwd, "test.db"));
    db.insertAgent({ name: "Codex", backend_type: "codex" });
    manager = new SessionManager(db);

    vi.spyOn(manager as any, "parseProject").mockResolvedValue(undefined);
    const attach = vi.spyOn(manager as any, "attachExternalSessionPlugins");
    vi.spyOn(manager as any, "createExternalRuntime").mockResolvedValue({});

    await manager.importExternalSession({
      backend: "codex",
      externalSessionId: "external-without-plugins",
    });

    await vi.waitFor(() => expect(manager!.list()[0]?.status).toBe("active"));
    expect(attach).not.toHaveBeenCalled();
  });

  it("imports a Wecode worktree conversation at the project root", async () => {
    testCwd = join(tmpdir(), `wecode-import-test-${Date.now()}`);
    importedCwd = join(testCwd, ".wecode", "worktrees", "148");
    mkdirSync(importedCwd, { recursive: true });
    const db = new WecodeDb(join(testCwd, "test.db"));
    db.insertAgent({ name: "Codex", backend_type: "codex" });
    manager = new SessionManager(db);

    vi.spyOn(manager as any, "parseProject").mockResolvedValue(undefined);
    vi.spyOn(manager as any, "restoreRuntime").mockResolvedValue({});
    const imported = await manager.importExternalSession({
      backend: "codex",
      externalSessionId: "external-worktree",
    });

    expect(imported.cwd).toBe(testCwd);
    expect(manager.getProject(imported.projectId!)?.cwd).toBe(testCwd);
  });
});
