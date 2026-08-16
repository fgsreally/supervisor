import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { SessionTreeEntry } from "@/api";
import type { ChatEntry, ChatTextPart, ChatThinkingPart, ChatToolPart } from "@/types/chat-entry";
import { normalizeStreamingToolResult } from "./ask-tool";
import type { MessageAsset } from "@/types/chat-entry";

type ToolResultPayload = {
  toolCallId?: string;
  toolName?: string;
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
  details?: unknown;
};

function messageAssets(meta: Record<string, unknown>): MessageAsset[] {
  if (!Array.isArray(meta.assets)) return [];
  return meta.assets.filter(
    (asset): asset is MessageAsset =>
      typeof asset === "object" &&
      asset !== null &&
      (asset.scope === "project" || asset.scope === "agent" || asset.scope === "session") &&
      typeof asset.path === "string",
  );
}

function toolResultChatEntry(
  entry: SessionTreeEntry,
  payload: ToolResultPayload,
): Extract<ChatEntry, { type: "toolResult" }> {
  const base = entry.isOld ? { isOld: true } : {};
  const assets = messageAssets(entry.meta);
  return {
    ...base,
    id: entry.id,
    type: "toolResult",
    toolCallId: payload.toolCallId ?? "",
    toolName: payload.toolName ?? "",
    content: payload.content ?? [],
    isError: payload.isError,
    ...(payload.details !== undefined ? { details: payload.details } : {}),
    createdAt: entry.createdAt,
    ...(assets.length > 0 ? { assets } : {}),
    ...(entry.meta?.liteTruncated === true ? { truncated: true } : {}),
  };
}

function toolResultFromMessageEntry(
  entry: SessionTreeEntry,
): Extract<ChatEntry, { type: "toolResult" }> | null {
  const msg = entry.message as (SessionTreeEntry["message"] & ToolResultPayload) | undefined;
  if (entry.type !== "message" || msg?.role !== "toolResult") return null;
  return toolResultChatEntry(entry, {
    toolCallId: msg.toolCallId,
    toolName: msg.toolName,
    content: msg.content,
    isError: msg.isError,
    details: msg.details,
  });
}

export function sessionTreeToChatEntries(entries: SessionTreeEntry[]): ChatEntry[] {
  return entries
    .map(sessionTreeEntryToChatEntry)
    .filter((entry): entry is ChatEntry => entry != null);
}

