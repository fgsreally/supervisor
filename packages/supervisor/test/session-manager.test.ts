import { existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentEvent, AgentHarnessEvent } from "@earendil-works/pi-agent-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./mock-agent-harness.js";
import { SupervisorDb } from "../src/db.js";
import { SessionManager } from "../src/session-manager.js";
import { MockAgentHarness } from "./mock-agent-harness.js";
import { getProjectDir, getSessionDir } from "../src/core/session-files.js";
import { ensurePackagedAgents, findPackagedAgentId } from "../src/agent/index.js";

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
    expect(inst.status).toBe("idle");
    expect(inst.meta).toEqual({ phase: "brainstorm" });
    expect(MockAgentHarness.instances).toHaveLength(0);
  });

  it("copies a native Agent's default subagents into new sessions", () => {
    const agent = db.insertAgent({ name: "delegator", meta: { subagentIds: [2, 3] } });

    expect(manager.create({ cwd: "/proj", agentId: agent.id }).meta.subagentIds).toEqual([2, 3]);
    expect(
      manager.create({ cwd: "/proj", agentId: agent.id, meta: { subagentIds: [4] } }).meta
        .subagentIds,
    ).toEqual([4]);
  });

  it("does not copy default subagents from external Agents", () => {
    const agent = db.insertAgent({
      name: "external",
      backend_type: "codex",
      meta: { subagentIds: [2, 3] },
    });

    expect(manager.create({ cwd: "/proj", agentId: agent.id }).meta.subagentIds).toBeUndefined();
  });

  it("classifies child sessions and controls main-list visibility", () => {
    const providerId = db.insertProvider({
      slug: "test-provider",
      name: "Test Provider",
      protocol: "anthropic-messages",
    });
    db.insertModel({ provider_id: providerId, model_id: "claude-sonnet-4-6" });
    ensurePackagedAgents(db);
    const codingId = findPackagedAgentId(db, "coding")!;
    const parent = manager.create({ cwd: "/proj", agentId: codingId });
    const subagent = manager.create({ parentId: parent.id, cwd: parent.cwd, agentId: codingId });
    const btw = manager.createBtw(parent.id);

    expect(parent.spawnType).toBeNull();
    expect(subagent.spawnType).toBe("subagent");
    expect(btw.spawnType).toBe("btw");
    // BTW reuses the parent session's agent; readonly is enforced at runtime.
    expect(btw.agentId).toBe(codingId);
    expect(btw.systemPrompt ?? "").toBe("");
  });

  it("spawn() creates AgentHarness and marks instance idle when no instructions", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    expect(MockAgentHarness.instances).toHaveLength(1);
    expect(inst.status).toBe("idle");
    expect(manager.isAlive(inst.id)).toBe(true);
  });

  it("spawn() keeps a native Agent without a model as blocked", async () => {
    const agent = db.insertAgent({ name: "model pending" });
    const inst = await manager.spawn({ ...SPAWN_OPTS, agentId: agent.id });

    expect(inst.status).toBe("blocked");
    expect(inst.errorMsg).toBe("Agent 未配置模型");
    expect(MockAgentHarness.instances).toHaveLength(0);
    await expect(manager.prompt(inst.id, "hello")).rejects.toThrow(/blocked|未配置模型/i);
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

    expect(parent.cwd).not.toBe(repoDir);
    expect(child.parentId).toBe(parent.id);
    expect(child.cwd).toBe(parent.cwd);
  });

  it("runs an external Agent as a delegated child and normalizes its output", async () => {
    const fixture = join(
      dirname(fileURLToPath(import.meta.url)),
      "fixtures",
      "mock-codex-app-server.mjs",
    );
    const project = db.insertProject({ cwd: tmpDir, name: "external child test" });
    const parent = manager.create({ projectId: project.id, cwd: tmpDir });
    const external = db.insertAgent({
      name: "External child",
      backend_type: "codex",
      meta: { external: { command: process.execPath, args: [fixture] } },
    });

    const child = await manager.spawn({
      parentId: parent.id,
      projectId: project.id,
      cwd: tmpDir,
      agentId: external.id,
    });
    await manager.prompt(child.id, "inspect input delegated task");

    expect(child.parentId).toBe(parent.id);
    expect(child.spawnType).toBe("subagent");
    expect(child.agentId).toBe(external.id);
    const messages = await manager.getMessages(child.id);
    const assistantOutput = messages
      .filter((message) => message.type === "message" && message.message.role === "assistant")
      .map((message) => String(message.message.content))
      .join("\n");
    expect(assistantOutput).toContain("You are running as a delegated subagent");
    expect(assistantOutput).toContain("Delegated task");
    expect(assistantOutput).toContain("inspect input delegated task");
    expect(assistantOutput).toContain("codex reply");
  }, 60_000);

  it("onOutput() receives agent events", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    const received: AgentHarnessEvent[] = [];
    manager.onOutput(inst.id, (_id, event) => received.push(event));
    MockAgentHarness.instances[0]!.agent.emit({ type: "agent_end" } as AgentEvent);
    expect(received.some((event) => event.type === "agent_end")).toBe(true);
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
      protocol: "openai-compatible",
      is_enabled: 0,
    });
    const modelId = db.insertModel({ provider_id: providerId, model_id: "test-model" }).id;
    const agent = db.insertAgent({
      name: "disabled provider agent",
      model_id: modelId,
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

  it("retracts the latest unanswered user message when aborting", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    const { SQLiteSessionStorage } = await import("../src/session-storage.js");
    const storage = new SQLiteSessionStorage(db, inst.id);
    const entryId = await storage.createEntryId();
    await storage.appendEntry({
      id: entryId,
      parentId: null,
      timestamp: new Date().toISOString(),
      type: "message",
      message: { role: "user", content: "unsent thought", timestamp: Date.now() },
    });
    vi.spyOn(manager.getRuntime(inst.id) as any, "reloadMessagesFromSessionTree").mockResolvedValue(
      undefined,
    );

    const result = await manager.abort(inst.id, { retractIfNoAssistant: true });

    expect(result.retracted).toBe(true);
    expect(await manager.getMessages(inst.id)).toEqual([]);
  });

  it("getState() returns a headless state snapshot", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    const state = await manager.getState(inst.id);
    expect(state.id).toBe(inst.id);
    expect(state.cwd).toBe("/proj");
    expect(state.model.provider).toBe("anthropic");
    expect(state.messageCount).toBe(0);
  });

  it("stores spawned agent ids in session metadata", async () => {
    const providerId = db.insertProvider({
      slug: "test-provider",
      name: "Test Provider",
      protocol: "anthropic-messages",
    });
    const modelId = db.insertModel({
      provider_id: providerId,
      model_id: "claude-sonnet-4-6",
    }).id;
    const reviewer = db.insertAgent({
      name: "spawned reviewer",
      model_id: modelId,
    });
    const inst = await manager.spawn(SPAWN_OPTS);

    expect(manager.setSessionSubagentIds(inst.id, [reviewer.id, reviewer.id])).toEqual([
      reviewer.id,
    ]);
    expect(db.getSessionSubagentIds(inst.id)).toEqual([reviewer.id]);
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

  it("persists stage and emits stage changes", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    const events: Array<{ from: string | null; to: string | null }> = [];
    manager.getRuntime(inst.id).extension!.on("workflow.stage_changed", (event) => {
      events.push({ from: event.from, to: event.to });
    });

    await manager.setStage(inst.id, "brainstorm");
    await manager.setWorkflow(inst.id, { status: "waiting_confirmation" });
    await manager.setStage(inst.id, "design");

    expect(manager.getStage(inst.id)).toBe("design");
    expect(manager.getWorkflow(inst.id)).toEqual({ stage: "design", status: "working" });
    expect(manager.get(inst.id)!.stage).toBe("design");
    expect(events).toEqual([
      { from: null, to: "brainstorm" },
      { from: "brainstorm", to: "design" },
    ]);
  });

  it("setWorkflow without stage keeps current stage", async () => {
    const inst = manager.create();
    await manager.setStage(inst.id, "brainstorm");
    const kept = await manager.setWorkflow(inst.id, { status: "working" });
    expect(kept).toEqual({ stage: "brainstorm", status: "working" });
    expect(manager.getStage(inst.id)).toBe("brainstorm");
  });

  it("records file changes in meta.changedFiles on agent_end", async () => {
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
    const changed = updated.meta.changedFiles as Array<{ path: string; status: string }>;
    expect(changed.some((file) => file.path === "src/app.ts")).toBe(true);
  });

  it("delete() removes the session-owned directory", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    const sessionDir = getSessionDir(inst.projectId!, inst.id);
    expect(existsSync(sessionDir)).toBe(true);

    await manager.delete(inst.id);

    expect(existsSync(sessionDir)).toBe(false);
  });

  it("does not delete builtin assistant sessions directly", async () => {
    const session = manager.create({ isBuiltin: true });

    await expect(manager.delete(session.id)).rejects.toThrow("Pi 助手不能删除");
    expect(manager.get(session.id)).toBeDefined();
  });

  it("deleteProject() deletes its sessions and owned directory", async () => {
    const project = manager.createProject({ cwd: join(tmpDir, "workspace") });
    const parent = manager.create({ projectId: project.id, cwd: project.cwd });
    manager.create({ projectId: project.id, cwd: project.cwd, parentId: parent.id });
    expect(existsSync(getProjectDir(project.id))).toBe(true);

    await manager.deleteProject(project.id);

    expect(manager.getProject(project.id)).toBeUndefined();
    expect(db.list({ projectId: project.id })).toHaveLength(0);
    expect(existsSync(getProjectDir(project.id))).toBe(false);
  });

  it("children() returns child instances", () => {
    const parent = manager.create();
    manager.create({ parentId: parent.id });
    manager.create({ parentId: parent.id });
    expect(manager.children(parent.id)).toHaveLength(2);
  });

  it("reopens a finished spawned child before submitting more input", async () => {
    const parent = manager.create();
    const child = manager.create({ parentId: parent.id });
    const completed = await manager.complete(child.id);
    expect(completed).toMatchObject({ status: "finish", spawnType: "subagent" });
    const submit = vi.spyOn(manager, "submitSessionInput").mockResolvedValue("drained");

    await manager.submitSubagentInput(parent.id, child.id, "continue reviewing");

    expect(manager.get(child.id)).toMatchObject({ status: "idle", spawnType: "subagent" });
    expect(submit).toHaveBeenCalledWith(child.id, {
      message: "continue reviewing",
      level: 50,
      source: `subagent:parent:${parent.id}`,
    });
  });

  it("interrupts the current child turn for urgent continued input", async () => {
    const parent = manager.create();
    const child = manager.create({ parentId: parent.id });
    const interrupt = vi.spyOn(manager, "interruptAndPrompt").mockResolvedValue();

    const disposition = await manager.submitSubagentInput(parent.id, child.id, "stop and inspect", {
      urgency: "urgent",
    });

    expect(disposition).toBe("interrupt");
    expect(interrupt).toHaveBeenCalledWith(
      child.id,
      "stop and inspect",
      undefined,
      `subagent:parent:${parent.id}`,
      undefined,
    );
  });

  it("rejects continuing a Session that is not a direct spawned child", async () => {
    const parent = manager.create();
    const unrelated = manager.create();
    await expect(manager.submitSubagentInput(parent.id, unrelated.id, "continue")).rejects.toThrow(
      "not a direct spawned subagent",
    );
  });

  it("queues continued input while the spawned child is busy", async () => {
    const parent = manager.create();
    const child = manager.create({ parentId: parent.id });
    const busyManager = manager as unknown as {
      isSessionBusy(sessionId: number): Promise<boolean>;
    };
    vi.spyOn(busyManager, "isSessionBusy").mockResolvedValue(true);

    const disposition = await manager.submitSubagentInput(
      parent.id,
      child.id,
      "follow-up while busy",
    );

    expect(disposition).toBe("queued");
    expect(manager.listSessionInputs(child.id)).toMatchObject([
      { message: "follow-up while busy" },
    ]);
  });

  it("restores queued Session input after Supervisor restarts", async () => {
    const session = manager.create();
    const busyManager = manager as unknown as {
      isSessionBusy(sessionId: number): Promise<boolean>;
    };
    vi.spyOn(busyManager, "isSessionBusy").mockResolvedValue(true);
    await manager.submitSessionInput(session.id, {
      message: "resume this after restart",
      source: "test:persistence",
    });

    await manager.dispose();
    db = new SupervisorDb(join(tmpDir, "test.db"));
    manager = new SessionManager(db);

    expect(manager.listSessionInputs(session.id)).toMatchObject([
      { message: "resume this after restart", level: 50 },
    ]);
  });

  it("normalizes interrupted Session states when Supervisor restarts", async () => {
    const initializing = manager.create();
    const running = manager.create();
    const waiting = manager.create();
    const finished = manager.create({ parentId: initializing.id });
    db.updateStatus(initializing.id, "initializing");
    db.updateStatus(running.id, "running");
    db.updateStatus(waiting.id, "blocked");
    db.updateStatus(finished.id, "finish");

    await manager.dispose();
    db = new SupervisorDb(join(tmpDir, "test.db"));
    manager = new SessionManager(db);

    expect(manager.get(initializing.id)?.status).toBe("idle");
    expect(manager.get(running.id)?.status).toBe("idle");
    expect(manager.get(waiting.id)?.status).toBe("idle");
    expect(manager.get(finished.id)?.status).toBe("finish");
    expect(manager.get(finished.id)?.spawnType).toBe("subagent");
  });

  it("fork() sets spawn_type and marks copied messages is_old", async () => {
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
    expect(forked.spawnType).toBe("fork");
    expect(forked.parentId).toBe(parent.id);

    const messages = await manager.getSessionMessages(forked.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.isOld).toBe(true);
    expect(messages[0]?.meta).toEqual({});
  });

  it("fork() from a user message includes the following assistant turn", async () => {
    const parent = await manager.spawn(SPAWN_OPTS);
    const { SQLiteSessionStorage } = await import("../src/session-storage.js");
    const storage = new SQLiteSessionStorage(db, parent.id);

    const userId = await storage.createEntryId();
    await storage.appendEntry({
      id: userId,
      parentId: null,
      timestamp: new Date().toISOString(),
      type: "message",
      message: { role: "user", content: "ask", timestamp: Date.now() },
    });

    const assistantId = await storage.createEntryId();
    await storage.appendEntry({
      id: assistantId,
      parentId: userId,
      timestamp: new Date().toISOString(),
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "answer" }],
        timestamp: Date.now(),
      },
    });

    const nextUserId = await storage.createEntryId();
    await storage.appendEntry({
      id: nextUserId,
      parentId: assistantId,
      timestamp: new Date().toISOString(),
      type: "message",
      message: { role: "user", content: "later", timestamp: Date.now() },
    });

    const forkedFromUser = await manager.fork(parent.id, userId);
    const fromUser = await manager.getSessionMessages(forkedFromUser.id);
    expect(fromUser).toHaveLength(2);
    expect(fromUser[0]?.message).toMatchObject({ role: "user", content: "ask" });
    expect(fromUser[1]?.message).toMatchObject({ role: "assistant" });

    const forkedFromAssistant = await manager.fork(parent.id, assistantId);
    const fromAssistant = await manager.getSessionMessages(forkedFromAssistant.id);
    expect(fromAssistant).toHaveLength(2);
    expect(fromAssistant[0]?.message).toMatchObject({ role: "user", content: "ask" });
    expect(fromAssistant[1]?.message).toMatchObject({ role: "assistant" });
  });
});
