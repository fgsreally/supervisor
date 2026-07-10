import type { ChatEntry } from "@/types/chat-entry";
import { askResultSummary, isAskToolName, parseAskResultFromToolResult } from "./ask-tool";
import { isOldEntry } from "./session-branch";
import { toolResultDetail } from "./tool-display";

export type ToolResultEntry = Extract<ChatEntry, { type: "toolResult" }>;

export type RenderPiece =
	| { kind: "text"; text: string }
	| { kind: "thinking"; text: string }
	| {
			kind: "toolStep";
			callId: string;
			toolName: string;
			callArgs?: Record<string, unknown>;
			result?: ToolResultEntry;
	  }
	| {
			kind: "bash";
			callId: string;
			command: string;
			intent?: string;
			result?: ToolResultEntry;
	  };

export type DisplayGroup =
	| ChatEntry
	| {
			id: string;
			type: "grouped_assistant";
			role: "assistant";
			pieces: RenderPiece[];
			createdAt?: number;
			/** True when message was copied from parent session (is_old). */
			inherited?: boolean;
	  };

function attachResult(pieces: RenderPiece[], result: ToolResultEntry) {
	const bash = pieces.find(
		(p): p is Extract<RenderPiece, { kind: "bash" }> => p.kind === "bash" && p.callId === result.toolCallId,
	);
	if (bash) {
		bash.result = result;
		return;
	}
	const step = pieces.find(
		(p): p is Extract<RenderPiece, { kind: "toolStep" }> => p.kind === "toolStep" && p.callId === result.toolCallId,
	);
	if (step) {
		step.result = result;
		return;
	}
	pieces.push({
		kind: "toolStep",
		callId: result.toolCallId,
		toolName: result.toolName,
		result,
	});
}

function isSkillMarkdownDump(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) return false;
	return /^---\s*\r?\nname:\s*[\w-]+\s*\r?\n/m.test(trimmed) && trimmed.includes("description:");
}

function textDuplicatesToolOutput(text: string, toolText: string): boolean {
	const a = text.trim();
	const b = toolText.trim();
	if (!a || !b) return false;
	if (a === b) return true;
	if (b.length > 120 && a.length > 120 && (b.includes(a) || a.includes(b))) return true;
	return false;
}