export function sessionTreeEntryToChatEntry(entry: SessionTreeEntry): ChatEntry | null {
  if (entry.meta?.hidden === true) return null;
  const assets = messageAssets(entry.meta);
  const base = {
    ...(entry.isOld ? { isOld: true } : {}),
    ...(assets.length > 0 ? { assets } : {}),
    ...(typeof entry.meta?.inputSource === "string"
      ? { injectedSource: entry.meta.inputSource }
      : {}),
    ...(entry.type === "message" && entry.message?.usage ? { usage: entry.message.usage } : {}),
  };
  if (entry.type === "system") {
    return {
      ...base,
      id: entry.id,
      type: "system",
      content: entry.content ?? "",
      createdAt: entry.createdAt,
    };
  }
  if (entry.type === "custom" && entry.customType === "llm_error") {
    const data = entry.data ?? {};
    const text =
      typeof data.text === "string" && data.text.trim() ? data.text.trim() : "模型调用失败，请重试";
    return {
      ...base,
      id: entry.id,
      type: "llm_error",
      content: text,
      createdAt: entry.createdAt,
    };
  }
  if (
    entry.type === "custom" &&
    (entry.customType === "custom_message" ||
      entry.customType === "session_notice" ||
      entry.customType === "shadow_analysis")
  ) {
    const data = entry.data ?? {};
    const text =
      typeof data.text === "string" && data.text.trim()
        ? data.text.trim()
        : typeof data.message === "string"
          ? data.message.trim()
          : "系统事件";
    // Legacy path: some external-agent failures were stored as custom_message.
    // Render them as llm_error cards so they match LobeChat-style error bubbles.
    if (looksLikeLlmFailureNotice(text)) {
      return {
        ...base,
        id: entry.id,
        type: "llm_error",
        content: text,
        createdAt: entry.createdAt,
      };
    }
    return {
      ...base,
      id: entry.id,
      type: "notice",
      content: text,
      createdAt: entry.createdAt,
    };
  }
  if (entry.type === "custom") {
    return null;
  }
  if (entry.type === "compaction") {
    return {
      ...base,
      id: entry.id,
      type: "compaction",
      summary: entry.summary ?? "",
      firstKeptEntryId: entry.firstKeptEntryId ?? "",
      tokensBefore: entry.tokensBefore ?? 0,
      createdAt: entry.createdAt,
    };
  }

  const embeddedToolResult = toolResultFromMessageEntry(entry);
  if (embeddedToolResult) return embeddedToolResult;

  if (
    entry.type === "message" &&
    entry.message?.role === "custom" &&
    (entry.message.customType === "slash_input" || entry.message.customType === "slash_output")
  ) {
    const details = entry.message.details as { isError?: boolean } | undefined;
    return {
      ...base,
      id: entry.id,
      type: "slash",
      direction: entry.message.customType === "slash_input" ? "input" : "output",
      content: typeof entry.message.content === "string" ? entry.message.content : "",
      isError: details?.isError,
      createdAt: entry.createdAt,
    };
  }

  if (entry.type === "toolResult") {
    const content =
      (entry as SessionTreeEntry & { content?: Array<{ type: string; text: string }> }).content ??
      [];
    return toolResultChatEntry(entry, {
      toolCallId: entry.toolCallId,
      toolName: entry.toolName,
      content,
    });
  }
  // Harness metadata (e.g. thinking_level_change) must not become chat bubbles —
  // they were previously treated as empty assistant messages and inflated turn duration.
  if (entry.type !== "message") return null;

  return {
    ...base,
    id: entry.id,
    type: "message",
    createdAt: entry.createdAt,
    message:
      entry.originMsg && entry.message?.role === "user"
        ? { ...entry.message, content: entry.originMsg }
        : (entry.message ?? { role: "assistant", content: "" }),
  };
}

export function createStreamingAssistantEntry(id: string): ChatEntry {
  return {
    id,
    type: "message",
    createdAt: Date.now(),
    message: { role: "assistant", content: [{ type: "text", text: "" }] },
  };
}

export function createUserChatEntry(
  id: string,
  text: string,
  deliveryState?: "queued" | "failed",
  source?: string | null,
): ChatEntry {
  return {
    id,
    type: "message",
    createdAt: Date.now(),
    ...(deliveryState ? { deliveryState } : {}),
    ...(source &&
    (source.startsWith("shadow:") ||
      source.startsWith("spawn_agent:parent:") ||
      source.startsWith("subagent:parent:"))
      ? { injectedSource: source }
      : {}),
    message: { role: "user", content: text },
  };
}

export function applyAgentEventToChatEntries(
  entries: ChatEntry[],
  assistantId: string,
  event: AgentEvent,
): void {
  if (event.type === "message_update") {
    const deltaEvent = event.assistantMessageEvent;
    const entry = entries.find((e) => e.id === assistantId);
    if (entry?.type !== "message" || !Array.isArray(entry.message.content)) return;

    if (deltaEvent.type === "thinking_delta") {
      const content = entry.message.content;
      const index = deltaEvent.contentIndex;
      const existing = content[index];
      if (existing?.type === "thinking") {
        existing.thinking += deltaEvent.delta;
      } else {
        const part: ChatThinkingPart = { type: "thinking", thinking: deltaEvent.delta };
        content[index] = part;
      }
      return;
    }

    if (deltaEvent.type !== "text_delta") return;
    const content = entry.message.content;
    const last = content[content.length - 1];
    if (last?.type === "text") {
      last.text += deltaEvent.delta;
    } else {
      content.push({ type: "text", text: deltaEvent.delta });
    }
    return;
  }

  if (event.type === "tool_execution_start") {
    const entry = entries.find((e) => e.id === assistantId);
    if (entry?.type !== "message" || !Array.isArray(entry.message.content)) return;
    const part: ChatToolPart = {
      type: "toolCall",
      id: event.toolCallId,
      name: event.toolName,
      arguments: event.args ?? {},
    };
    (entry.message.content as Array<ChatTextPart | ChatThinkingPart | ChatToolPart>).push(part);
    return;
  }

  if (event.type === "tool_execution_end") {
    const normalized = normalizeStreamingToolResult(event.toolName, event.result);
    entries.push({
      id: `tool-result-${event.toolCallId}`,
      type: "toolResult",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      content: normalized.content,
      isError: event.isError,
      ...(normalized.details !== undefined ? { details: normalized.details } : {}),
    });
  }
}

