/**
 * MiniMax / Anthropic prompt-cache breakpoints for long tool-use conversations.
 *
 * Both APIs only look back ~20 content blocks from each `cache_control` marker.
 * pi-ai places a single breakpoint on the last user/tool_result block, so once a
 * multi-turn agent history exceeds ~20 blocks the growing prefix no longer hits
 * and cacheRead collapses to tools+system only.
 *
 * Place up to 4 ephemeral breakpoints spaced under the lookback window so each
 * segment of history can still be matched. Breakpoints are cumulative: a hit on
 * a later marker still covers tools + system + earlier messages.
 *
 * @see https://platform.minimax.io/docs/api-reference/anthropic-api-compatible-cache
 */

const CACHE_CONTROL = { type: "ephemeral" } as const;
/** Stay under the documented ~20-block lookback window. */
const LOOKBACK_BLOCKS = 16;
/** Anthropic / MiniMax allow at most 4 active cache_control markers per request. */
const MAX_BREAKPOINTS = 4;

const CACHEABLE_BLOCK_TYPES = new Set([
  "text",
  "image",
  "tool_use",
  "tool_result",
  "thinking",
  "redacted_thinking",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** True when the outbound body looks like an Anthropic Messages request. */
export function isAnthropicMessagesPayload(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  if (!Array.isArray(payload.messages)) return false;
  // openai-completions uses string system or role:"system" messages; anthropic uses system blocks / tools.input_schema
  if (Array.isArray(payload.system)) return true;
  if (Array.isArray(payload.tools)) {
    const first = payload.tools[0];
    if (isRecord(first) && isRecord(first.input_schema)) return true;
  }
  return false;
}

/**
 * Rewrite `cache_control` on Anthropic Messages payloads so long histories keep
 * hitting the prompt cache. No-op for non-Anthropic shapes.
 */
export function ensureAnthropicCacheBreakpoints(payload: unknown): unknown {
  if (!isAnthropicMessagesPayload(payload)) return payload;
  const body = payload as Record<string, unknown>;
  const messages = body.messages as Array<Record<string, unknown>>;

  const located: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    const content = message.content;
    if (!Array.isArray(content)) continue;
    for (const raw of content) {
      if (!isRecord(raw)) continue;
      if ("cache_control" in raw) delete raw.cache_control;
      if (typeof raw.type === "string" && CACHEABLE_BLOCK_TYPES.has(raw.type)) {
        located.push(raw);
      }
    }
  }

  if (located.length === 0) return payload;

  const markAt = new Set<number>();
  markAt.add(located.length - 1);
  for (
    let index = located.length - 1 - LOOKBACK_BLOCKS;
    index >= 0 && markAt.size < MAX_BREAKPOINTS;
    index -= LOOKBACK_BLOCKS
  ) {
    markAt.add(index);
  }

  for (const index of markAt) {
    located[index]!.cache_control = { ...CACHE_CONTROL };
  }

  return payload;
}

type PayloadHookHarness = {
  on(
    type: "before_provider_payload",
    handler: (event: {
      type: "before_provider_payload";
      payload: unknown;
    }) => { payload: unknown } | Promise<{ payload: unknown }>,
  ): () => void;
};

/** Register the breakpoint rewriter on an AgentHarness. Returns unsubscribe. */
export function attachAnthropicCacheBreakpoints(harness: PayloadHookHarness): () => void {
  return harness.on("before_provider_payload", (event) => ({
    payload: ensureAnthropicCacheBreakpoints(event.payload),
  }));
}
