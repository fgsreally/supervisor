import type { ExtensionDefinition } from "../../types.js";

const DEFAULT_WARNING_COUNT = 3;
const DEFAULT_BLOCK_COUNT = 4;
const POLLING_WARNING_COUNT = 6;
const POLLING_BLOCK_COUNT = 10;
const IGNORED_ARGUMENT_KEYS = new Set(["intent"]);

function normalize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[max-depth]";
  if (Array.isArray(value)) return value.map((item) => normalize(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !IGNORED_ARGUMENT_KEYS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalize(item, depth + 1)]),
  );
}

function signature(value: unknown): string {
  const serialized = JSON.stringify(normalize(value));
  return serialized.length > 12_000 ? serialized.slice(0, 12_000) : serialized;
}

function resultSummary(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const record = result as { content?: unknown; isError?: unknown };
  return {
    isError: record.isError === true,
    content: Array.isArray(record.content)
      ? record.content.map((part) => {
          if (!part || typeof part !== "object") return part;
          const item = part as { type?: unknown; text?: unknown };
          return { type: item.type, text: item.text };
        })
      : record.content,
  };
}

function thresholds(toolName: string): { warning: number; block: number } {
  const normalized = toolName.toLowerCase();
  const polling = normalized.includes("wait") || normalized.includes("status");
  return polling
    ? { warning: POLLING_WARNING_COUNT, block: POLLING_BLOCK_COUNT }
    : { warning: DEFAULT_WARNING_COUNT, block: DEFAULT_BLOCK_COUNT };
}

export default {
  name: "tool-loop-guard",
  async setup(ctx) {
    const pendingCalls = new Map<string, { toolName: string; callSignature: string }>();
    type CompletedCall = {
      toolName: string;
      callSignature: string;
      resultSignature: string;
      count: number;
    };
    const saved = (await ctx.session.meta.get()).toolLoopGuard;
    let lastCompleted: CompletedCall | null =
      saved &&
      typeof saved === "object" &&
      typeof (saved as CompletedCall).toolName === "string" &&
      typeof (saved as CompletedCall).callSignature === "string" &&
      typeof (saved as CompletedCall).resultSignature === "string" &&
      typeof (saved as CompletedCall).count === "number"
        ? (saved as CompletedCall)
        : null;

    async function persist(value: CompletedCall | null): Promise<void> {
      await ctx.session.meta.patch({ toolLoopGuard: value });
    }

    ctx.session.tools.beforeUse(async (call) => {
      const callSignature = signature({ name: call.name, args: call.args });
      pendingCalls.set(call.toolCallId, { toolName: call.name, callSignature });
      if (!lastCompleted || lastCompleted.callSignature !== callSignature) {
        const changed = lastCompleted !== null;
        lastCompleted = null;
        ctx.inject.clear("tool-call-loop");
        if (changed) await persist(null);
        return;
      }
      const { block } = thresholds(call.name);
      if (lastCompleted.count < block - 1) return;
      pendingCalls.delete(call.toolCallId);
      return {
        allow: false,
        reason:
          `Blocked repeated tool call: ${call.name} has returned the same result ` +
          `${lastCompleted.count} consecutive times. Change the approach or explain why retrying is necessary.`,
      };
    });

    ctx.session.tools.afterUse(async (call) => {
      const current = pendingCalls.get(call.toolCallId);
      pendingCalls.delete(call.toolCallId);
      if (!current || current.toolName !== call.name) return;
      const resultSignature = signature(resultSummary(call.result));
      const count =
        lastCompleted?.callSignature === current.callSignature &&
        lastCompleted.resultSignature === resultSignature
          ? lastCompleted.count + 1
          : 1;
      lastCompleted = { ...current, resultSignature, count };
      await persist(lastCompleted);
      const { warning } = thresholds(call.name);
      if (count !== warning) return;
      const content =
        `You have called ${call.name} with the same effective arguments and received the same ` +
        `result ${count} consecutive times. Reassess the approach before calling it again.`;
      ctx.inject.schedule({
        variant: "tool-call-loop",
        content,
        priority: 100,
        dedupeAfterTurns: 0,
      });
      ctx.log("warn", content, { toolName: call.name, repeatCount: count });
    });
  },
} satisfies ExtensionDefinition;
