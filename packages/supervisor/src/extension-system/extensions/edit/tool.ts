import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { EditApprovalHooks, PendingEditApproval } from "./edit-approval.js";
import {
	storePendingEditApproval,
} from "./edit-approval.js";
import { findGitRoot, createGitSnapshot } from "../../../git/git-worktree.js";

interface EditItem {
	oldText: string;
	newText: string;
	occurrence?: number;
	beforeText?: string;
	afterText?: string;
	anchorWindowChars?: number;
}

interface EditParams {
	path: string;
	edits?: EditItem[];
	oldText?: string;
	newText?: string;
	occurrence?: number;
	beforeText?: string;
	afterText?: string;
	anchorWindowChars?: number;
}

function normalizeEdits(params: EditParams): EditItem[] {
	const edits: EditItem[] = Array.isArray(params.edits) ? [...params.edits] : [];
	if (typeof params.oldText === "string" && typeof params.newText === "string") {
		edits.push({
			oldText: params.oldText,
			newText: params.newText,
			occurrence: params.occurrence,
			beforeText: params.beforeText,
			afterText: params.afterText,
			anchorWindowChars: params.anchorWindowChars,
		});
	}
	return edits;
}

function findAllIndices(content: string, target: string): number[] {
	const matches: number[] = [];
	let startIndex = 0;
	while (true) {
		const index = content.indexOf(target, startIndex);
		if (index === -1) break;
		matches.push(index);
		startIndex = index + target.length;
	}
	return matches;
}

function filterMatchesByAnchors(content: string, matches: number[], edit: EditItem): number[] {
	const beforeText = edit.beforeText?.trim();
	const afterText = edit.afterText?.trim();
	if (!beforeText && !afterText) return matches;
	const windowSize = Math.max(1, Math.floor(edit.anchorWindowChars ?? 2400));
	return matches.filter((start) => {
		const end = start + edit.oldText.length;
		if (beforeText) {
			const beforeWindow = content.slice(Math.max(0, start - windowSize), start);
			if (!beforeWindow.includes(beforeText)) return false;
		}
		if (afterText) {
			const afterWindow = content.slice(end, Math.min(content.length, end + windowSize));
			if (!afterWindow.includes(afterText)) return false;
		}
		return true;
	});
}

function computeDiff(original: string, modified: string, filePath: string): string {
	const origLines = original.split("\n");
	const modLines = modified.split("\n");
	const result: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

	// Find all differing line ranges
	let i = 0;
	const maxLen = Math.max(origLines.length, modLines.length);
	while (i < maxLen) {
		if (origLines[i] !== modLines[i]) {
			const hunkStart = Math.max(0, i - 2);
			const hunkEnd = Math.min(maxLen, i + 3);
			const contextLines: string[] = [];
			const removedLines: string[] = [];
			const addedLines: string[] = [];
			for (let j = hunkStart; j < hunkEnd; j++) {
				if (j < i) {
					contextLines.push(` ${origLines[j] ?? ""}`);
				} else if (j < origLines.length && j < modLines.length && origLines[j] === modLines[j]) {
					contextLines.push(` ${origLines[j]}`);
				} else {
					if (j < origLines.length) removedLines.push(`-${origLines[j]}`);
					if (j < modLines.length) addedLines.push(`+${modLines[j]}`);
				}
			}
			const linesA = (i - hunkStart) + (origLines.length - i);
			const linesB = (i - hunkStart) + (modLines.length - i);
			result.push(`@@ -${hunkStart + 1},${linesA} +${hunkStart + 1},${linesB} @@`);
			for (const line of [...contextLines, ...removedLines, ...addedLines]) {
				result.push(line);
			}
			break; // Show first diff hunk
		}
		i++;
	}

	if (i >= maxLen) {
		result.push("(no differences)");
	}

	return result.join("\n");
}

