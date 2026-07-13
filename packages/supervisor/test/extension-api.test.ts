import { describe, expect, it, vi } from "vitest";
import { defineExtension } from "../src/extension-system/define-extension.js";
import { ExtensionRuntime } from "../src/extension-system/runtime.js";
import { createEventBus } from "../src/extension-system/extension-deps.js";
import { ToolPolicy } from "../src/extension-system/tool-policy.js";
import { wrapToolWithExtensionRuntime } from "../src/extension-system/tool-adapter.js";
import type { RuntimeOptions } from "../src/extension-system/types.js";

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
      sessions: { get: async () => undefined, childrenOf: async () => [] },
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
  it("ToolPolicy blocks edit outside allowed plan file path", () => {
    const policy = ToolPolicy.readonly()
      .allowTool("edit")
      .allowResource({ kind: "file", mode: "write", pattern: "/tmp/plan.md" });

    expect(policy.check({ name: "edit", args: { file_path: "/tmp/plan.md" } }).allow).toBe(true);
    expect(policy.check({ name: "edit", args: { file_path: "/tmp/other.ts" } }).allow).toBe(false);
  });

  it("session.tools.beforeUse can block tool calls", async () => {
    const runtime = new ExtensionRuntime(createRuntimeOptions());
    runtime.services.tools.beforeUse(() => ({ allow: false, reason: "blocked by extension" }));

    const result = await runtime.checkToolBeforeCall("tc-1", "edit", { file_path: "/a.ts" });
    expect(result.block).toBe(true);
    expect(result.reason).toContain("blocked by extension");
  });

  it("inject appends boundary messages", () => {
    const runtime = new ExtensionRuntime(createRuntimeOptions());
    runtime.services.inject.schedule({ variant: "goal", content: "stay focused" });
    runtime.onTurnStarted();

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
    const runtime = new ExtensionRuntime(createRuntimeOptions({ continueTurn }));

    await runtime.loadExtension(
      defineExtension({
        name: "flow-test",
        setup(ctx) {
          void ctx.runtime.flow.continue({
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

  it("wrapToolWithExtensionRuntime returns error when blocked", async () => {
    const runtime = new ExtensionRuntime(createRuntimeOptions());
    runtime.services.tools.setPolicy(ToolPolicy.readonly());

    const tool = wrapToolWithExtensionRuntime(
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
      runtime,
    );

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
    const runtime = new ExtensionRuntime(options);
    const { submitApprovalResolution } =
      await import("../src/extension-system/extension-session-services.js");

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
});
