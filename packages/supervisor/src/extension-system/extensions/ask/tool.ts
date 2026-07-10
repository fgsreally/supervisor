import type { AgentTool } from "@earendil-works/pi-agent-core";

export interface AskOption {
	value: string;
	label: string;
	description?: string;
}

export interface AskQuestion {
	id: string;
	label: string;
	prompt: string;
	options: AskOption[];
	allowOther?: boolean;
}

export interface AskAnswer {
	id: string;
	value: string;
	label: string;
	wasCustom?: boolean;
}

export interface AskResultDetails {
	questions: AskQuestion[];
	answers: AskAnswer[];
	cancelled: boolean;
}

type ToolResultPayload = {
	content: Array<{ type: "text"; text: string }>;
	details: AskResultDetails;
};

interface PendingAsk {
	questions: AskQuestion[];
	resolve: (result: ToolResultPayload) => void;
	reject: (error: Error) => void;
	abortHandler?: () => void;
}

const pendingBySession = new Map<string, Map<string, PendingAsk>>();

export interface AskToolHooks {
	onPending?: () => void;
	onResolved?: () => void;
}

const hooksBySession = new Map<string, AskToolHooks>();

export function hasPendingAsks(sessionId: string | number): boolean {
	const sessionMap = pendingBySession.get(String(sessionId));
	return !!sessionMap && sessionMap.size > 0;
}

function normalizeQuestions(params: unknown): AskQuestion[] {
	if (!params || typeof params !== "object" || !("questions" in params)) return [];
	const raw = (params as { questions: unknown }).questions;
	if (!Array.isArray(raw)) return [];
	const out: AskQuestion[] = [];
	for (let index = 0; index < raw.length; index++) {
		const q = raw[index];
		if (!q || typeof q !== "object") continue;
		const item = q as Record<string, unknown>;
		const options: AskOption[] = [];
		if (Array.isArray(item.options)) {
			for (const opt of item.options) {
				if (!opt || typeof opt !== "object") continue;
				const o = opt as Record<string, unknown>;
				if (typeof o.value !== "string" || typeof o.label !== "string") continue;
				options.push({
					value: o.value,
					label: o.label,
					...(typeof o.description === "string" ? { description: o.description } : {}),
				});
			}
		}
		if (!options.length || typeof item.prompt !== "string") continue;
		const id = typeof item.id === "string" ? item.id : `q${index + 1}`;
		out.push({
			id,
			label: typeof item.label === "string" ? item.label : `Q${index + 1}`,
			prompt: item.prompt,
			options,
			allowOther: item.allowOther !== false,
		});
	}
	return out;
}

function cleanupPending(sessionId: string | number, toolCallId: string): void {
	const key = String(sessionId);
	const sessionMap = pendingBySession.get(key);
	sessionMap?.delete(toolCallId);
	if (sessionMap && sessionMap.size === 0) pendingBySession.delete(key);
	if (!hasPendingAsks(key)) {
		hooksBySession.get(key)?.onResolved?.();
	}
}

export function submitAskAnswer(sessionId: string | number, toolCallId: string, answers: AskAnswer[]): boolean {
	const key = String(sessionId);
	const pending = pendingBySession.get(key)?.get(toolCallId);
	if (!pending) return false;

	const text = answers.map((a) => a.label).join(" · ") || "（无选择）";
	pending.resolve({
		content: [{ type: "text", text }],
		details: {
			questions: pending.questions,
			answers,
			cancelled: false,
		},
	});
	cleanupPending(key, toolCallId);
	return true;
}

export function cancelPendingAsks(sessionId: string | number): void {
	const key = String(sessionId);
	const sessionMap = pendingBySession.get(key);
	if (!sessionMap) return;
	for (const [toolCallId, pending] of sessionMap) {
		pending.resolve({
			content: [{ type: "text", text: "User cancelled" }],
			details: {
				questions: pending.questions,
				answers: [],
				cancelled: true,
			},
		});
		cleanupPending(key, toolCallId);
	}
}

export function createAskTool(sessionId: string | number, hooks?: AskToolHooks): AgentTool {
	const key = String(sessionId);
	if (hooks) hooksBySession.set(key, hooks);
	return {
		name: "ask",
		label: "Ask",
		description:
			"Ask the user one or more multiple-choice questions. Use when you need a decision or preference from the user before continuing.",
		parameters: {
			type: "object",
			properties: {
				questions: {
					type: "array",
					description: "Questions to ask the user",
					items: {
						type: "object",
						properties: {
							id: { type: "string" },
							label: { type: "string" },
							prompt: { type: "string" },
							options: {
								type: "array",
								items: {
									type: "object",
									properties: {
										value: { type: "string" },
										label: { type: "string" },
										description: { type: "string" },
									},
									required: ["value", "label"],
								},
							},
							allowOther: { type: "boolean" },
						},
						required: ["prompt", "options"],
					},
				},
			},
			required: ["questions"],
		},
		async execute(toolCallId, params, signal) {
			const questions = normalizeQuestions(params);
			if (!questions.length) {
				throw new Error("ask tool requires at least one question with options");
			}

			return new Promise<ToolResultPayload>((resolve, reject) => {
				const sessionMap = pendingBySession.get(key) ?? new Map<string, PendingAsk>();
				const onAbort = () => {
					resolve({
						content: [{ type: "text", text: "User cancelled" }],
						details: { questions, answers: [], cancelled: true },
					});
					cleanupPending(key, toolCallId);
				};

				if (signal?.aborted) {
					onAbort();
					return;
				}
				signal?.addEventListener("abort", onAbort, { once: true });

				sessionMap.set(toolCallId, {
					questions,
					resolve: (result) => {
						signal?.removeEventListener("abort", onAbort);
						resolve(result);
					},
					reject: (error) => {
						signal?.removeEventListener("abort", onAbort);
						reject(error);
					},
				});
				pendingBySession.set(key, sessionMap);
				hooksBySession.get(key)?.onPending?.();
			});
		},
	};
}