export function createOverrideEditTool(
	cwd: string,
	sessionId?: string,
	hooks?: EditApprovalHooks,
	options?: { logFile?: { log: (level: string, message: string, tags?: string[], meta?: Record<string, unknown>) => Promise<void> } },
): AgentTool {
	return {
		name: "edit",
		label: "edit",
		description:
			"Edit file content by exact replacement with optional context anchors (beforeText/afterText). Safer when oldText appears multiple times.",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "File path (relative to current session cwd or absolute)." },
				requireApproval: {
					type: "boolean",
					description: "When true, pause and ask the user to approve the edit before applying.",
				},
				edits: {
					type: "array",
					description: "List of replacement edits.",
					items: {
						type: "object",
						properties: {
							oldText: { type: "string" },
							newText: { type: "string" },
							occurrence: {
								type: "number",
								description: "1-based occurrence index when oldText appears multiple times.",
							},
							beforeText: {
								type: "string",
								description: "Optional anchor text expected before oldText (within anchorWindowChars).",
							},
							afterText: {
								type: "string",
								description: "Optional anchor text expected after oldText (within anchorWindowChars).",
							},
							anchorWindowChars: {
								type: "number",
								description: "Anchor scan window size in chars (default 2400).",
							},
						},
						required: ["oldText", "newText"],
					},
				},
				oldText: { type: "string", description: "Legacy single-edit old text." },
				newText: { type: "string", description: "Legacy single-edit replacement text." },
				occurrence: { type: "number", description: "Legacy single-edit 1-based occurrence index." },
				beforeText: { type: "string", description: "Legacy single-edit anchor before oldText." },
				afterText: { type: "string", description: "Legacy single-edit anchor after oldText." },
				anchorWindowChars: { type: "number", description: "Legacy single-edit anchor scan window size." },
			},
			required: ["path"],
		},
		async execute(toolCallId, rawParams, signal) {
			const params = rawParams as EditParams & { requireApproval?: boolean };
			if (!params || typeof params !== "object" || typeof params.path !== "string" || !params.path.trim()) {
				throw new Error("edit requires a non-empty path");
			}
			const edits = normalizeEdits(params);
			if (edits.length === 0) {
				throw new Error("edit requires at least one edit (edits[] or oldText/newText)");
			}

			const absolutePath = resolve(cwd, params.path);
			const original = await readFile(absolutePath, "utf-8");
			let next = original;

			for (const [index, edit] of edits.entries()) {
				if (!edit || typeof edit.oldText !== "string" || typeof edit.newText !== "string") {
					throw new Error(`edits[${index}] is invalid`);
				}
				if (!edit.oldText.length) {
					throw new Error(`edits[${index}].oldText must not be empty`);
				}

				const rawMatches = findAllIndices(next, edit.oldText);
				if (rawMatches.length === 0) {
					throw new Error(`Could not find edits[${index}] target text in ${params.path}`);
				}
				const matches = filterMatchesByAnchors(next, rawMatches, edit);
				if (matches.length === 0) {
					throw new Error(
						`Could not find edits[${index}] target with anchors in ${params.path}. Check beforeText/afterText.`,
					);
				}

				const rawOccurrence = edit.occurrence;
				const hasOccurrence = rawOccurrence !== undefined;
				if (hasOccurrence && (!Number.isInteger(rawOccurrence) || rawOccurrence < 1)) {
					throw new Error(`edits[${index}].occurrence must be a positive integer`);
				}
				if (!hasOccurrence && matches.length > 1) {
					throw new Error(
						`edits[${index}] is ambiguous (${matches.length} matches). Provide occurrence or beforeText/afterText to disambiguate.`,
					);
				}
				const occurrence = hasOccurrence ? rawOccurrence : 1;
				if (occurrence > matches.length) {
					throw new Error(
						`edits[${index}] occurrence ${occurrence} out of range (found ${matches.length} matches)`,
					);
				}

				const start = matches[occurrence - 1];
				next = next.slice(0, start) + edit.newText + next.slice(start + edit.oldText.length);
			}

			if (next === original) {
				return {
					content: [{ type: "text", text: `No changes made in ${params.path}.` }],
					details: { changed: false, edits: edits.length },
				};
			}

			// Compute diff preview
			const diff = computeDiff(original, next, params.path);

			// Git snapshot (best-effort) — capture pre-edit state
			if (sessionId) {
				try {
					const gitRoot = await findGitRoot(cwd);
					if (gitRoot) {
						await createGitSnapshot(cwd).catch(() => {});
					}
				} catch {
					// not in a git repo or snapshot failed
				}
			}

			// Approval flow: if sessionId is provided and requireApproval is set, pause for user confirmation
			const requireApproval = params.requireApproval === true;
			if (requireApproval && sessionId) {
				return new Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }>((resolve, reject) => {
					const onAbort = () => {
						resolve({
							content: [{ type: "text", text: `Edit cancelled for ${params.path}.` }],
							details: { changed: false, edits: edits.length, cancelled: true },
						});
					};

					if (signal?.aborted) {
						onAbort();
						return;
					}
					signal?.addEventListener("abort", onAbort, { once: true });

					const approval: PendingEditApproval = {
						filePath: params.path,
						originalContent: original,
						modifiedContent: next,
						diff,
						resolve: async (approved: boolean) => {
							signal?.removeEventListener("abort", onAbort);
							if (approved) {
								try {
									await writeFile(absolutePath, next, "utf-8");
									// Log the edit change
									if (options?.logFile) {
										void options.logFile.log("info", `edit applied to ${params.path}`, ["edit"], {
											filePath: params.path,
											edits: edits.length,
											diff,
										}).catch(() => {});
									}
									resolve({
										content: [{ type: "text", text: `Updated ${params.path} with ${edits.length} edit(s).` }],
										details: { changed: true, edits: edits.length, approved: true, diff },
									});
								} catch (err: unknown) {
									const message = err instanceof Error ? err.message : String(err);
									reject(new Error(`Failed to write ${params.path}: ${message}`));
								}
							} else {
								resolve({
									content: [{ type: "text", text: `Edit rejected for ${params.path}. No changes made.` }],
									details: { changed: false, edits: edits.length, approved: false, diff },
								});
							}
						},
						reject: (err: Error) => {
							signal?.removeEventListener("abort", onAbort);
							reject(err);
						},
					};

					storePendingEditApproval(sessionId!, toolCallId, approval, hooks);
				});
			}

			// No approval required — apply directly
			await writeFile(absolutePath, next, "utf-8");

			// Log the edit change
			if (options?.logFile) {
				void options.logFile.log("info", `edit applied to ${params.path}`, ["edit"], {
					filePath: params.path,
					edits: edits.length,
					diff,
				}).catch(() => {});
			}

			return {
				content: [{ type: "text", text: `Updated ${params.path} with ${edits.length} edit(s).` }],
				details: { changed: true, edits: edits.length, diff },
			};
		},
	};
}
