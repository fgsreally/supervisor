import type { AgentHarness, AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";

export interface HarnessAgentState {
  messages: AgentMessage[];
  streamingMessage?: AgentMessage;
}

export interface HarnessAgentController {
  state: HarnessAgentState;
  hasQueuedMessages?: () => boolean;
  continue?: () => Promise<void>;
}

type HarnessInternals = {
  agent?: HarnessAgentController;
  systemPrompt?: string | ((ctx: unknown) => string | Promise<string>);
  tools?: Map<string, AgentTool> | AgentTool[];
  steerQueue?: unknown[];
  followUpQueue?: unknown[];
  nextTurnQueue?: unknown[];
};

const overlayState = new WeakMap<AgentHarness, HarnessAgentState>();

function asInternals(harness: AgentHarness): HarnessInternals {
  return harness as unknown as HarnessInternals;
}

/** Read system prompt string from harness (function prompts are not snapshotted). */
export function readHarnessSystemPrompt(harness: AgentHarness): string | undefined {
  const value = asInternals(harness).systemPrompt;
  return typeof value === "string" ? value : undefined;
}

/** Read currently registered tools from harness internals. */
export function readHarnessTools(harness: AgentHarness): AgentTool[] {
  const tools = asInternals(harness).tools;
  if (!tools) return [];
  if (tools instanceof Map) return [...tools.values()];
  return Array.isArray(tools) ? [...tools] : [];
}

function overlayFor(harness: AgentHarness): HarnessAgentState {
  let state = overlayState.get(harness);
  if (!state) {
    state = { messages: [] };
    overlayState.set(harness, state);
  }
  return state;
}

/**
 * Compatibility view of harness transcript state.
 * Newer AgentHarness builds no longer expose `.agent`; keep a WeakMap overlay for
 * callers that still mutate/read messages (compaction / retry / UI resume).
 */
export function harnessAgentState(harness: AgentHarness): HarnessAgentState {
  const legacy = asInternals(harness).agent?.state;
  if (legacy) return legacy;
  return overlayFor(harness);
}

export function harnessAgentController(harness: AgentHarness): HarnessAgentController {
  const legacy = asInternals(harness).agent;
  if (legacy?.state) return legacy;

  const internals = asInternals(harness);
  return {
    state: overlayFor(harness),
    hasQueuedMessages: () =>
      (internals.steerQueue?.length ?? 0) +
        (internals.followUpQueue?.length ?? 0) +
        (internals.nextTurnQueue?.length ?? 0) >
      0,
    // New harness has no Agent.continue(); session tree is the source of truth.
    continue: undefined,
  };
}
