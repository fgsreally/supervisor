/**
 * Micro-compaction: zero-LLM-cost context recovery.
 *
 * Inspired by Kimi Code's `MicroCompaction` (agent-core/src/agent/compaction/micro.ts).
 *
 * Detects when the model context has been idle long enough that the provider
 * cache is cold anyway, and opportunistically truncates large early tool
 * results to a short marker — freeing tens of thousands of tokens without
 * any model call.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { estimateTokens } from "@earendil-works/pi-agent-core";
import {
  type MicroCompactionConfig,
  DEFAULT_MICRO_COMPACTION_CONFIG,
} from "./config.js";

export { type MicroCompactionConfig, DEFAULT_MICRO_COMPACTION_CONFIG };

export type TruncationReport = {
  /** How many tool results were truncated. */
  truncatedCount: number;
  /** Estimated total tokens before truncation across affected messages. */
  tokensBefore: number;
  /** Estimated total tokens after truncation. */
  tokensAfter: number;
  /** Whether the cutoff point actually changed since the last pass. */
  changed: boolean;
};

function estimateTokensForContent(content: string | readonly { type: string; text?: string }[]): number {
  let chars = 0;
  if (typeof content === "string") {
    chars = content.length;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text" && block.text) chars += block.text.length;
      if (block.type === "image") chars += 4800;
    }
  }
  return Math.ceil(chars / 4);
}

/**
 * MicroCompaction truncates large tool-result messages below a cutoff index
 * by replacing their content with a short marker string. No LLM call needed.
 *
 * The cutoff advances monotonically (reset on context clear / undo) and is
 * applied at projection time via `compact()`.
 */
export class MicroCompaction {
  private cutoff = 0;
  readonly config: MicroCompactionConfig;
  /** Last assistant timestamp seen at `detect()` time — avoids re-entering. */
  private lastObservedAssistantAt: number | null = null;

  constructor(config?: Partial<MicroCompactionConfig>) {
    this.config = { ...DEFAULT_MICRO_COMPACTION_CONFIG, ...config };
  }

  /** Reset cutoff so nothing is truncated. Optionally cap it at maxCutoff. */
  reset(maxCutoff = 0): void {
    this.cutoff = Math.min(this.cutoff, maxCutoff);
    this.lastObservedAssistantAt = null;
  }

  /** Persist a cutoff (only called by `detect()` or restore). */
  apply(cutoff: number): void {
    this.cutoff = cutoff;
  }

  /**
   * Evaluate whether micro-compaction should kick in.
   *
   * Conditions (all must hold):
   *  1. Feature flag / config enabled.
   *  2. Provider cache is cold (`lastAssistantAt` is older than threshold).
   *  3. Context usage ratio >= `minContextUsageRatio`.
   *  4. History is long enough that truncation would actually do something.
   *
   * Returns a report of what (if anything) was done.
   */
  detect(
    history: readonly AgentMessage[],
    lastAssistantAt: number | null,
    tokenCount: number,
    maxContextTokens: number,
  ): TruncationReport {
    if (!this.config.enabled) {
      return { truncatedCount: 0, tokensBefore: 0, tokensAfter: 0, changed: false };
    }

    // Cache-miss guard: only run when the provider cache would be cold anyway.
    const cacheAgeMs = lastAssistantAt === null ? null : Date.now() - lastAssistantAt;
    if (cacheAgeMs === null || cacheAgeMs < this.config.cacheMissedThresholdMs) {
      return { truncatedCount: 0, tokensBefore: 0, tokensAfter: 0, changed: false };
    }

    // Context usage ratio guard.
    if (maxContextTokens > 0) {
      const usageRatio = tokenCount / maxContextTokens;
      if (usageRatio < this.config.minContextUsageRatio) {
        return { truncatedCount: 0, tokensBefore: 0, tokensAfter: 0, changed: false };
      }
    }

    // Avoid re-entering if the assistant timestamp hasn't moved.
    if (this.lastObservedAssistantAt !== null && lastAssistantAt !== null) {
      if (lastAssistantAt <= this.lastObservedAssistantAt) {
        return { truncatedCount: 0, tokensBefore: 0, tokensAfter: 0, changed: false };
      }
    }
    this.lastObservedAssistantAt = lastAssistantAt;

    const previousCutoff = this.cutoff;
    const nextCutoff = Math.max(0, history.length - this.config.keepRecentMessages);

    if (nextCutoff <= previousCutoff) {
      // Nothing new to truncate.
      return { truncatedCount: 0, tokensBefore: 0, tokensAfter: 0, changed: false };
    }

    this.cutoff = nextCutoff;
    const { truncatedCount, tokensBefore, tokensAfter } = this.measureEffect(history, nextCutoff, previousCutoff);
    return { truncatedCount, tokensBefore, tokensAfter, changed: true };
  }

  /**
   * Apply truncation to a message array. Called at projection time (before
   * sending the request to the model). Messages below `cutoff` that are large
   * tool results get their content replaced with the marker.
   */
  compact(messages: readonly AgentMessage[]): AgentMessage[] {
    if (!this.config.enabled || this.cutoff <= 0) return messages.slice();

    const result: AgentMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg) continue;

      if (
        i < this.cutoff &&
        msg.role === "toolResult"
      ) {
        const contentTokens = estimateTokensForContent((msg as { content: string | readonly { type: string; text?: string }[] }).content);
        if (contentTokens >= this.config.minContentTokens) {
          // Truncate large tool result to the marker — replace content array with marker string.
          // The compact() output is used for projection only; the original messages are untouched.
          const newMsg = { ...msg, content: this.config.truncatedMarker } as unknown as AgentMessage;
          result.push(newMsg);
          continue;
        }
      }
      result.push(msg);
    }

    return result;
  }

  // ---- private helpers ----

  private estimateMarkerTokens(): number {
    return Math.ceil(this.config.truncatedMarker.length / 4);
  }

  private measureEffect(
    messages: readonly AgentMessage[],
    nextCutoff: number,
    previousCutoff: number,
  ): { truncatedCount: number; tokensBefore: number; tokensAfter: number } {
    let truncatedCount = 0;
    let tokensBefore = 0;
    let tokensAfter = 0;
    const markerTokens = this.estimateMarkerTokens();

    for (let i = previousCutoff; i < messages.length && i < nextCutoff; i++) {
      const msg = messages[i];
      if (!msg || msg.role !== "toolResult") continue;
      if (typeof msg.content !== "string") continue;
      const rawTokens = estimateTokens(msg);
      if (rawTokens < this.config.minContentTokens) continue;

      truncatedCount += 1;
      tokensBefore += rawTokens;
      tokensAfter += markerTokens;
    }

    return { truncatedCount, tokensBefore, tokensAfter };
  }
}
