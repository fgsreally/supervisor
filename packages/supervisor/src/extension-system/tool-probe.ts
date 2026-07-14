import type { TSchema } from "typebox";
import { ContextAgent, ContextDb, ContextSession } from "../core/context.js";
import type { ExtensionContext, ExtensionDefinition, ToolDefinition } from "./types.js";
import { ToolPolicy } from "./tool-policy.js";

export interface ProbedTool {
  name: string;
  description: string;
  extensionName: string;
}

export async function probeExtensionTools(definition: ExtensionDefinition): Promise<ProbedTool[]> {
  const registered: ProbedTool[] = [];
  const ctx = createProbeContext((tool) => {
    registered.push({
      name: tool.name,
      description: tool.description,
      extensionName: definition.name,
    });
  });

  try {
    await definition.setup(ctx);
  } catch {
    // Return whatever was registered before setup failed.
  }

  return registered;
}

function createProbeContext(
  onRegister: (tool: ToolDefinition<TSchema, unknown>) => void,
): ExtensionContext {
  const noop = () => undefined;
  const noopAsync = async () => undefined;
  const toolRegistry = {
    register: <TParams extends TSchema, TResult>(definition: ToolDefinition<TParams, TResult>) => {
      onRegister(definition as ToolDefinition<TSchema, unknown>);
    },
    list: () => [],
    get: () => undefined,
  };

  return {
    db: new ContextDb(undefined),
    session: new ContextSession({
      id: 0,
      cwd: process.cwd(),
      dir: process.cwd(),
      isMain: true,
      isChild: false,
      getDir: async () => process.cwd(),
      isIdle: () => true,
      isStreaming: () => false,
      getSignal: () => undefined,
      abort: noop,
      waitForIdle: noopAsync,
      messages: {
        list: async () => [],
        get: async () => undefined,
        tree: async () => [],
        currentBranch: async () => [],
        search: async () => [],
        getMeta: async () => ({}),
        setMeta: noopAsync,
        patchMeta: async () => ({}),
        setLabel: noopAsync,
        stats: async () => ({ total: 0, user: 0, assistant: 0, tool: 0, custom: 0 }),
        contextUsage: async () => ({ tokens: null, contextWindow: 0, percent: null }),
      },
      meta: { get: async () => ({}), set: noopAsync, patch: async () => ({}) },
      getParent: async () => undefined,
      children: async () => [],
      appendEntry: async () => "",
      sendMessage: noopAsync,
      sendUserMessage: noopAsync,
      sendParentMsg: noopAsync,
      pausing: async <T>(_reason: string, work: Promise<T> | (() => Promise<T>)) =>
        typeof work === "function" ? work() : work,
      spawn: async () => ({
        sessionId: 0,
        parentId: null,
        status: "idle",
        agentId: null,
      }),
      waitForResult: async () => ({
        sessionId: 0,
        status: "idle",
        result: "",
        truncated: false,
      }),
      finish: noopAsync,
      fork: async () => ({
        id: 0,
        cwd: process.cwd(),
        messageCount: 0,
        createdAt: 0,
        lastActiveAt: 0,
      }),
      switchTo: noopAsync,
      navigateTree: noopAsync,
      compact: async () => ({ summary: "", firstKeptEntryId: "", tokensBefore: 0 }),
      tools: {
        setPolicy: noop,
        getPolicy: () => ToolPolicy.coding(),
        beforeUse: () => noop,
        afterUse: () => noop,
        enable: noop,
        disable: noop,
        setActive: noopAsync,
        getActive: () => null,
      },
    }),
    agent: new ContextAgent({
      id: 0,
      name: "probe",
      providerId: 0,
      modelId: "probe",
      getModel: () => ({ provider: "probe", id: "probe", contextWindow: 0 }),
      registerTool: toolRegistry.register,
      unregisterTool: noop,
      listTools: toolRegistry.list,
      getTool: toolRegistry.get,
      findByTag: async () => [],
      findByRole: async () => [],
      setModel: noopAsync,
      setThinkingLevel: noop,
      getThinkingLevel: () => "none" as const,
    }),
    project: {
      cwd: process.cwd(),
      dir: process.cwd(),
      getDir: async () => process.cwd(),
    },
    ui: {
      broadcast: noop,
      requestApproval: async () => ({ action: "approve" as const }),
    },
    on: () => noop,
    log: noop,
    exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false, duration: 0 }),
    events: { emit: noop, on: () => noop, off: noop },
    flow: {
      continue: async () => ({ queued: false }),
      pause: noopAsync,
      resume: noopAsync,
      acquireLock: async () => null,
      usage: async () => ({
        turns: 0,
        tokens: 0,
        wallClockMs: 0,
        contextTokens: null,
      }),
      startScope: noop,
      endScope: noop,
    },
    inject: { schedule: noop, clear: noop, reattach: noop },
  };
}
