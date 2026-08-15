import { describe, expect, it, vi } from "vitest";
import { Type } from "typebox";
import { defineAgentExtension } from "../src/extension/index.js";
import {
  AgentExtensionRuntime,
  SessionExtensionHost,
  createEventBus,
} from "../src/extension/runtime/index.js";
import { createExtensionTestContext, type RuntimeOptions } from "./extension-context-fixture.js";

function options(sessionId: number): RuntimeOptions {
  return {
    sessionId,
    parentSessionId: null,
    cwd: process.cwd(),
    sessionDir: process.cwd(),
    projectDir: process.cwd(),
    agent: { id: 7, name: "shared", providerId: 1, modelId: "test-model" },
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
      appendEntry: async () => "entry",
      sendMessage: async () => {},
      sendCustomMessage: async () => "entry",
      sendUserMessage: async () => {},
      getSessionDir: async () => process.cwd(),
      getProjectDir: async () => process.cwd(),
      getMemberAgentsByTag: async () => [],
      getMemberAgentsByRole: async () => [],
      spawnSession: async () => ({
        sessionId: 9,
        parentId: sessionId,
        status: "active",
        agentId: 7,
      }),
      waitForSessionIdle: async () => {},
      getSessionResultSummary: async () => ({
        sessionId,
        status: "active",
        result: "",
        truncated: false,
      }),
      finishSession: async () => {},
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
      broadcast: () => {},
      requestApproval: async () => ({ action: "approve" }),
      eventBus: createEventBus(),
      continueTurn: async () => {},
      getContextUsage: async () => ({ tokens: null }),
      setModel: async () => {},
      setThinkingLevel: () => {},
      getThinkingLevel: () => "none",
      getModel: () => ({ provider: "test", id: "test-model", contextWindow: 128000 }),
      syncActiveTools: async () => {},
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      log: () => {},
    },
  };
}

describe("AgentExtensionRuntime", () => {
  it("runs Agent setup once and session.setup once per attached Session with a reason", async () => {
    const first = createExtensionTestContext(options(1));
    const second = createExtensionTestContext(options(2));
    const firstHost = new SessionExtensionHost(first);
    const secondHost = new SessionExtensionHost(second);
    const setup = vi.fn();
    const sessionSetup = vi.fn();
    const cleanup = vi.fn();
    const runtime = new AgentExtensionRuntime(7, first);

    await runtime.load(
      defineAgentExtension({
        name: "shared-test",
        setup(ctx) {
          setup();
          ctx.agent.on("session.setup", (session, reason) => {
            sessionSetup(session.id, reason);
            return cleanup;
          });
        },
      }),
    );

    await runtime.attach(first, "created");
    await runtime.attach(second, "restored");

    expect(setup).toHaveBeenCalledTimes(1);
    expect(sessionSetup.mock.calls).toEqual([
      [1, "created"],
      [2, "restored"],
    ]);

    await runtime.detach(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    await firstHost.clear();
    await secondHost.clear();
    await runtime.dispose();
  });

  it("keeps registrations made during session.setup scoped to that Session", async () => {
    const first = createExtensionTestContext(options(11));
    const second = createExtensionTestContext(options(12));
    const firstHost = new SessionExtensionHost(first);
    const secondHost = new SessionExtensionHost(second);
    const runtime = new AgentExtensionRuntime(7, first);

    await runtime.load(
      defineAgentExtension({
        name: "scoped-tools",
        setup(ctx) {
          ctx.agent.on("session.setup", (session) => {
            ctx.agent.registerTool({
              name: "session_identity",
              description: `Session ${session.id}`,
              parameters: Type.Object({}),
              execute: async () => ({ content: [{ type: "text", text: String(session.id) }] }),
            });
          });
        },
      }),
    );

    await runtime.attach(first, "created");
    await runtime.attach(second, "restored");
    expect(
      firstHost.getAllTools().find((tool) => tool.name === "session_identity")?.description,
    ).toBe("Session 11");
    expect(
      secondHost.getAllTools().find((tool) => tool.name === "session_identity")?.description,
    ).toBe("Session 12");

    await runtime.detach(11);
    expect(firstHost.getAllTools()).toHaveLength(0);
    expect(secondHost.getAllTools()).toHaveLength(1);
    await firstHost.clear();
    await secondHost.clear();
    await runtime.dispose();
  });
});
