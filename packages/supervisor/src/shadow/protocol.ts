import { DEFAULT_PARENT_MESSAGE_LEVEL } from "../core/session-input-queue.js";
import type { ShadowProtocolResult } from "./types.js";

function extractJsonCandidate(text: string): string {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenced?.[1]) return fenced[1].trim();
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start >= 0 && end > start) return text.slice(start, end + 1);
	return text.trim();
}

function normalizeParentLevel(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return DEFAULT_PARENT_MESSAGE_LEVEL;
}

export function parseShadowProtocolResponse(text: string): ShadowProtocolResult | null {
	const candidate = extractJsonCandidate(text);
	if (!candidate) return null;
	try {
		const parsed = JSON.parse(candidate) as ShadowProtocolResult & {
			parent?: { priority?: unknown; level?: unknown };
		};
		if (parsed.parent) {
			const level =
				parsed.parent.level !== undefined
					? normalizeParentLevel(parsed.parent.level)
					: parsed.parent.priority !== undefined
						? normalizeParentLevel(parsed.parent.priority)
						: DEFAULT_PARENT_MESSAGE_LEVEL;
			parsed.parent = {
				message: parsed.parent.message,
				level,
			};
		}
		return parsed;
	} catch {
		return null;
	}
}

export function formatShadowRunPrompt(memory: string, latestTurn: string): string {
	return [
		"## Memory",
		memory.trim() || "(empty)",
		"",
		"## Latest turn",
		latestTurn.trim() || "(empty)",
		"",
		"Respond with the shadow JSON protocol only.",
	].join("\n");
}
