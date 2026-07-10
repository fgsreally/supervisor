import type { TSchema } from "typebox";
import type { ExtensionContext, ExtensionDefinition, ToolDefinition } from "./types.js";

export interface ProbedTool {
  name: string;
  description: string;
  extensionName: string;
}

export async function probeExtensionTools(definition: ExtensionDefinition): Promise<ProbedTool[]> {
  const registered: ProbedTool[] = [];
  const ctx = createProbeContext(definition.name, (tool) => {
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
  extensionName: string,
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

  const base = {
    extension: { name: extensionName },
    session: {
      id: 0,
      cwd: process.cwd(),
      dir: process.cwd(),
      messages: {
        list: noopAsync,
        get: async () => null,
        tree: async () => [],
        currentBranch: async () => [],
        search: async () => [],
        getMeta: async () => null,
        setMeta: noopAsync,
        patchMeta: noopAsync,
        setLabel: noopAsync,
        stats: async () => ({ total: 0, byRole: {} }),
        contextUsage: async () => ({ tokens: 0, limit: 0 }),
      },
      members: { byTag: async () => [], byRole: async () => [] },
      meta: { get: async () => ({}), set: noopAsync, patch: noopAsync },
      runtime: {
        isIdle: () => true,
        isStreaming: () => false,
        signal: new AbortController().signal,
        abort: noop,
        waitForIdle: noopAsync,
      },
      isMain: true,
      isChild: false,
      getDir: () => process.cwd(),
      getParent: async () => null,
      children: async () => [],
      appendEntry: noopAsync,
      sendMessage: noopAsync,
      sendUserMessage: noopAsync,
      pausing: async (_reason: string, fn: () => Promise<unknown>) => fn(),
      spawn: async () => ({ sessionId: 0 }),
      waitForResult: async () => ({ status: "idle", result: null, truncated: false }),
      finish: noopAsync,
      fork: noopAsync,
      switchTo: noopAsync,
      navigateTree: noopAsync,
      compact: noopAsync,
    },
    agent: {
      id: 0,
      name: "probe",
      providerId: 0,
      modelId: "probe",
      tools: toolRegistry,
      setModel: noopAsync,
      setThinkingLevel: noopAsync,
      getThinkingLevel: () => "off" as const,
      get model() {
        return { provider: "probe", id: "probe" };
      },
    },
    project: { cwd: process.cwd(), dir: process.cwd(), getDir: () => process.cwd() },
    runtime: {
      on: () => noop,
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      log: noop,
      events: { emit: noopAsync, on: () => noop },
    },
    tools: toolRegistry,
    ui: { broadcast: noopAsync },
    system: { db: { sqlite: null } },
    sessionId: 0,
    cwd: process.cwd(),
    sessionDir: process.cwd(),
    projectDir: process.cwd(),
    getSessionDir: () => process.cwd(),
    getProjectDir: () => process.cwd(),
    get model() {
      return { provider: "probe", id: "probe" };
    },
    isIdle: () => true,
    isStreaming: () => false,
    signal: new AbortController().signal,
    abort: noop,
    waitForIdle: noopAsync,
    registerTool: toolRegistry.register,
    on: () => noop,
    exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    log: noop,
    events: { emit: noopAsync, on: () => noop },
    broadcast: noopAsync,
    appendEntry: noopAsync,
    sendMessage: noopAsync,
    sendUserMessage: noopAsync,
    pausing: async (_reason: string, fn: () => Promise<unknown>) => fn(),
    spawn: async () => ({ sessionId: 0 }),
    waitForResult: async () => ({ status: "idle", result: null, truncated: false }),
    finish: noopAsync,
    fork: noopAsync,
    switchTo: noopAsync,
    navigateTree: noopAsync,
    compact: noopAsync,
    setModel: noopAsync,
    setThinkingLevel: noopAsync,
    getThinkingLevel: () => "off" as const,
    getMessageMeta: noopAsync,
    setMessageMeta: noopAsync,
    patchMessageMeta: noopAsync,
    setLabel: noopAsync,
    setSessionMeta: noopAsync,
    patchSessionMeta: noopAsync,
    getMemberAgentsByTag: async () => [],
    getMemberAgentsByRole: async () => [],
    listSessionTools: () => [],
    getMessages: async () => [],
    getMessageById: async () => null,
    getMessageTree: async () => [],
    getCurrentBranch: async () => [],
    searchMessages: async () => [],
    getMessageStats: async () => ({ total: 0, byRole: {} }),
    getContextUsage: async () => ({ tokens: 0, limit: 0 }),
    getSessionMeta: async () => ({}),
    getParentSession: async () => null,
    getChildSessions: async () => [],
  };

  return base as unknown as ExtensionContext;
}
