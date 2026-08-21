import { describe, expect, it } from "vitest";
import {
  ensureAnthropicCacheBreakpoints,
  isAnthropicMessagesPayload,
} from "../src/utils/anthropic-prompt-cache.js";

describe("anthropic prompt cache breakpoints", () => {
  it("detects anthropic messages payloads", () => {
    expect(
      isAnthropicMessagesPayload({
        model: "MiniMax-M2.7",
        system: [{ type: "text", text: "hi" }],
        messages: [{ role: "user", content: [{ type: "text", text: "x" }] }],
      }),
    ).toBe(true);
    expect(
      isAnthropicMessagesPayload({
        model: "gpt",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).toBe(false);
  });

  it("places up to 4 breakpoints spaced under the lookback window", () => {
    const content = Array.from({ length: 50 }, (_, index) => ({
      type: "text",
      text: `block-${index}`,
    }));
    const payload = {
      model: "MiniMax-M2.7",
      system: [{ type: "text", text: "system", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    };

    ensureAnthropicCacheBreakpoints(payload);

    const marked = content
      .map((block, index) => ("cache_control" in block ? index : -1))
      .filter((index) => index >= 0);

    expect(marked).toEqual([1, 17, 33, 49]);
    expect(marked).toHaveLength(4);
    for (let i = 1; i < marked.length; i++) {
      expect(marked[i]! - marked[i - 1]!).toBeLessThanOrEqual(16);
    }
  });

  it("always marks the last block even for short histories", () => {
    const content = [
      { type: "text", text: "a" },
      { type: "tool_result", tool_use_id: "1", content: "ok" },
    ];
    const payload = {
      model: "MiniMax-M2.7",
      system: [{ type: "text", text: "system" }],
      messages: [{ role: "user", content }],
    };

    ensureAnthropicCacheBreakpoints(payload);

    expect(content[0]).not.toHaveProperty("cache_control");
    expect(content[1]).toMatchObject({ cache_control: { type: "ephemeral" } });
  });

  it("leaves openai-completions payloads unchanged", () => {
    const payload = {
      model: "gpt",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
    };
    expect(ensureAnthropicCacheBreakpoints(payload)).toBe(payload);
  });
});
