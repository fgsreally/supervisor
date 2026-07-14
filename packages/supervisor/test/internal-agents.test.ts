import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertAgentUserSpawnable,
  ensurePackagedAgents,
  findPackagedAgentId,
  isAgentUserSpawnable,
  isBuiltinAgent,
  loadPackagedAgentPrompt,
} from "../src/agent/internal-agents.js";
import { SupervisorDb } from "../src/db.js";
import { Extension } from "../src/extension-system/extension.js";
import { createEventBus } from "../src/extension-system/extension-deps.js";
import type { RuntimeOptions } from "../src/extension-system/types.js";
import { createExtensionTestContext } from "./extension-context-fixture.js";

let db: SupervisorDb;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `internal-agents-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new SupervisorDb(join(tmpDir, "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function createShadowRuntimeOptions(): RuntimeOptions {
  const eventBus = createEventBus();
  return {
    sessionId: 2,
    parentSessionId: 1,
    sessionMeta: { shadowOf: 1 },
    cwd: process.cwd(),
    sessionDir: process.cwd(),
    projectDir: process.cwd(),
    agent: { id: 1, name: "shadow", providerId: 1, modelId: "test-model" },
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
      sendParentMsg: async () => {},
      continueTurn: async () => {},
      setActiveTools: async () => {},
      getContextUsage: async () => ({ tokens: 42 }),
      getSessionDir: async () => process.cwd(),
      getProjectDir: async () => process.cwd(),
      getMemberAgentsByTag: async () => [],
      getMemberAgentsByRole: async () => [],
      spawnSession: async () => ({
        sessionId: 3,
        parentId: 1,
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
        id: 3,
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

describe("packaged agents", () => {
  it("loads packaged prompt.md files", () => {
    expect(loadPackagedAgentPrompt("shadow")).toContain("JSON");
    expect(loadPackagedAgentPrompt("intro")).toContain("Intro");
  });

  it("marks shadow internal and intro user-spawnable", () => {
    const providerId = db.insertProvider({
      slug: "test-provider",
      name: "Test Provider",
      api_type: "anthropic-messages",
    });
    db.insertModel({ provider_id: providerId, model_id: "claude-sonnet-4-6", name: "Sonnet" });
    ensurePackagedAgents(db);
    const shadowId = findPackagedAgentId(db, "shadow");
    const introId = findPackagedAgentId(db, "intro");
    expect(shadowId).toBeDefined();
    expect(introId).toBeDefined();

    const shadow = db.getAgent(shadowId!);
    const intro = db.getAgent(introId!);
    expect(shadow?.isInternal).toBe(true);
    expect(intro?.isInternal).toBe(false);
    expect(shadow?.meta).toEqual({ builtin: true, userSpawnable: false });
    expect(intro?.meta).toEqual({ builtin: true, userSpawnable: true });
    expect(intro?.toolsPreset).toBe("coding");
    expect(isBuiltinAgent(shadow)).toBe(true);
    expect(isBuiltinAgent(intro)).toBe(true);
    expect(isAgentUserSpawnable(shadow)).toBe(false);
    expect(isAgentUserSpawnable(intro)).toBe(true);
    expect(() => assertAgentUserSpawnable(shadow, shadowId)).toThrow(/internal/i);
    expect(() => assertAgentUserSpawnable(intro, introId)).not.toThrow();
  });

  it("shadow-child extension bans edit and write tools", async () => {
    const runtime = new Extension(createExtensionTestContext(createShadowRuntimeOptions()));
    await runtime.initialize();
    const edit = await runtime.checkToolBeforeCall("tc-1", "edit", { file_path: "a.ts" });
    const write = await runtime.checkToolBeforeCall("tc-2", "write", { file_path: "a.ts" });
    const read = await runtime.checkToolBeforeCall("tc-3", "read", { file_path: "a.ts" });
    expect(edit.block).toBe(true);
    expect(write.block).toBe(true);
    expect(read.block).toBe(false);
  });
});
