import { describe, expect, it, vi } from "vitest";
import { ContextDb } from "../src/extension/runtime/index.js";
import { defineExtension, Type } from "../src/extension/index.js";
import { timerExtension } from "../src/extension/index.js";
import {
  createEventBus,
  SessionExtensionHost,
  ToolPolicy,
} from "../src/extension/runtime/index.js";
import { createExtensionTestContext, type RuntimeOptions } from "./extension-context-fixture.js";

function createRuntimeOptions(overrides?: { continueTurn?: ReturnType<typeof vi.fn> }) {
  const eventBus = createEventBus();
  return {
    sessionId: 1,
    parentSessionId: null,
    cwd: process.cwd(),
    sessionDir: process.cwd(),
    projectDir: process.cwd(),
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
      continueTurn: overrides?.continueTurn ?? vi.fn(async () => {}),
      setActiveTools: vi.fn(async () => {}),
      getContextUsage: async () => ({ tokens: 42 }),
      getSessionDir: async () => process.cwd(),
      getProjectDir: async () => process.cwd(),
      getMemberAgentsByTag: async () => [],
      getMemberAgentsByRole: async () => [],
      spawnSession: async () => ({
        sessionId: 2,
        parentId: null,
        status: "idle",
        agentId: null,
      }),
      waitForSessionIdle: async () => {},
      getSessionResultSummary: async (sessionId: number) => ({
        sessionId,
        status: "idle",
        result: "",
        truncated: false,
      }),
      finishSession: async () => {},
      pausing: async (_reason: string, work: Promise<unknown> | (() => Promise<unknown>)) =>
        typeof work === "function" ? work() : work,
      setSessionMeta: async () => {},
      patchSessionMeta: async (patch: Record<string, unknown>) => patch,
      setMessageMeta: async () => {},
      patchMessageMeta: async (_id: string, patch: Record<string, unknown>) => patch,
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
    },
  } as RuntimeOptions;
}