function looksLikeToolEcho(text: string): boolean {
	return /Command exited with code|exit code:\s*\d+|WSL\s*\(|execvpe\(|Unknown key '.*' in \/etc\/wsl\.conf/i.test(
		text,
	);
}

/** Hide tool output echoed as assistant text in chat bubbles. */
export function compactAssistantPieces(pieces: RenderPiece[]): RenderPiece[] {
	const suppressed = new Set<string>();
	const hasTools = pieces.some((p) => p.kind === "bash" || p.kind === "toolStep");
	for (const piece of pieces) {
		if (piece.kind === "bash" && piece.result) {
			const detail = toolResultDetail(piece.result.content);
			if (detail.trim()) suppressed.add(detail.trim());
			continue;
		}
		if (piece.kind !== "toolStep" || !piece.result) continue;
		if (isAskToolName(piece.toolName)) {
			const details = parseAskResultFromToolResult({
				content: piece.result.content,
				details: piece.result.details,
			});
			const summary = askResultSummary(details);
			if (summary) suppressed.add(summary);
			const raw = toolResultDetail(piece.result.content).trim();
			if (raw.startsWith("{")) suppressed.add(raw);
			continue;
		}
		const detail = toolResultDetail(piece.result.content);
		if (!detail.trim()) continue;
		if (piece.toolName === "read" || piece.toolName === "write" || piece.toolName === "edit") {
			suppressed.add(detail.trim());
		} else {
			suppressed.add(detail.trim());
		}
	}

	return pieces.filter((piece) => {
		if (piece.kind !== "text") return true;
		const text = piece.text.trim();
		if (!text) return false;
		if (isSkillMarkdownDump(text)) return false;
		if (hasTools && looksLikeToolEcho(text)) return false;
		for (const blocked of suppressed) {
			if (textDuplicatesToolOutput(text, blocked)) return false;
		}
		return true;
	});
}

function appendMessagePieces(pieces: RenderPiece[], entry: Extract<ChatEntry, { type: "message" }>) {
	if (entry.message.role !== "assistant" && entry.message.role !== "user") return;
	const content = entry.message.content;
	if (typeof content === "string") {
		if (content.trim()) pieces.push({ kind: "text", text: content });
		return;
	}
	if (!Array.isArray(content)) return;

	for (const part of content) {
		if (part.type === "thinking") {
			const thinking = "thinking" in part && typeof part.thinking === "string" ? part.thinking.trim() : "";
			if (thinking) pieces.push({ kind: "thinking", text: thinking });
			continue;
		}
		if (part.type === "text") {
			if (part.text.trim()) pieces.push({ kind: "text", text: part.text });
		} else if (part.type === "toolCall" && part.name === "bash") {
			const command = typeof part.arguments.command === "string" ? part.arguments.command : "";
			const intent = typeof part.arguments.intent === "string" ? part.arguments.intent : undefined;
			pieces.push({ kind: "bash", callId: part.id, command, intent });
		} else if (part.type === "toolCall") {
			pieces.push({
				kind: "toolStep",
				callId: part.id,
				toolName: part.name,
				callArgs: part.arguments,
			});
		}
	}
}

/** One assistant bubble per user turn; tool results inline with calls. */
export function buildDisplayGroups(entries: ChatEntry[]): DisplayGroup[] {
	const groups: DisplayGroup[] = [];
	let current: Extract<DisplayGroup, { type: "grouped_assistant" }> | null = null;

	const flushAssistant = () => {
		if (current && current.pieces.length > 0) {
			current.pieces = compactAssistantPieces(current.pieces);
			if (current.pieces.length > 0) groups.push(current);
		}
		current = null;
	};

	for (const entry of entries) {
		if (entry.type === "compaction") {
			flushAssistant();
			groups.push(entry);
			continue;
		}

		if (entry.type === "system") {
			flushAssistant();
			groups.push(entry);
			continue;
		}

		if (entry.type === "message" && entry.message.role === "user") {
			flushAssistant();
			groups.push(entry);
			continue;
		}

		if (entry.type === "toolResult") {
			if (!current) {
				current = {
					id: entry.id,
					type: "grouped_assistant",
					role: "assistant",
					pieces: [],
					createdAt: entry.createdAt,
				};
			}
			if (isOldEntry(entry)) current.inherited = true;
			attachResult(current.pieces, entry);
			continue;
		}

		if (entry.type === "message") {
			if (!current) {
				current = {
					id: entry.id,
					type: "grouped_assistant",
					role: "assistant",
					pieces: [],
					createdAt: entry.createdAt,
				};
			}
			if (isOldEntry(entry)) current.inherited = true;
			if (entry.createdAt && !current.createdAt) current.createdAt = entry.createdAt;
			appendMessagePieces(current.pieces, entry);
		}
	}

	flushAssistant();
	return groups;
}

export function isGroupedAssistantGroup(
	group: DisplayGroup,
): group is Extract<DisplayGroup, { type: "grouped_assistant" }> {
	return group.type === "grouped_assistant" && "pieces" in group;
}

export function isDisplayGroupInherited(group: DisplayGroup): boolean {
	if (isGroupedAssistantGroup(group)) return !!group.inherited;
	return isOldEntry(group);
}

export function spawnChildSessionId(pieces: RenderPiece[], toolCallId: string): string | undefined {
	const step = pieces.find((p) => p.kind === "toolStep" && p.callId === toolCallId);
	if (!step || step.kind !== "toolStep") return undefined;

	// Prefer sessionId from tool result JSON (real API format)
	if (step.result?.content) {
		for (const part of step.result.content) {
			if (part.type === "text" && part.text) {
				try {
					const parsed = JSON.parse(part.text);
					if (typeof parsed?.sessionId === "string") return parsed.sessionId;
				} catch {
					// not JSON, continue
				}
			}
		}
	}

	// Fallback: childSessionId in callArgs (mock format)
	const id = step.callArgs?.childSessionId;
	return typeof id === "string" ? id : undefined;
}
