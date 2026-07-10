import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { SessionTreeEntry } from "@/api";
import type { ChatEntry, ChatThinkingPart, ChatToolPart } from "@/types/chat-entry";
import { normalizeStreamingToolResult } from "./ask-tool";

type ToolResultPayload = {
	toolCallId?: string;
	toolName?: string;
	content?: Array<{ type: string; text: string }>;
	isError?: boolean;
	details?: unknown;
};

function toolResultChatEntry(
	entry: SessionTreeEntry,
	payload: ToolResultPayload,
): Extract<ChatEntry, { type: "toolResult" }> {
	const base = entry.isOld ? { isOld: true } : {};
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
	};
}

function toolResultFromMessageEntry(entry: SessionTreeEntry): Extract<ChatEntry, { type: "toolResult" }> | null {
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
	return entries.map(sessionTreeEntryToChatEntry);
}

export function sessionTreeEntryToChatEntry(entry: SessionTreeEntry): ChatEntry {
	const base = entry.isOld ? { isOld: true } : {};
	if (entry.type === "system") {
		return { ...base, id: entry.id, type: "system", content: entry.content ?? "", createdAt: entry.createdAt };
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

	if (entry.type === "toolResult") {
		const content = (entry as SessionTreeEntry & { content?: Array<{ type: string; text: string }> }).content ?? [];
		return toolResultChatEntry(entry, {
			toolCallId: entry.toolCallId,
			toolName: entry.toolName,
			content,
		});
	}
	return {
		...base,
		id: entry.id,
		type: "message",
		createdAt: entry.createdAt,
		message: entry.message ?? { role: "assistant", content: "" },
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

export function createUserChatEntry(id: string, text: string): ChatEntry {
	return {
		id,
		type: "message",
		createdAt: Date.now(),
		message: { role: "user", content: text },
	};
}

export function applyAgentEventToChatEntries(entries: ChatEntry[], assistantId: string, event: AgentEvent): void {
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
		entry.message.content.push(part);
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
