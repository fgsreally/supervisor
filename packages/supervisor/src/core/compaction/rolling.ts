import type {
  AgentHarnessEvent,
  AgentMessage,
  CompactionSettings,
  SessionTreeEntry,
} from "@earendil-works/pi-agent-core";
import {
  calculateContextTokens,
  DEFAULT_COMPACTION_SETTINGS,
  estimateContextTokens,
  prepareCompaction,
  shouldCompact,
} from "@earendil-works/pi-agent-core";
import {
  type Api,
  type AssistantMessage,
  isContextOverflow,
  type Model,
} from "@earendil-works/pi-ai";
import { hasPendingAsks } from "../../tools/ask/tool.js";
import type { SupervisorDb } from "../../db/db.js";
import type { SessionRuntime } from "../session-runtime.js";
import { compactWithUtilityModel, resolveTaggedModelAuth } from "../../utils/utility-llm.js";

const overflowRecoveryAttempted = new Set<string>();
const compactingSessions = new Set<string>();

export function getLatestCompactionEntry(
  entries: SessionTreeEntry[],
): Extract<SessionTreeEntry, { type: "compaction" }> | null {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry?.type === "compaction") return entry;
  }
  return null;
}

function findLastAssistantMessage(messages: AgentMessage[]): AssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role === "assistant") return message as AssistantMessage;
  }
  return undefined;
}

export function resolveRollingCompactionSettings(
  meta: Record<string, unknown>,
): CompactionSettings {
  const saved = meta.compaction;
  if (!saved || typeof saved !== "object") return DEFAULT_COMPACTION_SETTINGS;
  const item = saved as Record<string, unknown>;
  return {
    enabled: item.enabled !== false,
    reserveTokens:
      typeof item.reserveTokens === "number"
        ? item.reserveTokens
        : DEFAULT_COMPACTION_SETTINGS.reserveTokens,
    keepRecentTokens:
      typeof item.keepRecentTokens === "number"
        ? item.keepRecentTokens
        : DEFAULT_COMPACTION_SETTINGS.keepRecentTokens,
  };
}

function resetOverflowRecovery(sessionId: string, assistantMessage: AssistantMessage): void {
  if (assistantMessage.stopReason !== "error") {
    overflowRecoveryAttempted.delete(sessionId);
  }
}

async function resumeQueuedMessages(runtime: SessionRuntime): Promise<void> {
  const agent = runtime.harness.agent as {
    hasQueuedMessages?: () => boolean;
    continue?: () => Promise<void>;
  };
  if (!agent.hasQueuedMessages?.()) return;
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      void agent
        .continue?.()
        .catch(() => {})
        .finally(resolve);
    }, 100);
  });
}

async function runCompaction(
  sessionId: string,
  runtime: SessionRuntime,
  db: Pick<SupervisorDb, "listProviders" | "listModelsByProvider" | "getProvider">,
  meta: Record<string, unknown>,
  options: { overflowRetry: boolean },
): Promise<void> {
  if (compactingSessions.has(sessionId)) return;
  compactingSessions.add(sessionId);
  try {
    const settings = resolveRollingCompactionSettings(meta);
    const branchEntries = await runtime.getMessages();
    const preparation = prepareCompaction(branchEntries, settings);
    if (!preparation) return;

    const utilityAuth = await resolveTaggedModelAuth(db, "summary");
    if (utilityAuth) {
      const result = await compactWithUtilityModel(utilityAuth, preparation);
      await runtime.appendCompactionResult(
        result.summary,
        result.firstKeptEntryId,
        result.tokensBefore,
        result.details,
      );
    } else {
      await runtime.compact();
    }

    if (options.overflowRetry) {
      const agent = runtime.harness.agent as { continue?: () => Promise<void> };
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          void agent
            .continue?.()
            .catch(() => {})
            .finally(resolve);
        }, 100);
      });
      return;
    }
    await resumeQueuedMessages(runtime);
  } finally {
    compactingSessions.delete(sessionId);
  }
}

/**
 * Rolling compaction: after each agent run, summarize older context when usage crosses
 * the reserve threshold, or recover from provider context-overflow errors.
 */
export async function maybeRunRollingCompaction(
  sessionId: string,
  runtime: SessionRuntime,
  event: Extract<AgentHarnessEvent, { type: "agent_end" }>,
  meta: Record<string, unknown>,
  db: Pick<SupervisorDb, "listProviders" | "listModelsByProvider" | "getProvider">,
): Promise<void> {
  if (hasPendingAsks(sessionId)) return;

  const settings = resolveRollingCompactionSettings(meta);
  if (!settings.enabled) return;

  const assistantMessage = findLastAssistantMessage(event.messages);
  if (!assistantMessage) return;
  if (assistantMessage.stopReason === "aborted") return;

  resetOverflowRecovery(sessionId, assistantMessage);

  const model = runtime.harness.agent.state.model as Model<Api>;
  const contextWindow = model.contextWindow ?? 0;
  if (!contextWindow) return;

  const branchEntries = await runtime.getMessages();
  const compactionEntry = getLatestCompactionEntry(branchEntries);
  if (
    compactionEntry &&
    assistantMessage.timestamp <= new Date(compactionEntry.timestamp).getTime()
  ) {
    return;
  }

  const sameModel =
    assistantMessage.provider === model.provider && assistantMessage.model === model.id;

  if (sameModel && isContextOverflow(assistantMessage, contextWindow)) {
    if (overflowRecoveryAttempted.has(sessionId)) return;
    overflowRecoveryAttempted.add(sessionId);

    const messages = runtime.harness.agent.state.messages;
    if (messages.length > 0 && messages[messages.length - 1]?.role === "assistant") {
      runtime.harness.agent.state.messages = messages.slice(0, -1);
    }
    await runCompaction(sessionId, runtime, db, meta, { overflowRetry: true });
    return;
  }

  let contextTokens: number;
  if (assistantMessage.stopReason === "error") {
    const estimate = estimateContextTokens(runtime.harness.agent.state.messages);
    if (estimate.lastUsageIndex === null) return;
    const usageMessage = runtime.harness.agent.state.messages[estimate.lastUsageIndex];
    if (
      compactionEntry &&
      usageMessage?.role === "assistant" &&
      (usageMessage as AssistantMessage).timestamp <= new Date(compactionEntry.timestamp).getTime()
    ) {
      return;
    }
    contextTokens = estimate.tokens;
  } else {
    if (!assistantMessage.usage) return;
    contextTokens = calculateContextTokens(assistantMessage.usage);
  }

  if (!shouldCompact(contextTokens, contextWindow, settings)) return;
  await runCompaction(sessionId, runtime, db, meta, { overflowRetry: false });
}
