/**
 * Context projector: ensures message sequences are wire-compliant before
 * sending to LLM providers.
 *
 * Inspired by Kimi Code's `projector.ts` (agent-core/src/agent/context/projector.ts).
 *
 * Problem
 * -------
 * During a session, message ordering can degrade in ways that strict providers
 * (Anthropic, etc.) reject:
 *   - A `tool_use` and its `tool_result` become separated by an intervening
 *     user-role message (injection, background-task notification, flushed
 *     steer).
 *   - Consecutive user-role messages (e.g. system reminder followed by a
 *     read-orchestration hint followed by real user input) waste tokens and
 *     can cause subtle ordering confusion.
 *   - After compaction or undo, a cut boundary may leave a `tool_use` with no
 *     matching result — a provider would reject the request.
 *
 * Solution
 * --------
 * Register the projector as an `AgentHarness.on("context")` hook so it runs
 * as the `transformContext` step — after `buildSessionContext()` rebuilds the
 * message list from the session tree, but before `convertToLlm()` translates
 * it into the provider wire format.
 *
 * The projector is a pure pass-through by default; it only applies repairs
 * when the history is actually malformed. A well-formed history passes through
 * with zero overhead.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";

/** Minimal content block types — the full types come from pi-ai. */
interface TextBlock {
  type: "text";
  text: string;
}
interface ImageBlock {
  type: "image";
  data: string;
  mimeType: string;
}
type ContentBlock = TextBlock | ImageBlock;
import { estimateTokens } from "@earendil-works/pi-agent-core";

// ============================================================================
// Types
// ============================================================================

export interface ProjectorOptions {
  /**
   * Merge consecutive user-role messages into one. Reduces token waste from
   * injected system reminders, read-orchestration hints, etc.
   * Default: true
   */
  mergeAdjacentUsers?: boolean;

  /**
   * Repair tool-exchange adjacency: move displaced `tool_result` messages back
   * next to their `tool_use` call, and synthesize a placeholder result for any
   * orphaned `tool_use` whose result was lost (e.g. cut off by compaction).
   * Default: true
   */
  repairToolAdjacency?: boolean;

  /**
   * When `repairToolAdjacency` is on and a `tool_use` has no matching result
   * anywhere, synthesize one. If true, even trailing open exchanges (the last
   * assistant message with unresolved calls) are closed. If false, only mid-
   * history orphans are closed; a trailing open exchange is left untouched (it
   * may still be in-flight).
   * Default: true
   */
  synthesizeMissingResults?: boolean;

  /**
   * Drop any `tool_result` whose `toolCallId` matches no `tool_use` anywhere
   * in the history. Strict providers reject stray results.
   * Default: false (avoids silent data loss in normal operation)
   */
  dropOrphanResults?: boolean;

  /**
   * Drop leading non-user messages so the first message is always a user turn.
   * Some strict providers require this.
   * Default: false
   */
  dropLeadingNonUser?: boolean;

  /**
   * Merge back-to-back assistant messages into one. Strict providers reject
   * consecutive same-role turns. Only needed as a last resort.
   * Default: false
   */
  mergeConsecutiveAssistants?: boolean;

  /**
   * Optional callback invoked for every repair the projector applies.
   * Useful for telemetry and debugging.
   */
  onAnomaly?: (anomaly: ProjectionAnomaly) => void;
}

export type ProjectionAnomaly =
  | { readonly kind: "tool_result_reordered"; readonly toolCallId: string }
  | { readonly kind: "tool_result_synthesized"; readonly toolCallId: string; readonly trailing: boolean }
  | { readonly kind: "orphan_tool_result_dropped"; readonly toolCallId: string }
  | { readonly kind: "leading_non_user_dropped"; readonly role: string }
  | { readonly kind: "consecutive_assistants_merged" }
  | { readonly kind: "whitespace_text_dropped"; readonly role: string };

export type ProjectionReport = {
  repaired: boolean;
  anomalies: readonly ProjectionAnomaly[];
};

export const DEFAULT_PROJECTOR_OPTIONS: ProjectorOptions = {
  mergeAdjacentUsers: true,
  repairToolAdjacency: true,
  synthesizeMissingResults: true,
  dropOrphanResults: false,
  dropLeadingNonUser: false,
  mergeConsecutiveAssistants: false,
};

const SYNTHETIC_TOOL_RESULT_TEXT =
  'Tool result is not available in the current context. Do not assume the tool completed successfully.';

