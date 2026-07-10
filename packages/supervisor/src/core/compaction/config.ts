/**
 * Unified compaction configuration.
 *
 * Merges Kimi Code's strategy-based thresholds with supervisor's existing
 * token-based settings. All values can be overridden per-session via
 * session meta's `compaction` object.
 */

export interface MicroCompactionConfig {
  /** Enable micro compaction (zero-LLM inline truncation). */
  enabled: boolean;
  /** Number of most recent messages to keep verbatim. */
  keepRecentMessages: number;
  /** Minimum content tokens to qualify a tool result for truncation. */
  minContentTokens: number;
  /** Cache miss threshold in ms — only trigger after this idle window. */
  cacheMissedThresholdMs: number;
  /** Placeholder text for truncated tool results. */
  truncatedMarker: string;
  /** Minimum context usage ratio (0-1) to qualify for micro compaction. */
  minContextUsageRatio: number;
}

export const DEFAULT_MICRO_COMPACTION_CONFIG: MicroCompactionConfig = {
  enabled: true,
  keepRecentMessages: 20,
  minContentTokens: 100,
  cacheMissedThresholdMs: 60 * 60 * 1000, // 1 hour
  truncatedMarker: '[Old tool result content cleared]',
  minContextUsageRatio: 0.5,
};

export interface FullCompactionConfig {
  /** Fraction of the model context window that triggers auto-compaction (0-1). */
  triggerRatio: number;
  /** Fraction of the model context window that blocks the turn on compaction (0-1). */
  blockRatio: number;
  /** Reserved output token budget — compaction triggers early to leave room. */
  reserveTokens: number;
  /** Number of recent tokens to keep verbatim (legacy policy). */
  keepRecentTokens: number;
  /** Maximum overflow-recovery compaction attempts per turn. */
  maxOverflowCompactionAttempts: number;
  /** Maximum compaction LLM-round retries on transient/empty/truncated errors. */
  maxCompactionRetryAttempts: number;
  /** Shrink ratios applied sequentially on each overflow recovery attempt. */
  overflowShrinkRatios: readonly number[];
}

export const DEFAULT_FULL_COMPACTION_CONFIG: FullCompactionConfig = {
  triggerRatio: 0.85,
  blockRatio: 0.85,
  reserveTokens: 16384,
  keepRecentTokens: 20000,
  maxOverflowCompactionAttempts: 3,
  maxCompactionRetryAttempts: 5,
  overflowShrinkRatios: [0.7, 0.5, 0.35],
};

export interface CompactionConfig {
  /** Global on/off switch. */
  enabled: boolean;
  micro: MicroCompactionConfig;
  full: FullCompactionConfig;
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  enabled: true,
  micro: DEFAULT_MICRO_COMPACTION_CONFIG,
  full: DEFAULT_FULL_COMPACTION_CONFIG,
};
