import type { HindsightApi, MemoryItemInput } from "./client.js";
import type { HindsightConfig } from "./config.js";
import { ensureBankExists } from "./bank.js";
import {
  composeRecallQuery,
  formatCurrentTime,
  formatMemories,
  formatMemoriesBlock,
  type HindsightMessage,
  prepareRetentionTranscript,
  sliceLastTurnsByUserBoundary,
  truncateRecallQuery,
} from "./content.js";
import {
  extractFactsFromMessages,
  formatHindsightBlock,
  listHindsightRecords,
  recallLocalByQuery,
  retainLocalFacts,
} from "./local-store.js";

const RETAIN_FLUSH_BATCH_SIZE = 16;
const RETAIN_FLUSH_INTERVAL_MS = 5_000;

interface PendingRetainItem {
  content: string;
  context?: string;
  timestamp: Date;
}

export type MemoryMode = "api" | "local";

export interface HindsightSessionStateOptions {
  sessionId: string;
  projectDir: string;
  mode: MemoryMode;
  client?: HindsightApi;
  bankId: string;
  retainTags?: string[];
  recallTags?: string[];
  recallTagsMatch?: "any" | "all" | "any_strict" | "all_strict";
  config: HindsightConfig;
  banksSet: Set<string>;
  getMessages: () => Promise<HindsightMessage[]>;
  injectRecall: (block: string) => void;
  log: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    meta?: Record<string, unknown>,
  ) => void;
}

class HindsightRetainQueue {
  readonly #state: HindsightSessionState;
  #items: PendingRetainItem[] = [];
  #timer?: NodeJS.Timeout;
  #flushing?: Promise<void>;
  #closed = false;

  constructor(state: HindsightSessionState) {
    this.#state = state;
  }