// ============================================================================
// Projector
// ============================================================================

/**
 * Apply all configured projections to a message list.
 * The returned array is a new copy; the original is not mutated.
 */
export function projectMessages(
  messages: readonly AgentMessage[],
  options?: ProjectorOptions,
): { messages: AgentMessage[]; anomalies: ProjectionAnomaly[] } {
  const opts = { ...DEFAULT_PROJECTOR_OPTIONS, ...options };
  const anomalies: ProjectionAnomaly[] = [];
  const onAnomaly = (a: ProjectionAnomaly) => {
    anomalies.push(a);
    opts.onAnomaly?.(a);
  };

  let result = messages.slice();

  // Pass 1: merge adjacent user messages (always safe, reduces tokens).
  if (opts.mergeAdjacentUsers) {
    result = mergeAdjacentUsers(result, onAnomaly);
  }

  // Pass 2: repair tool-exchange adjacency (moves displaced results back,
  // synthesizes missing ones).
  if (opts.repairToolAdjacency) {
    result = repairToolExchangeAdjacency(result, {
      synthesizeMissing: opts.synthesizeMissingResults ?? true,
      onAnomaly,
    });
  }

  // Pass 3: strict-provider-only repairs (last resort).
  if (opts.mergeConsecutiveAssistants) {
    result = mergeConsecutiveAssistants(result, onAnomaly);
  }
  if (opts.dropOrphanResults) {
    result = dropOrphanResults(result, onAnomaly);
  }
  if (opts.dropLeadingNonUser) {
    result = dropLeadingNonUser(result, onAnomaly);
  }

  return { messages: result, anomalies };
}

// ============================================================================
// Pass 1: Merge adjacent user messages
// ============================================================================

/** Two user-role messages can be merged into one. */
function isMergableUser(msg: AgentMessage): boolean {
  return msg.role === "user" || msg.role === "bashExecution" || msg.role === "custom" ||
    msg.role === "compactionSummary" || msg.role === "branchSummary";
}

function mergeAdjacentUsers(
  messages: readonly AgentMessage[],
  onAnomaly: (a: ProjectionAnomaly) => void,
): AgentMessage[] {
  const out: AgentMessage[] = [];

  for (const msg of messages) {
    const prev = out[out.length - 1];
    if (prev !== undefined && isMergableUser(prev) && isMergableUser(msg)) {
      // Merge content: extract text from both, join with newline.
      const prevText = extractText(prev);
      const curText = extractText(msg);
      const merged = `${prevText}\n\n${curText}`;
      out[out.length - 1] = {
        ...prev,
        content: merged,
      } as AgentMessage;
      // Whitespace marker not needed; this is a routine merge.
      continue;
    }
    out.push(msg);
  }

  return out;
}

// ============================================================================
// Pass 2: Repair tool-exchange adjacency
// ============================================================================

interface ToolRepairOptions {
  synthesizeMissing: boolean;
  onAnomaly: (anomaly: ProjectionAnomaly) => void;
}

function repairToolExchangeAdjacency(
  messages: readonly AgentMessage[],
  options: ToolRepairOptions,
): AgentMessage[] {
  // Find the last non-tool message boundary: everything after it is the
  // trailing exchange (which may still be in-flight).
  let lastNonToolIdx = messages.length - 1;
  while (lastNonToolIdx >= 0 && messages[lastNonToolIdx]?.role === "toolResult") {
    lastNonToolIdx -= 1;
  }

  const consumed = new Set<number>();
  const out: AgentMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    if (consumed.has(i)) continue;
    const msg = messages[i];
    if (!msg) continue;

    // Only assistant messages with tool calls trigger adjacency repair.
    if (msg.role !== "assistant") {
      out.push(msg);
      continue;
    }

    const assistantMsg = msg as { role: "assistant"; content: string | ContentBlock[]; toolCalls?: { id: string; name: string; arguments: Record<string, unknown> }[] };
    const toolCalls = assistantMsg.toolCalls ?? [];

    out.push(msg);

    if (toolCalls.length === 0) continue;

    // Collect `toolCallId`s from this assistant message.
    const pending = new Set(toolCalls.map((tc) => tc.id));
    let foreignBetween = false;

    // Scan forward for matching tool results.
    for (let j = i + 1; j < messages.length && pending.size > 0; j++) {
      if (consumed.has(j)) continue;
      const next = messages[j];
      if (!next) continue;

      // Check if this is a tool result matching one of our pending calls.
      const nextAny = next as unknown as Record<string, unknown>;
      const toolCallId = typeof nextAny.toolCallId === "string" ? nextAny.toolCallId : undefined;

      if (next.role === "toolResult" && toolCallId !== undefined && pending.has(toolCallId)) {
        out.push(next);
        consumed.add(j);
        pending.delete(toolCallId);
        if (foreignBetween) {
          options.onAnomaly({ kind: "tool_result_reordered", toolCallId });
        }
      } else {
        foreignBetween = true;
      }
    }

    // Close any remaining pending calls.
    if (pending.size > 0 && (options.synthesizeMissing || i < lastNonToolIdx)) {
      for (const missingId of pending) {
        out.push(makeSyntheticToolResult(missingId));
        options.onAnomaly({
          kind: "tool_result_synthesized",
          toolCallId: missingId,
          trailing: i >= lastNonToolIdx,
        });
      }
    }
  }

  return out;
}