describe("extension api", () => {
  it("persists and fires Session timers through session meta", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T04:00:00.000Z"));
    try {
      let meta: Record<string, unknown> = {};
      const options = createRuntimeOptions();
      const sendUserMessage = vi.fn(async () => {});
      options.db.getSessionMeta = async () => meta;
      options.deps.patchSessionMeta = async (patch) => {
        meta = { ...meta, ...patch };
        return meta;
      };
      options.deps.sendUserMessage = sendUserMessage;
      const runtime = new SessionExtensionHost(createExtensionTestContext(options));
      await runtime.load(timerExtension, "builtin:timer");
      const context = {
        toolCallId: "timer-call",
        session: { id: "1", cwd: process.cwd() },
        reportProgress: () => {},
      };

      const created = await runtime.executeTool(
        "TimerCreate",
        { intent: "check deploy later", prompt: "check deploy", delaySeconds: 5 },
        context,
      );
      const timer = created.details as { id: string };
      expect(meta.timers).toMatchObject([{ id: timer.id, prompt: "check deploy" }]);

      await vi.advanceTimersByTimeAsync(5_000);
      expect(meta.timers).toEqual([]);
      expect(sendUserMessage).toHaveBeenCalledWith(expect.stringContaining('<timer-fire id="'), {
        source: "timer",
        origin: "check deploy",
      });
      await runtime.clear();
    } finally {
      vi.useRealTimers();
    }
  });

  it("registers and executes extension slash commands", async () => {
    const handler = vi.fn(async (_args: string) => {});
    const runtime = new SessionExtensionHost(createExtensionTestContext(createRuntimeOptions()));
    await runtime.load(
      defineExtension({
        name: "command-test",
        setup(ctx) {
          ctx.agent.registerCommand("hello", { description: "Say hello", handler });
        },
      }),
      "/tmp/command-test.ts",
    );

    expect(runtime.getAllCommands()).toMatchObject([
      { name: "hello", description: "Say hello", extensionName: "command-test" },
    ]);
    await runtime.executeCommand("hello", "world");
    expect(handler).toHaveBeenCalledWith("world", {
      sessionId: 1,
      cwd: process.cwd(),
    });
  });

  it("ctx.db exposes raw parameterized SQL", () => {
    const statement = {
      all: vi.fn(() => [{ id: 1 }]),
      get: vi.fn(() => ({ id: 1 })),
      run: vi.fn(() => ({ changes: 1 })),
    };
    const prepare = vi.fn(() => statement);
    const db = new ContextDb({ prepare });

    expect(db.query<{ id: number }>("SELECT id FROM sessions WHERE id = ?", [1])).toEqual([
      { id: 1 },
    ]);
    expect(db.queryOne<{ id: number }>("SELECT id FROM agents WHERE id = ?", [1])).toEqual({
      id: 1,
    });
    expect(db.execute("UPDATE sessions SET status = ? WHERE id = ?", ["idle", 1])).toEqual({
      changes: 1,
    });
    expect(prepare).toHaveBeenCalledTimes(3);
  });

  it("ToolPolicy blocks edit outside allowed plan file path", () => {
    const policy = ToolPolicy.readonly()
      .allowTool("edit")
      .allowResource({ kind: "file", mode: "write", pattern: "/tmp/plan.md" });

    expect(policy.check({ name: "edit", args: { file_path: "/tmp/plan.md" } }).allow).toBe(true);
    expect(policy.check({ name: "edit", args: { file_path: "/tmp/other.ts" } }).allow).toBe(false);
  });

  it("session.tools.beforeUse can block tool calls", async () => {
    const runtime = new SessionExtensionHost(createExtensionTestContext(createRuntimeOptions()));
    runtime.services.tools.beforeUse(() => ({ allow: false, reason: "blocked by extension" }));

    const result = await runtime.checkToolBeforeCall("tc-1", "edit", { file_path: "/a.ts" });
    expect(result.block).toBe(true);
    expect(result.reason).toContain("blocked by extension");
  });

  it("inject appends boundary messages", () => {
    const runtime = new SessionExtensionHost(createExtensionTestContext(createRuntimeOptions()));
    runtime.services.inject.schedule({ variant: "goal", content: "stay focused" });
    const out = runtime.applyTurnInjections([
      { role: "user", content: [{ type: "text", text: "hi" }], timestamp: Date.now() },
    ]);
    expect(out).toHaveLength(2);
    const injected = out[1]?.content;
    const injectedText = Array.isArray(injected)
      ? injected.map((part) => ("text" in part ? part.text : "")).join("")
      : String(injected);
    expect(injectedText).toContain('<system-injection variant="goal">');
  });

  it("flow.continue queues a continuation turn", async () => {
    const continueTurn = vi.fn(async () => {});
    const runtime = new SessionExtensionHost(
      createExtensionTestContext(createRuntimeOptions({ continueTurn })),
    );

    await runtime.load(
      defineExtension({
        name: "flow-test",
        setup(ctx) {
          void ctx.flow.continue({
            prompt: "keep going",
            origin: "goal_continuation",
            dedupeKey: "goal:1",
          });
        },
      }),
      "/tmp/flow-test.ts",
    );

    expect(continueTurn).toHaveBeenCalledWith("keep going", {
      source: "extension:flow:goal_continuation",
    });
  });

  it("SessionExtensionHost.wrapTools returns error when blocked", async () => {
    const runtime = new SessionExtensionHost(createExtensionTestContext(createRuntimeOptions()));
    runtime.services.tools.setPolicy(ToolPolicy.readonly());

    const [tool] = runtime.wrapTools([
      {
        name: "edit",
        label: "edit",
        description: "edit",
        parameters: { type: "object" },
        async execute() {
          return {
            content: [{ type: "text", text: "should not run" }],
            details: {},
          };
        },
      },
    ]);

    const result = await tool.execute("tc-1", { file_path: "/a.ts" });
    expect((result as { isError?: boolean }).isError).toBe(true);
    const textBlock = result.content.find((block) => block.type === "text");
    expect(textBlock && "text" in textBlock ? textBlock.text : "").toContain("readonly");
  });

  it("ui.requestApproval resolves via submitApprovalResolution", async () => {
    let approvalId = "";
    const options = createRuntimeOptions();
    options.deps.broadcast = ((event: { type?: string; approvalId?: string }) => {
      if (event.type === "approval.pending" && event.approvalId) {
        approvalId = event.approvalId;
      }
    }) as RuntimeOptions["deps"]["broadcast"];
    const runtime = new SessionExtensionHost(createExtensionTestContext(options));
    const { submitApprovalResolution } = await import("../src/extension/runtime/index.js");

    const promise = runtime.services.uiApproval.requestApproval({
      kind: "plan_review",
      title: "Plan",
      body: "Do X",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(approvalId).toBeTruthy();
    submitApprovalResolution(1, approvalId, { action: "approve" });
    await expect(promise).resolves.toEqual({ action: "approve" });
  });

  it("每个 Agent 的扩展工具注册表彼此隔离", async () => {
    const first = new SessionExtensionHost(createExtensionTestContext(createRuntimeOptions()));
    const second = new SessionExtensionHost(
      createExtensionTestContext({ ...createRuntimeOptions(), sessionId: 2 }),
    );

    await first.load(
      defineExtension({
        name: "isolated-extension",
        setup(ctx) {
          ctx.agent.registerTool({
            name: "isolated_tool",
            description: "只属于第一个 Agent",
            parameters: Type.Object({}),
            async execute() {
              return { content: [{ type: "text", text: "ok" }] };
            },
          });
        },
      }),
      "/tmp/isolated-extension.ts",
    );

    expect(first.getTool("isolated_tool")).toBeDefined();
    expect(second.getTool("isolated_tool")).toBeUndefined();
  });

  it("clear 统一执行 cleanup 并清空扩展工具", async () => {
    const extension = new SessionExtensionHost(createExtensionTestContext(createRuntimeOptions()));
    const cleanup = vi.fn();

    await extension.load(
      defineExtension({
        name: "cleanup-extension",
        setup(ctx) {
          ctx.agent.registerTool({
            name: "cleanup_tool",
            description: "用于验证清理",
            parameters: Type.Object({}),
            async execute() {
              return { content: [{ type: "text", text: "ok" }] };
            },
          });
          return cleanup;
        },
      }),
      "/tmp/cleanup-extension.ts",
    );

    await extension.clear();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(extension.getTool("cleanup_tool")).toBeUndefined();
  });

  it("unload 只清理当前 Session 中指定扩展的资源", async () => {
    const extension = new SessionExtensionHost(createExtensionTestContext(createRuntimeOptions()));
    const cleanup = vi.fn(async () => {});

    await extension.load(
      defineExtension({
        name: "removable-extension",
        setup(ctx) {
          ctx.agent.registerTool({
            name: "removable_tool",
            description: "removed with its extension",
            parameters: Type.Object({}),
            async execute() {
              return { content: [{ type: "text", text: "ok" }] };
            },
          });
          return cleanup;
        },
      }),
      "/tmp/removable-extension.ts",
    );

    await expect(extension.unload("removable-extension")).resolves.toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(extension.getTool("removable_tool")).toBeUndefined();
  });
});
