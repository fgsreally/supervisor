import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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

  it("spawns child sessions through the session instance", async () => {
    const options = createRuntimeOptions();
    const runtime = new SessionExtensionHost(createExtensionTestContext(options));
    await runtime.initialize();
    const result = await runtime.executeTool(
      "spawn_agent",
      { subagent_type: "review", prompt: "review the change", finish_on_result: true },
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

  it("loads extension files that listen for session.start", async () => {
    const tmp = join(tmpdir(), `ext-events-${Date.now()}`);
    mkdirSync(join(tmp, "extensions"), { recursive: true });
    const helloDir = join(tmp, "extensions", "hello");
    mkdirSync(helloDir, { recursive: true });
    const extFile = join(helloDir, "index.ts");
    writeFileSync(
      extFile,
      `import { defineExtension } from "@earendil-works/pi-supervisor";
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