// ============================================================================
// Pass 3: Strict-provider-only repairs
// ============================================================================

function dropOrphanResults(
  messages: readonly AgentMessage[],
  onAnomaly: (a: ProjectionAnomaly) => void,
): AgentMessage[] {
  const toolUseIds = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const assistantMsg = msg as { toolCalls?: { id: string }[] };
    for (const tc of assistantMsg.toolCalls ?? []) {
      toolUseIds.add(tc.id);
    }
  }

  return messages.filter((msg) => {
    if (msg.role !== "toolResult") return true;
    const anyMsg = msg as unknown as Record<string, unknown>;
    const toolCallId = anyMsg.toolCallId as string | undefined;
    if (toolCallId === undefined || toolUseIds.has(toolCallId)) return true;
    onAnomaly({ kind: "orphan_tool_result_dropped", toolCallId });
    return false;
  });
}

function mergeConsecutiveAssistants(
  messages: readonly AgentMessage[],
  onAnomaly: (a: ProjectionAnomaly) => void,
): AgentMessage[] {
  const out: AgentMessage[] = [];
  for (const msg of messages) {
    const prev = out[out.length - 1];
    if (prev && prev.role === "assistant" && msg.role === "assistant") {
      // Merge content and toolCalls.
      const merged = {
        ...msg,
        content: mergeContent(prev, msg),
        toolCalls: [...(prev as unknown as { toolCalls?: Array<Record<string, unknown>> }).toolCalls ?? [],
                     ...(msg as unknown as { toolCalls?: Array<Record<string, unknown>> }).toolCalls ?? []],
      } as unknown as AgentMessage;
      out[out.length - 1] = merged;
      onAnomaly({ kind: "consecutive_assistants_merged" });
      continue;
    }
    out.push(msg);
  }
  return out;
}

function dropLeadingNonUser(
  messages: readonly AgentMessage[],
  onAnomaly: (a: ProjectionAnomaly) => void,
): AgentMessage[] {
  let start = 0;
  while (start < messages.length) {
    const msg = messages[start];
    if (!msg) { start++; continue; }
    if (
      msg.role === "user" || msg.role === "bashExecution" ||
      msg.role === "compactionSummary" || msg.role === "branchSummary"
    ) break;
    onAnomaly({ kind: "leading_non_user_dropped", role: msg.role });
    start++;
  }
  return start === 0 ? messages.slice() : messages.slice(start);
}

// ============================================================================
// Helpers
// ============================================================================

function extractText(msg: AgentMessage): string {
  const anyMsg = msg as unknown as { content: string | ContentBlock[] };
  const content = anyMsg.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

function mergeContent(a: AgentMessage, b: AgentMessage): string | ContentBlock[] {
  const aAny = a as unknown as { content: string | ContentBlock[] };
  const bAny = b as unknown as { content: string | ContentBlock[] };
  const aText = typeof aAny.content === "string" ? aAny.content : extractText(a);
  const bText = typeof bAny.content === "string" ? bAny.content : extractText(b);
  return `${aText}\n\n${bText}`;
}

function makeSyntheticToolResult(toolCallId: string): AgentMessage {
  return {
    role: "toolResult",
    content: SYNTHETIC_TOOL_RESULT_TEXT,
    toolCallId,
    toolName: "unknown",
    isError: true,
    timestamp: Date.now(),
  } as unknown as AgentMessage;
}
