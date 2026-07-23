import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createEventBus, SessionExtensionHost } from "../src/extension/runtime/index.js";
import { defineExtension } from "../src/extension/index.js";
import { loadExtensions } from "../src/extension/index.js";
import { createExtensionTestContext, type RuntimeOptions } from "./extension-context-fixture.js";

function createRuntimeOptions(sessionId = 1): RuntimeOptions & { finishedSessions: number[] } {
  const eventBus = createEventBus();
  const finishedSessions: number[] = [];
  return {
    finishedSessions,
    sessionId,
    parentSessionId: null,
    cwd: process.cwd(),
    sessionDir: tmpdir(),
    projectDir: tmpdir(),
    agent: { id: 1, name: "test", providerId: 1, modelId: "test-model" },
    db: {
      sqlite: undefined,
      getMessages: async () => [],
      getMessageById: async () => undefined,
      getMessageTree: async () => [],
      getCurrentBranch: async () => [],
      searchMessages: async () => [],
      getCustomEntries: async () => [],
      getLatestCustomEntry: async () => undefined,
      getSessionMeta: async () => ({}),
      getMessageMeta: async () => ({}),
      getChildSessions: async () => [],
      getParentSession: async () => undefined,
      getMessageStats: async () => ({
        total: 0,
        user: 0,
        assistant: 0,
        tool: 0,
        custom: 0,
      }),
      getContextUsage: async () => ({ tokens: null, contextWindow: 128000, percent: null }),
    },
    deps: {
      appendEntry: async () => "entry-1",
      sendMessage: async () => {},
      sendCustomMessage: async () => "custom-1",
      sendUserMessage: async () => {},
      getSessionDir: async () => tmpdir(),
      getProjectDir: async () => tmpdir(),
      getMemberAgentsByTag: async () => [],
      getMemberAgentsByRole: async () => [
        {
          id: 10,
          name: "child",
          description: null,
          providerId: 1,
          modelId: "test-model",
          toolsPreset: "readonly",
          role: "spawned",
          tags: ["review"],
        },
      ],
      spawnSession: async (request) => ({
        sessionId: 2,
        parentId: request.parentId ?? null,
        status: "idle",
        agentId: request.agentId ?? null,
        agentName: "child",
      }),
      waitForSessionIdle: async () => {},
      getSessionResultSummary: async (sessionId) => ({
        sessionId,
        status: "idle",
        result: "child result",
        truncated: false,
      }),
      finishSession: async (targetSessionId) => {
        finishedSessions.push(targetSessionId);
      },
      pausing: async (_reason, work) => (typeof work === "function" ? work() : work),
      setSessionMeta: async () => {},
      patchSessionMeta: async (patch) => patch,
      setMessageMeta: async () => {},
      patchMessageMeta: async (_id, patch) => patch,
      setLabel: async () => {},
      isIdle: () => true,
      isStreaming: () => false,
      getSignal: () => undefined,
      abort: () => {},
      waitForIdle: async () => {},
      fork: async () => ({
        id: 2,
        cwd: process.cwd(),
        messageCount: 0,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      }),
      switchSession: async () => {},
      navigateTree: async () => {},
      compact: async () => ({ summary: "", firstKeptEntryId: "", tokensBefore: 0 }),
      setModel: async () => {},
      setThinkingLevel: () => {},
      getThinkingLevel: () => "none" as const,
      getModel: () => undefined,
      listSessionTools: () => [],
      emitExtensionEvent: async () => {},
      exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false, duration: 0 }),
      log: () => {},
      broadcast: () => {},
      eventBus,
      continueTurn: async () => {},
      setActiveTools: async () => {},
      getContextUsage: async () => ({ tokens: null }),
    },
  };
}