  enqueue(content: string, context?: string): void {
    if (this.#closed) {
      throw new Error("Hindsight retain queue is closed.");
    }
    this.#items.push({ content, context, timestamp: new Date() });

    if (this.#items.length >= RETAIN_FLUSH_BATCH_SIZE) {
      void this.flush();
      return;
    }
    if (!this.#timer) {
      this.#timer = setTimeout(() => {
        void this.flush();
      }, RETAIN_FLUSH_INTERVAL_MS);
      this.#timer.unref?.();
    }
  }

  async flush(): Promise<void> {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }

    if (this.#flushing) {
      await this.#flushing;
      if (this.#items.length > 0) await this.flush();
      return;
    }

    if (this.#items.length === 0) return;

    const items = this.#items.splice(0);
    const flushPromise = this.#doFlush(items);
    this.#flushing = flushPromise;
    try {
      await flushPromise;
    } finally {
      this.#flushing = undefined;
    }
  }

  dispose(): void {
    this.#closed = true;
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    this.#items = [];
  }

  async #doFlush(items: PendingRetainItem[]): Promise<void> {
    const state = this.#state;
    if (state.mode === "local") {
      await retainLocalFacts(
        state.projectDir,
        state.sessionId,
        items.map((item) => ({ content: item.content, context: item.context })),
      );
      return;
    }

    if (!state.client) return;

    try {
      await ensureBankExists(state.client, state.bankId, state.config, state.banksSet);
      const batch: MemoryItemInput[] = items.map((item) => ({
        content: item.content,
        context: item.context ?? state.config.retainContext,
        metadata: { session_id: state.sessionId },
        tags: state.retainTags,
        timestamp: item.timestamp,
      }));
      await state.client.retainBatch(state.bankId, batch, { async: true });
    } catch (err) {
      state.log("warn", "Hindsight retain queue flush failed", {
        sessionId: state.sessionId,
        bankId: state.bankId,
        items: items.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export class HindsightSessionState {
  sessionId: string;
  projectDir: string;
  mode: MemoryMode;
  client?: HindsightApi;
  bankId: string;
  retainTags?: string[];
  recallTags?: string[];
  recallTagsMatch?: "any" | "all" | "any_strict" | "all_strict";
  config: HindsightConfig;
  banksSet: Set<string>;
  lastRetainedTurn: number;
  hasRecalledForFirstTurn: boolean;
  readonly retainQueue: HindsightRetainQueue;

  readonly #getMessages: () => Promise<HindsightMessage[]>;
  readonly #injectRecall: (block: string) => void;
  readonly #log: HindsightSessionStateOptions["log"];

  constructor(options: HindsightSessionStateOptions) {
    this.sessionId = options.sessionId;
    this.projectDir = options.projectDir;
    this.mode = options.mode;
    this.client = options.client;
    this.bankId = options.bankId;
    this.retainTags = options.retainTags;
    this.recallTags = options.recallTags;
    this.recallTagsMatch = options.recallTagsMatch;
    this.config = options.config;
    this.banksSet = options.banksSet;
    this.lastRetainedTurn = 0;
    this.hasRecalledForFirstTurn = false;
    this.#getMessages = options.getMessages;
    this.#injectRecall = options.injectRecall;
    this.#log = options.log;
    this.retainQueue = new HindsightRetainQueue(this);
  }

  enqueueRetain(content: string, context?: string): void {
    this.retainQueue.enqueue(content, context);
  }

  async flushRetainQueue(): Promise<void> {
    await this.retainQueue.flush();
  }

  dispose(): void {
    this.retainQueue.dispose();
  }

  async recallForContext(query: string, signal?: AbortSignal): Promise<string | null> {
    if (this.mode === "local") {
      const records = recallLocalByQuery(this.projectDir, query);
      if (records.length === 0) return null;
      return formatHindsightBlock(records);
    }

    if (!this.client) return null;

    try {
      const response = await this.client.recall(this.bankId, query, {
        budget: this.config.recallBudget,
        maxTokens: this.config.recallMaxTokens,
        types: this.config.recallTypes.length > 0 ? this.config.recallTypes : undefined,
        tags: this.recallTags,
        tagsMatch: this.recallTagsMatch,
        signal,
      });
      if (signal?.aborted) return null;
      const results = response.results ?? [];
      if (results.length === 0) return null;
      const formatted = formatMemories(results);
      return formatMemoriesBlock(this.config.recallPromptPreamble, formatted);
    } catch (err) {
      if (this.config.debug) {
        this.#log("debug", "Hindsight recall failed", {
          bankId: this.bankId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return null;
    }
  }

  async recallTool(query: string, signal?: AbortSignal): Promise<{ text: string; count: number }> {
    if (this.mode === "local") {
      const records = recallLocalByQuery(this.projectDir, query);
      if (records.length === 0) {
        return { text: "No relevant memories found.", count: 0 };
      }
      const formatted = records.map((record) => `- ${record.content}`).join("\n\n");
      return {
        text: `Found ${records.length} relevant ${records.length === 1 ? "memory" : "memories"} (as of ${formatCurrentTime()} UTC):\n\n${formatted}`,
        count: records.length,
      };
    }

    if (!this.client) {
      return { text: "Hindsight API is not configured.", count: 0 };
    }

    await ensureBankExists(this.client, this.bankId, this.config, this.banksSet);
    const response = await this.client.recall(this.bankId, query, {
      budget: this.config.recallBudget,
      maxTokens: this.config.recallMaxTokens,
      types: this.config.recallTypes.length > 0 ? this.config.recallTypes : undefined,
      tags: this.recallTags,
      tagsMatch: this.recallTagsMatch,
      signal,
    });
    const results = response.results ?? [];
    if (results.length === 0) {
      return { text: "No relevant memories found.", count: 0 };
    }
    const formatted = formatMemories(results);
    return {
      text: `Found ${results.length} relevant ${results.length === 1 ? "memory" : "memories"} (as of ${formatCurrentTime()} UTC):\n\n${formatted}`,
      count: results.length,
    };
  }

  async reflectTool(
    query: string,
    context?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    if (this.mode === "local") {
      const records = recallLocalByQuery(this.projectDir, context?.trim() ? `${query} ${context}` : query);
      if (records.length === 0) {
        return "No relevant information found to reflect on.";
      }
      return `Based on recalled memories:\n\n${records.map((record) => `- ${record.content}`).join("\n")}`;
    }

    if (!this.client) {
      return "Hindsight API is not configured.";
    }

    await ensureBankExists(this.client, this.bankId, this.config, this.banksSet);
    const response = await this.client.reflect(this.bankId, query, {
      context,
      budget: this.config.recallBudget,
      tags: this.recallTags,
      tagsMatch: this.recallTagsMatch,
      signal,
    });
    return response.text?.trim() || "No relevant information found to reflect on.";
  }

  async retainSession(messages: HindsightMessage[]): Promise<void> {
    if (this.mode === "local") {
      await extractFactsFromMessages(messages, this.projectDir, this.sessionId);
      return;
    }

    if (!this.client) return;

    const retainedAt = new Date();
    const retainFullWindow = this.config.retainMode === "full-session";
    let target: HindsightMessage[];
    let documentId: string;

    if (retainFullWindow) {
      target = messages;
      documentId = this.sessionId;
    } else {
      const windowTurns = this.config.retainEveryNTurns + this.config.retainOverlapTurns;
      target = sliceLastTurnsByUserBoundary(messages, windowTurns);
      documentId = `${this.sessionId}-${retainedAt.getTime()}`;
    }

    const { transcript } = prepareRetentionTranscript(target, true);
    if (!transcript) return;

    await ensureBankExists(this.client, this.bankId, this.config, this.banksSet);
    await this.client.retain(this.bankId, transcript, {
      documentId,
      context: this.config.retainContext,
      metadata: { session_id: this.sessionId },
      tags: this.retainTags,
      timestamp: retainedAt,
      async: true,
    });
  }

  async maybeRetainOnAgentEnd(messages: HindsightMessage[]): Promise<void> {
    if (!this.config.autoRetain) return;
    if (messages.length === 0) return;

    const userTurns = messages.filter((message) => message.role === "user").length;
    if (userTurns - this.lastRetainedTurn < this.config.retainEveryNTurns) return;

    try {
      await this.retainSession(messages);
      this.lastRetainedTurn = userTurns;
    } catch (err) {
      this.#log("warn", "Hindsight auto-retain failed", {
        sessionId: this.sessionId,
        bankId: this.bankId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async maybeRecallForUserMessage(userText: string): Promise<void> {
    if (!this.config.autoRecall || this.hasRecalledForFirstTurn) return;

    const history = await this.#getMessages();
    const query = composeRecallQuery(userText, history, this.config.recallContextTurns);
    const truncated = truncateRecallQuery(query, userText, this.config.recallMaxQueryChars);
    const block = await this.recallForContext(truncated);
    this.hasRecalledForFirstTurn = true;
    if (!block) {
      if (this.mode === "local") {
        const localBlock = formatHindsightBlock(listHindsightRecords(this.projectDir));
        if (localBlock) this.#injectRecall(localBlock);
      }
      return;
    }
    this.#injectRecall(block);
  }

  async maybeRecallOnSessionStart(): Promise<void> {
    if (!this.config.autoRecall || this.hasRecalledForFirstTurn) return;
    if (this.mode !== "local") return;

    const block = formatHindsightBlock(listHindsightRecords(this.projectDir));
    if (!block) return;
    this.hasRecalledForFirstTurn = true;
    this.#injectRecall(block);
  }
}
