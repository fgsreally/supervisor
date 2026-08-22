import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionDeviceSync } from "../src/core/session/sync/session-device-sync.js";
import { SupervisorDb } from "../src/db.js";

let db: SupervisorDb;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `supervisor-device-sync-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new SupervisorDb(join(tmpDir, "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("SessionDeviceSync", () => {
  it("stores a draft per session and clears it", () => {
    const first = db.insert({ project_id: null, parent_id: null, status: "idle", cwd: "/" });
    const second = db.insert({ project_id: null, parent_id: null, status: "idle", cwd: "/" });
    const sync = new SessionDeviceSync(db);

    const draft = sync.setDraft(first.id, "  unfinished prompt  ");
    expect(draft?.text).toBe("  unfinished prompt  ");
    expect(sync.getSnapshot(first.id, state(first.id)).draft?.text).toBe("  unfinished prompt  ");
    expect(sync.getSnapshot(second.id, state(second.id)).draft).toBeNull();

    expect(sync.setDraft(first.id, "")).toBeNull();
    expect(sync.getSnapshot(first.id, state(first.id)).draft).toBeNull();
  });

  it("returns the current streaming reply with the session snapshot", () => {
    const session = db.insert({ project_id: null, parent_id: null, status: "running", cwd: "/" });
    const sync = new SessionDeviceSync(db);
    const snapshot = sync.getSnapshot(session.id, {
      ...state(session.id),
      isStreaming: true,
      streamingReply: "partial answer",
    });

    expect(snapshot.stream).toEqual({ isStreaming: true, streamingReply: "partial answer" });
  });
});

function state(id: number) {
  return {
    id,
    sessionId: null,
    cwd: "/",
    status: "idle" as const,
    model: { provider: "native", modelId: "test" },
    thinkingLevel: "off" as const,
    isStreaming: false,
    messageCount: 0,
    leafId: null,
  };
}
