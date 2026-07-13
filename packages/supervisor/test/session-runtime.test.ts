import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "./mock-agent-harness.js";
import { SupervisorDb } from "../src/db.js";
import { SessionManager } from "../src/session-manager.js";
import { SQLiteSessionStorage } from "../src/session-storage.js";
import { ensurePackagedAgents, findPackagedAgentId } from "../src/agent/internal-agents.js";
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

describe("supervisor: SupervisorSessionRuntime", () => {
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

  it("shadow child send_parent_msg delivers to parent session", async () => {
    const providerId = db.insertProvider({
      slug: "test-provider",
      name: "Test Provider",
      api_type: "anthropic-messages",
    });
    db.insertModel({ provider_id: providerId, model_id: "claude-sonnet-4-6", name: "Sonnet" });
    ensurePackagedAgents(db);
    const shadowAgentId = findPackagedAgentId(db, "shadow");
    expect(shadowAgentId).toBeDefined();

    const parent = await manager.spawn({ cwd: "/proj", agentId: undefined });
    const shadowChild = await manager.spawn({
      parentId: parent.id,
      agentId: shadowAgentId,
      cwd: "/proj",
      meta: { shadowOf: parent.id, hidden: true },
    });
    const shadowRuntime = manager.getRuntime(shadowChild.id);

    await shadowRuntime.extensionRuntime!.executeTool(
      "send_parent_msg",
      { message: "security issue", level: 80 },
      {
        toolCallId: "shadow-1",
        session: { id: String(shadowChild.id), cwd: "/proj" },
        reportProgress: () => {},
      },
    );

    // Parent is idle — submitSessionInput drains immediately
    expect(manager.peekSessionInput(parent.id)).toBeUndefined();
    expect(MockAgentHarness.instances[0]!.agent.prompt).toHaveBeenCalledWith("security issue");
  });

  it("shadow child send_parent_msg queues when parent is busy", async () => {
    const providerId = db.insertProvider({
      slug: "test-provider",
      name: "Test Provider",
      api_type: "anthropic-messages",
    });
    db.insertModel({ provider_id: providerId, model_id: "claude-sonnet-4-6", name: "Sonnet" });
    ensurePackagedAgents(db);
    const shadowAgentId = findPackagedAgentId(db, "shadow");
    expect(shadowAgentId).toBeDefined();

    const parent = await manager.spawn({ cwd: "/proj", agentId: undefined });
    MockAgentHarness.instances[0]!.agent.emit({ type: "agent_start" } as import("@earendil-works/pi-agent-core").AgentEvent);

    const shadowChild = await manager.spawn({
      parentId: parent.id,
      agentId: shadowAgentId,
      cwd: "/proj",
      meta: { shadowOf: parent.id, hidden: true },
    });
    const shadowRuntime = manager.getRuntime(shadowChild.id);

    await shadowRuntime.extensionRuntime!.executeTool(
      "send_parent_msg",
      { message: "security issue", level: 80 },
      {
        toolCallId: "shadow-2",
        session: { id: String(shadowChild.id), cwd: "/proj" },
        reportProgress: () => {},
      },
    );

    expect(manager.peekSessionInput(parent.id)?.message).toBe("security issue");
    MockAgentHarness.instances[0]!.agent.prompt.mockClear();
    MockAgentHarness.instances[0]!.agent.emit({ type: "agent_end", messages: [] } as import("@earendil-works/pi-agent-core").AgentEvent);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(MockAgentHarness.instances[0]!.agent.prompt).toHaveBeenCalledWith("security issue");
  });
});