function looksLikeLlmFailureNotice(text: string): boolean {
  return /回合超时|turn\/completed|模型调用失败|Codex app-server exited|Failed to start Codex|消息发送失败|Insufficient balance|rate limit|context.*(overflow|length)/i.test(
    text,
  );
}

function tailHasAssistantToolCalls(entries: ChatEntry[], userIndex: number): boolean {
  for (let index = userIndex + 1; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry?.type !== "message" || entry.message.role !== "assistant") continue;
    const content = entry.message.content;
    if (Array.isArray(content) && content.some((part) => part.type === "toolCall")) return true;
  }
  return false;
}

function lastUserEntryIndex(entries: ChatEntry[]): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type === "message" && entry.message.role === "user") return index;
  }
  return -1;
}

function captureStreamingToolSnapshot(localEntries: ChatEntry[]): {
  assistantEntry: Extract<ChatEntry, { type: "message" }>;
  toolResults: Array<Extract<ChatEntry, { type: "toolResult" }>>;
} | null {
  for (let index = localEntries.length - 1; index >= 0; index -= 1) {
    const entry = localEntries[index];
    if (entry?.type !== "message" || entry.message.role !== "assistant") continue;
    if (!String(entry.id).startsWith("stream-")) continue;
    const content = Array.isArray(entry.message.content) ? entry.message.content : [];
    const toolCalls = content.filter((part): part is ChatToolPart => part.type === "toolCall");
    const toolResults = localEntries.filter(
      (candidate): candidate is Extract<ChatEntry, { type: "toolResult" }> =>
        candidate.type === "toolResult" && String(candidate.id).startsWith("tool-result-"),
    );
    if (toolCalls.length === 0 && toolResults.length === 0) return null;
    return { assistantEntry: entry, toolResults };
  }
  return null;
}

/** Keep optimistic streaming tool rows when reload returns text-only assistant messages. */
export function mergeStreamingToolsIntoPersistedEntries(
  serverEntries: ChatEntry[],
  localEntries: ChatEntry[],
): ChatEntry[] {
  const snapshot = captureStreamingToolSnapshot(localEntries);
  if (!snapshot) return serverEntries;

  const userIndex = lastUserEntryIndex(serverEntries);
  if (userIndex < 0) return serverEntries;

  if (tailHasAssistantToolCalls(serverEntries, userIndex)) return serverEntries;

  const merged = [...serverEntries];
  const lastAssistantIndex = merged.length - 1;
  const lastAssistant = merged[lastAssistantIndex];
  if (lastAssistant?.type !== "message" || lastAssistant.message.role !== "assistant") {
    return serverEntries;
  }

  const localContent = Array.isArray(snapshot.assistantEntry.message.content)
    ? snapshot.assistantEntry.message.content
    : [];
  const toolCalls = localContent.filter((part): part is ChatToolPart => part.type === "toolCall");
  if (toolCalls.length === 0 && snapshot.toolResults.length === 0) return serverEntries;

  const existingContent = Array.isArray(lastAssistant.message.content)
    ? [...lastAssistant.message.content]
    : typeof lastAssistant.message.content === "string" && lastAssistant.message.content.trim()
      ? [{ type: "text" as const, text: lastAssistant.message.content }]
      : [];

  const withoutLocalToolCalls = existingContent.filter((part) => part.type !== "toolCall");
  merged[lastAssistantIndex] = {
    ...lastAssistant,
    message: {
      ...lastAssistant.message,
      content: [...withoutLocalToolCalls, ...toolCalls],
    },
  };

  const resultByCallId = new Map(
    snapshot.toolResults.map((entry) => [entry.toolCallId, entry] as const),
  );
  for (const toolCall of toolCalls) {
    const result = resultByCallId.get(toolCall.id);
    if (!result) continue;
    merged.push({
      ...result,
      id: `merged-tool-result-${toolCall.id}`,
    });
  }

  return merged;
}
