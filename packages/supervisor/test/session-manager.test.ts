import { existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, AgentHarnessEvent } from "@earendil-works/pi-agent-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "./mock-agent-harness.js";
import { SupervisorDb } from "../src/db.js";
import { SessionManager } from "../src/session-manager.js";
import { MockAgentHarness } from "./mock-agent-harness.js";
import { getSessionDir } from "../src/core/session-files.js";

const SPAWN_OPTS = { cwd: "/proj" };

let db: SupervisorDb;
let manager: SessionManager;
let tmpDir: string;

beforeEach(() => {
  MockAgentHarness.instances = [];
  tmpDir = join(tmpdir(), `supervisor-im-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new SupervisorDb(join(tmpDir, "test.db"));
  manager = new SessionManager(db);
});

afterEach(async () => {
  await manager.dispose();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("supervisor: SessionManager", () => {
  it("create() inserts a record without starting a harness", () => {
    const inst = manager.create({ cwd: "/proj", meta: { phase: "brainstorm" } });
    expect(inst.status).toBe("starting");
    expect(inst.pid).toBeNull();
    expect(inst.meta).toEqual({ phase: "brainstorm" });
    expect(MockAgentHarness.instances).toHaveLength(0);
  });

  it("classifies child sessions and controls main-list visibility", () => {
    const parent = manager.create({ cwd: "/proj" });
    const subagent = manager.create({ parentId: parent.id, cwd: parent.cwd });
    const btw = manager.createBtw(parent.id);

    expect(parent.branchType).toBeNull();
    expect(parent.showInSessionList).toBe(true);
    expect(subagent.branchType).toBe("subagent");
    expect(subagent.showInSessionList).toBe(false);
    expect(btw.branchType).toBe("btw");
    expect(btw.showInSessionList).toBe(false);
    expect(btw.contextLeafId).toBe(parent.leafId);
  });

  it("spawn() creates AgentHarness and marks instance idle when no instructions", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    expect(MockAgentHarness.instances).toHaveLength(1);
    expect(inst.status).toBe("idle");
    expect(inst.sessionId).toBe(String(inst.id));
    expect(manager.isAlive(inst.id)).toBe(true);
  });

  it("spawn() does not create a git worktree when parentId is set", async () => {
    const repoDir = join(tmpDir, "repo");
    mkdirSync(repoDir, { recursive: true });
    execFileSync("git", ["init"], { cwd: repoDir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
    execFileSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: repoDir });

    const parent = await manager.spawn({ cwd: repoDir });
    const child = await manager.spawn({ parentId: parent.id, cwd: parent.cwd });

    expect(parent.meta.git).toBeDefined();
    expect(child.parentId).toBe(parent.id);
    expect(child.meta.git).toBeUndefined();
    expect(child.cwd).toBe(parent.cwd);
  });

  it("onOutput() receives agent events", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    const received: AgentHarnessEvent[] = [];
    manager.onOutput(inst.id, (_id, event) => received.push(event));
    MockAgentHarness.instances[0]!.agent.emit({ type: "agent_end" } as AgentEvent);
    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe("agent_end");
  });

  it("status transitions to idle on agent_end event", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    MockAgentHarness.instances[0]!.agent.emit({ type: "agent_start" } as AgentEvent);
    MockAgentHarness.instances[0]!.agent.emit({ type: "agent_end" } as AgentEvent);
    expect(manager.get(inst.id)!.status).toBe("idle");
  });

  it("status transitions to running on agent_start event", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    MockAgentHarness.instances[0]!.agent.emit({ type: "agent_start" } as AgentEvent);
    expect(manager.get(inst.id)!.status).toBe("running");
  });

  it("prompt() delegates to harness.agent.prompt()", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    await manager.prompt(inst.id, "hello");
    expect(MockAgentHarness.instances[0]!.agent.prompt).toHaveBeenCalledWith("hello");
  });

  it("prompt() rejects sessions bound to a disabled model provider", async () => {
    const providerId = db.insertProvider({
      slug: "disabled-provider",
      name: "Disabled Provider",
      api_type: "openai-compatible",
      is_enabled: 0,
    });
    const agent = db.insertAgent({
      name: "disabled provider agent",
      provider_id: providerId,
      model_id: "test-model",
    });
    const inst = manager.create({ cwd: "/proj", agentId: agent.id });

    await expect(manager.prompt(inst.id, "hello")).rejects.toThrow(
      'Model provider "Disabled Provider" is disabled',
    );
    expect(MockAgentHarness.instances).toHaveLength(0);
  });

  it("headless controls delegate to the runtime harness", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    manager.steer(inst.id, "change direction");
    manager.followUp(inst.id, "next");
    await manager.abort(inst.id);
    await manager.compact(inst.id, "short");
    await manager.setThinkingLevel(inst.id, "low");

    const harness = MockAgentHarness.instances[0]!;
    expect(harness.steer).toHaveBeenCalledWith("change direction");
    expect(harness.followUp).toHaveBeenCalledWith("next");
    expect(harness.abort).toHaveBeenCalled();
    expect(harness.compact).toHaveBeenCalledWith("short");
    expect(harness.setThinkingLevel).toHaveBeenCalledWith("low");
  });

  it("getState() returns a headless state snapshot", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    const state = await manager.getState(inst.id);
    expect(state.id).toBe(inst.id);
    expect(state.cwd).toBe("/proj");
    expect(state.model.provider).toBe("anthropic");
    expect(state.messageCount).toBe(0);
  });

  it("lists member agents by tag", async () => {
    const providerId = db.insertProvider({
      slug: "test-provider",
      name: "Test Provider",
      api_type: "anthropic-messages",
    });
    const reviewer = db.insertAgent({
      name: "shadow reviewer",
      provider_id: providerId,
      model_id: "claude-sonnet-4-6",
    });
    const inst = await manager.spawn(SPAWN_OPTS);

    manager.upsertMember(inst.id, reviewer.id, { role: "observer", tags: ["shadow", "review"] });

    const agents = manager.listMemberAgentsByTag(inst.id, "shadow");
    expect(agents).toHaveLength(1);
    expect(agents[0]?.id).toBe(reviewer.id);
    expect(agents[0]?.member.tags).toEqual(["shadow", "review"]);
  });

  it("prompt() throws for non-existent instance", async () => {
    await expect(manager.prompt("nope", "hi")).rejects.toThrow("not found");
  });

  it("prompt() throws for finished instance", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    await manager.kill(inst.id);
    await expect(manager.prompt(inst.id, "hi")).rejects.toThrow("not resumable");
  });

  it("kill() aborts agent and marks instance finish", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    await manager.kill(inst.id);
    expect(MockAgentHarness.instances[0]!.agent.abort).toHaveBeenCalled();
    expect(manager.get(inst.id)!.status).toBe("finish");
    expect(manager.isAlive(inst.id)).toBe(false);
  });

  it("kill() throws for non-running instance", async () => {
    const inst = manager.create();
    await expect(manager.kill(inst.id)).rejects.toThrow("not running");
  });

  it("getMessages() returns session entries for instance", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    const { SQLiteSessionStorage } = await import("../src/session-storage.js");
    const storage = new SQLiteSessionStorage(db, inst.id);
    const entryId = await storage.createEntryId();
    await storage.appendEntry({
      id: entryId,
      parentId: null,
      timestamp: new Date().toISOString(),
      type: "message",
      message: { role: "user", content: "hi", timestamp: Date.now() },
    });
    const messages = await manager.getMessages(inst.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe("message");
  });

  it("updateMeta merges patch", () => {
    const inst = manager.create({ meta: { a: 1 } });
    expect(manager.updateMeta(inst.id, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("setMeta replaces meta", () => {
    const inst = manager.create({ meta: { old: true } });
    manager.setMeta(inst.id, { new: true });
    expect(manager.get(inst.id)!.meta).toEqual({ new: true });
  });

  it("persists workflow state and automatically emits stage changes", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    const events: Array<{ from: string | null; to: string | null }> = [];
    manager.getRuntime(inst.id).extension!.on("workflow.stage_changed", (event) => {
      events.push({ from: event.from, to: event.to });
    });

    await manager.setWorkflow(inst.id, { stage: "brainstorm", status: "working" });
    await manager.setWorkflow(inst.id, { status: "waiting_confirmation" });
    await manager.setWorkflow(inst.id, { stage: "design", status: "working" });

    expect(manager.getWorkflow(inst.id)).toEqual({ stage: "design", status: "working" });
    expect(manager.get(inst.id)!.meta.workflow).toEqual({ stage: "design", status: "working" });
    expect(events).toEqual([
      { from: null, to: "brainstorm" },
      { from: "brainstorm", to: "design" },
    ]);
  });

  it("rejects incomplete and invalid workflow state", async () => {
    const inst = manager.create();
    await expect(manager.setWorkflow(inst.id, { status: "working" })).rejects.toThrow(
      "workflow stage is required",
    );
    await expect(
      manager.setWorkflow(inst.id, { stage: "brainstorm", status: "unknown" as never }),
    ).rejects.toThrow("invalid workflow status");
  });

  it("records file changes in meta.turns on agent_end", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    const tracker = MockAgentHarness.instances[0]!;
    tracker.agent.emit({ type: "agent_start" } as AgentEvent);
    tracker.agent.emit({
      type: "tool_execution_start",
      toolCallId: "tc1",
      toolName: "edit",
      args: { path: "src/app.ts", edits: [{ oldText: "a", newText: "b" }] },
    } as AgentEvent);
    tracker.agent.emit({
      type: "tool_execution_end",
      toolCallId: "tc1",
      toolName: "edit",
      result: {},
      isError: false,
    } as AgentEvent);
    tracker.agent.emit({ type: "agent_end", messages: [] } as AgentEvent);

    const updated = manager.get(inst.id)!;
    const turns = updated.meta.turns as Array<{ files: { modified: string[] } }>;
    expect(turns).toHaveLength(1);
    expect(turns[0]!.files.modified).toContain("src/app.ts");
  });

  it("delete() removes the session-owned directory", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    const sessionDir = getSessionDir(inst.projectId!, inst.id);
    expect(existsSync(sessionDir)).toBe(true);

    manager.delete(inst.id);

    expect(existsSync(sessionDir)).toBe(false);
  });

  it("children() returns child instances", () => {
    const parent = manager.create();
    manager.create({ parentId: parent.id });
    manager.create({ parentId: parent.id });
    expect(manager.children(parent.id)).toHaveLength(2);
  });

  it("fork() sets branch_type and marks copied messages is_old", async () => {
    const parent = await manager.spawn(SPAWN_OPTS);
    const { SQLiteSessionStorage } = await import("../src/session-storage.js");
    const storage = new SQLiteSessionStorage(db, parent.id);
    const entryId = await storage.createEntryId();
    await storage.appendEntry(
      {
        id: entryId,
        parentId: null,
        timestamp: new Date().toISOString(),
        type: "message",
        message: { role: "user", content: "before fork", timestamp: Date.now() },
      },
      { source: "sidecar-a" },
    );

    const forked = await manager.fork(parent.id, entryId);
    expect(forked.branchType).toBe("fork");
    expect(forked.parentId).toBe(parent.id);

    const messages = await manager.getSessionMessages(forked.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.isOld).toBe(true);
    expect(messages[0]?.source).toBe("sidecar-a");
    expect(messages[0]?.meta).toEqual({});
  });
});
