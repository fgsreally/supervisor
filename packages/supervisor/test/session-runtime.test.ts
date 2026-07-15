import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "./mock-agent-harness.js";
import { SupervisorDb } from "../src/db.js";
import { SessionManager } from "../src/session-manager.js";
import { SQLiteSessionStorage } from "../src/session-storage.js";
import { MockAgentHarness } from "./mock-agent-harness.js";

let db: SupervisorDb;
let manager: SessionManager;
let tmpDir: string;

beforeEach(() => {
  MockAgentHarness.instances = [];
  tmpDir = join(tmpdir(), `supervisor-runtime-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new SupervisorDb(join(tmpDir, "test.db"));
  manager = new SessionManager(db);
});

afterEach(async () => {
  await manager.dispose();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("supervisor: SessionRuntime", () => {
  it("wraps AgentHarness prompt and state", async () => {
    const inst = await manager.spawn({ cwd: "/proj" });
    const runtime = manager.getRuntime(inst.id);

    await runtime.prompt("hello");
    expect(MockAgentHarness.instances[0]!.prompt).toHaveBeenCalledWith("hello", undefined);

    const state = await runtime.getState();
    expect(state.id).toBe(inst.id);
    expect(state.sessionId).toBe(String(inst.id));
    expect(state.isStreaming).toBe(false);
  });

  it("counts SQLite message entries in state", async () => {
    const inst = await manager.spawn({ cwd: "/proj" });
    const storage = new SQLiteSessionStorage(db, inst.id);
    const id = await storage.createEntryId();
    await storage.appendEntry({
      id,
      parentId: null,
      timestamp: new Date().toISOString(),
      type: "message",
      message: { role: "user", content: "hi", timestamp: Date.now() },
    });

    const state = await manager.getState(inst.id);
    expect(state.messageCount).toBe(1);
  });

  it("returns the last assistant text from in-memory agent state", async () => {
    const inst = await manager.spawn({ cwd: "/proj" });
    const runtime = manager.getRuntime(inst.id);
    MockAgentHarness.instances[0]!.agent.state.messages.push({
      role: "assistant",
      content: [{ type: "text", text: "done" }],
    });

    expect(runtime.getLastAssistantText()).toBe("done");
  });
});