describe("extension runtime events", () => {
  it("emits persisted tool results with their stable message id", async () => {
    const runtime = new SessionExtensionHost(createExtensionTestContext(createRuntimeOptions()));
    let seen: { messageId: string; entryId: string } | undefined;
    await runtime.load(
      defineExtension({
        name: "stored-result-test",
        setup(ctx) {
          return ctx.on("message.tool_result", (event) => {
            seen = { messageId: event.messageId, entryId: event.entryId };
          });
        },
      }),
      "/tmp/stored-result-test.ts",
    );

    await runtime.handleStoredEntry({
      id: "result-entry-1",
      parentId: "assistant-1",
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "browser",
        content: [{ type: "text", text: "done" }],
      },
    } as any);

    expect(seen).toEqual({ messageId: "result-entry-1", entryId: "result-entry-1" });
  });

  it("attaches completed recordings to tool result message assets", async () => {
    const sessionDir = join(tmpdir(), "supervisor-message-assets-test");
    const options = createRuntimeOptions();
    options.sessionDir = sessionDir;
    let patchedId = "";
    let patched: Record<string, unknown> = {};
    options.deps.patchMessageMeta = async (id, patch) => {
      patchedId = id;
      patched = patch;
      return patch;
    };
    const runtime = new SessionExtensionHost(createExtensionTestContext(options));
    await runtime.initialize();

    await runtime.handleStoredEntry({
      id: "recording-result-1",
      parentId: "assistant-1",
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "browser",
        content: [{ type: "text", text: "Browser recording saved" }],
        details: {
          action: "stop_recording",
          path: join(sessionDir, "recordings", "e2e.webm"),
        },
      },
    } as any);

    expect(patchedId).toBe("recording-result-1");
    expect(patched).toEqual({
      assets: [
        {
          scope: "session",
          path: "recordings/e2e.webm",
          name: "Browser recording",
          mediaType: "video/webm",
        },
      ],
    });

    await runtime.handleStoredEntry({
      id: "screenshot-result-1",
      parentId: "assistant-1",
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "call-2",
        toolName: "browser",
        content: [{ type: "text", text: "Browser screenshot saved" }],
        details: {
          action: "screenshot",
          path: join(sessionDir, "screenshots", "page.png"),
        },
      },
    } as any);

    expect(patchedId).toBe("screenshot-result-1");
    expect(patched).toEqual({
      assets: [
        {
          scope: "session",
          path: "screenshots/page.png",
          name: "Browser screenshot",
          mediaType: "image/png",
        },
      ],
    });
  });

  it("delivers system events registered via ctx.on", async () => {
    const runtime = new SessionExtensionHost(createExtensionTestContext(createRuntimeOptions()));
    let seen = 0;

    await runtime.load(
      defineExtension({
        name: "event-test",
        setup(ctx) {
          ctx.on("session.start", async () => {
            seen += 1;
          });
          ctx.on("tool.after_call", async () => {
            seen += 10;
          });
        },
      }),
      "/tmp/event-test.ts",
    );

    await runtime.emit({ type: "session.start", reason: "startup", sessionId: 1 } as any);
    await runtime.emit({
      type: "tool.after_call",
      toolCallId: "1",
      name: "bash",
      args: {},
      result: { content: [], isError: false, duration: 0 },
      entryId: "",
    } as any);

    expect(seen).toBe(11);
  });

  it("exposes project-owned and session-owned directories to extensions", async () => {
    const runtime = new SessionExtensionHost(createExtensionTestContext(createRuntimeOptions()));
    let seenDir = "";
    let seenProjectDir = "";

    await runtime.load(
      defineExtension({
        name: "session-dir-test",
        async setup(ctx) {
          seenDir = await ctx.session.getDir();
          seenProjectDir = await ctx.project.getDir();
        },
      }),
      "/tmp/session-dir-test.ts",
    );

    expect(seenDir).toBe(tmpdir());
    expect(seenProjectDir).toBe(tmpdir());
  });

  it("exposes core session object helpers", async () => {
    const runtime = new SessionExtensionHost(createExtensionTestContext(createRuntimeOptions()));
    let sessionId = 0;
    let isMain = false;
    let isChild = true;
    let messages = 0;
    let childSessions = 0;

    await runtime.load(
      defineExtension({
        name: "core-object-test",
        async setup(ctx) {
          sessionId = ctx.session.id;
          isMain = ctx.session.isMain;
          isChild = ctx.session.isChild;
          messages = (await ctx.session.messages.list()).length;
          childSessions = (await ctx.session.children()).length;
        },
      }),
      "/tmp/core-object-test.ts",
    );

    expect(sessionId).toBe(1);
    expect(isMain).toBe(true);
    expect(isChild).toBe(false);
    expect(messages).toBe(0);
    expect(childSessions).toBe(0);
  });

  it("registers subagent tool only on main sessions", async () => {
    const mainRuntime = new SessionExtensionHost(
      createExtensionTestContext(createRuntimeOptions()),
    );
    const childRuntime = new SessionExtensionHost(
      createExtensionTestContext({
        ...createRuntimeOptions(2),
        parentSessionId: 1,
      }),
    );
    await mainRuntime.initialize();
    await childRuntime.initialize();

    expect(mainRuntime.getTool("spawn_agent")).toBeDefined();
    expect(childRuntime.getTool("spawn_agent")).toBeUndefined();
  });

  it("runs eval code in a persistent session-owned JavaScript kernel", async () => {
    const sessionDir = join(tmpdir(), `supervisor-eval-${Date.now()}`);
    const options = createRuntimeOptions();
    options.sessionDir = sessionDir;
    const runtime = new SessionExtensionHost(createExtensionTestContext(options));
    await runtime.initialize();
    const executionContext = {
      session: runtime.getToolExecutionSession(),
      reportProgress: () => {},
    };

    const first = await runtime.executeTool(
      "eval",
      { language: "js", code: "var answer = 40" },
      { ...executionContext, toolCallId: "eval-1" },
    );
    const second = await runtime.executeTool(
      "eval",
      { language: "js", code: "answer + 2" },
      { ...executionContext, toolCallId: "eval-2" },
    );

    expect(first.isError).toBeFalsy();
    expect(second.content).toEqual([{ type: "text", text: "42" }]);
    expect(second.details).toMatchObject({ language: "js", runtimeDir: join(sessionDir, "eval") });
    await runtime.unload("eval");
  });

  it("terminates a timed-out JavaScript worker and starts a fresh one", async () => {
    const options = createRuntimeOptions();
    options.sessionDir = join(tmpdir(), `supervisor-eval-timeout-${Date.now()}`);
    const runtime = new SessionExtensionHost(createExtensionTestContext(options));
    await runtime.initialize();
    const session = runtime.getToolExecutionSession();
    const timedOut = await runtime.executeTool(
      "eval",
      { language: "js", code: "while (true) {}", timeout: 1 },
      { toolCallId: "eval-timeout", session, reportProgress: () => {} },
    );
    const recovered = await runtime.executeTool(
      "eval",
      { language: "js", code: "6 * 7" },
      { toolCallId: "eval-recovered", session, reportProgress: () => {} },
    );

    expect(timedOut.isError).toBe(true);
    expect(recovered.content).toEqual([{ type: "text", text: "42" }]);
    await runtime.unload("eval");
  });

  it("blocks a fourth identical tool call after three identical results", async () => {
    const runtime = new SessionExtensionHost(createExtensionTestContext(createRuntimeOptions()));
    await runtime.initialize();
    const evalTool = runtime.wrapTools(runtime.collectTools()).find((tool) => tool.name === "eval");
    expect(evalTool).toBeDefined();
    const run = (id: string) =>
      evalTool!.execute(id, { language: "js", code: "21 * 2" }, new AbortController().signal);

    expect((await run("loop-1")).isError).not.toBe(true);
    expect((await run("loop-2")).isError).not.toBe(true);
    expect((await run("loop-3")).isError).not.toBe(true);
    const blocked = await run("loop-4");

    expect(blocked.isError).toBe(true);
    expect(blocked.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining("Blocked repeated tool call") }),
    ]);
  });

  it("persists todo, goal, plan, and current task in session metadata", async () => {
    const sessionDir = join(tmpdir(), `supervisor-tasks-${Date.now()}`);
    const options = createRuntimeOptions();
    options.sessionDir = sessionDir;
    const state: Record<string, unknown> = {};
    options.db.getSessionMeta = async () => state;
    options.deps.patchSessionMeta = async (patch) => Object.assign(state, patch);
    const runtime = new SessionExtensionHost(createExtensionTestContext(options));
    await runtime.initialize();
    const session = runtime.getToolExecutionSession();
    const run = (name: string, args: Record<string, unknown>, id: string) =>
      runtime.executeTool(name, args, { toolCallId: id, session, reportProgress: () => {} });

    await run("TodoList", { todos: [{ title: "inspect", status: "in_progress" }] }, "todo-1");
    await run("Goal", { action: "create", objective: "all tests pass" }, "goal-1");
    await run("EnterPlanMode", {}, "plan-1");

    const tasks = state.tasks as string[];
    expect(tasks).toHaveLength(2);
    expect(state.todos).toEqual([{ title: "inspect", status: "in_progress" }]);
    expect(state.currentTask).toBe(tasks[1]);
    expect(tasks.map((path) => readFileSync(join(sessionDir, path), "utf8"))).toEqual([
      expect.stringContaining("all tests pass"),
      expect.stringContaining("# Implementation plan"),
    ]);
    await runtime.unload("task-management");
    await runtime.unload("eval");
    rmSync(sessionDir, { recursive: true, force: true });
  });

  it("spawns child sessions through the session instance", async () => {
    const options = createRuntimeOptions();
    const runtime = new SessionExtensionHost(createExtensionTestContext(options));
    await runtime.initialize();
    const result = await runtime.executeTool(
      "spawn_agent",
      {
        agentName: "child",
        prompt: "review the change",
        finish_on_result: true,
      },
      {
        toolCallId: "spawn-1",
        session: runtime.getToolExecutionSession(),
        reportProgress: () => {},
      },
    );

    expect(result.details).toEqual({
      sessionId: 2,
      parentId: 1,
      status: "idle",
      agentId: 10,
      agentName: "child",
      result: "child result",
      truncated: false,
    });
    expect(options.finishedSessions).toEqual([2]);
  });

  it("continues an existing spawned Session through spawn_agent", async () => {
    const options = createRuntimeOptions();
    const sendToChild = vi.fn(async () => {});
    options.deps.sendToChild = sendToChild;
    const runtime = new SessionExtensionHost(createExtensionTestContext(options));
    await runtime.initialize();

    const result = await runtime.executeTool(
      "spawn_agent",
      { sessionId: 23, prompt: "check the follow-up" },
      {
        toolCallId: "spawn-resume",
        session: runtime.getToolExecutionSession(),
        reportProgress: () => {},
      },
    );

    expect(sendToChild).toHaveBeenCalledWith(23, "check the follow-up", {
      source: "spawn_agent:parent:1",
      background: undefined,
      urgency: "normal",
    });
    expect(result.details).toMatchObject({
      sessionId: 23,
      parentId: 1,
      resumed: true,
      result: "child result",
    });
  });

  it("inspects a spawned child through get_subagent_status", async () => {
    const options = createRuntimeOptions();
    const inspectChild = vi.fn(async () => ({
      sessionId: 23,
      parentId: 1,
      agentName: "child",
      status: "running",
      result: "reviewing tests",
      truncated: false,
      queuedInputCount: 1,
      lastActiveAt: 123,
    }));
    options.deps.inspectChild = inspectChild;
    const runtime = new SessionExtensionHost(createExtensionTestContext(options));
    await runtime.initialize();

    const result = await runtime.executeTool(
      "get_subagent_status",
      { sessionId: 23, maxResultChars: 1000 },
      {
        toolCallId: "inspect-subagent",
        session: runtime.getToolExecutionSession(),
        reportProgress: () => {},
      },
    );

    expect(inspectChild).toHaveBeenCalledWith(23, { maxChars: 1000 });
    expect(result.details).toMatchObject({
      sessionId: 23,
      status: "running",
      result: "reviewing tests",
      queuedInputCount: 1,
    });
  });

  it("loads extension files that listen for session.start", async () => {
    const tmp = join(tmpdir(), `ext-events-${Date.now()}`);
    mkdirSync(join(tmp, "extensions"), { recursive: true });
    const helloDir = join(tmp, "extensions", "hello");
    mkdirSync(helloDir, { recursive: true });
    const extFile = join(helloDir, "index.ts");
    writeFileSync(
      extFile,
      `import { defineExtension } from "pi-supervisor";
let hits = 0;
export default defineExtension({
  name: "hello-events",
  setup(ctx) {
    ctx.on("session.start", async () => { hits += 1; });
    ctx.session.appendEntry("hello-events", { hits });
  },
});`,
      "utf8",
    );

    const result = await loadExtensions([extFile]);
    expect(result.errors).toHaveLength(0);
    expect(result.extensions.some((ext) => ext.definition.name === "hello-events")).toBe(true);

    rmSync(tmp, { recursive: true, force: true });
  });
});
