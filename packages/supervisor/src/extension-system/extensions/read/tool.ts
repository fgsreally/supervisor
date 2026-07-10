import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { SearchMatch } from "./read-orchestration.js";

const execAsync = promisify(exec);

interface ReadParams {
	path: string;
	offset?: number;
	limit?: number;
	pattern?: string;
	regex?: boolean;
	ignoreCase?: boolean;
	context?: number;
	occurrence?: number;
	maxMatches?: number;
	// search_and_read parameters
	query?: string;
	glob?: string;
	maxResults?: number;
}

function normalizeLines(content: string): string[] {
	return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function ensurePositiveInt(value: number | undefined, fallback: number): number {
	if (value === undefined || !Number.isFinite(value)) return fallback;
	return Math.max(1, Math.floor(value));
}

function formatLine(lineNumber: number, text: string): string {
	return `${lineNumber}|${text}`;
}

function clipSnippet(text: string, max = 180): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 3)}...`;
}

function buildMatcher(pattern: string, regex: boolean, ignoreCase: boolean): (text: string) => boolean {
	if (regex) {
		const compiled = new RegExp(pattern, ignoreCase ? "i" : undefined);
		return (text: string) => compiled.test(text);
	}
	const needle = ignoreCase ? pattern.toLowerCase() : pattern;
	return (text: string) => (ignoreCase ? text.toLowerCase().includes(needle) : text.includes(needle));
}

function renderLineRange(lines: string[], offset: number, limit: number): string {
	const start = clamp(offset, 1, Math.max(lines.length, 1));
	const end = Math.min(lines.length, start + limit - 1);
	const block: string[] = [];
	for (let lineNo = start; lineNo <= end; lineNo++) {
		block.push(formatLine(lineNo, lines[lineNo - 1] ?? ""));
	}
	const remain = lines.length - end;
	if (remain > 0) {
		block.push("");
		block.push(`[${remain} more lines. Use offset=${end + 1} to continue.]`);
	}
	return block.join("\n");
}

/**
 * Execute a grep search across the filesystem and return structured matches.
 *
 * Uses -n (line numbers), -H (always show filename), --no-heading.
 * If `glob` is provided, find + grep is used with the glob pattern.
 * If no glob, grep searches recursively from cwd.
 */
async function grepSearch(
	cwd: string,
	query: string,
	glob?: string,
	context = 3,
	maxResults = 10,
	isFixedString = false,
	ignoreCase = false,
): Promise<SearchMatch[]> {
	const isRegex = !isFixedString;

	// Build grep flags
	const flags = ["-n", "-H", "--no-heading", "--color=never"];
	if (context > 0) flags.push("-C", String(context));
	if (ignoreCase) flags.push("-i");
	if (isRegex) flags.push("-E");
	else flags.push("-F");

	if (glob) {
		// Use find + exec grep for glob-filtered search
		const findPath = resolve(cwd);
		const findFlags = ["-type", "f"];
		const globParts = glob.replace(/^\.\//, "").split("/");
		const fileNamePart = globParts[globParts.length - 1] ?? "*";
		if (globParts.length > 1) {
			const dirPrefix = globParts.slice(0, -1).join("/");
			findFlags.push("-path", `*/${dirPrefix}/${fileNamePart}`);
		} else {
			findFlags.push("-name", fileNamePart);
		}

		const findCmd = ["find", findPath, ...findFlags];
		const grepFlagsStr = flags.join(" ");
		const escapedQuery = query.replace(/'/g, "'\\''");
		const cmd = `${findCmd.map((s) => (s.includes(" ") ? `'${s}'` : s)).join(" ")} -exec grep ${grepFlagsStr} -- '${escapedQuery}' {} +`;
		const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 15000 });
		return parseGrepOutput(stdout, context, maxResults);
	}

	// No glob: recursive grep from cwd
	const searchPath = resolve(cwd);
	const grepFlagsStr = flags.join(" ");
	const escapedQuery = query.replace(/'/g, "'\\''");
	const searchPathStr = searchPath.includes(" ") ? `'${searchPath}'` : searchPath;
	const cmd = `grep ${grepFlagsStr} -I -r -- '${escapedQuery}' ${searchPathStr}`;

	const { stdout } = await execAsync(cmd, {
		maxBuffer: 10 * 1024 * 1024,
		timeout: 15000,
	});

	return parseGrepOutput(stdout, context, maxResults);
}

/**
 * Parse grep -n -H output into SearchMatch[].
 *
 * Expected format:
 *   Match lines:    filepath:lineno:content
 *   Context before: filepath-lineno-content
 *   Context after:  filepath-lineno-content  (same format)
 *   Group separator: --
 *
 * Handles both GNU grep and BSD grep (macOS).
 */
function parseGrepOutput(raw: string, _context: number, maxResults: number): SearchMatch[] {
	if (!raw.trim()) return [];

	const results: SearchMatch[] = [];
	const matchRe = /^([^:]+):(\d+):(.*)$/;
	const contextRe = /^([^:]+)-(\d+)-(.*)$/;

	const lines = raw.split("\n");
	let currentBefore: string[] = [];
	let currentAfter: string[] = [];
	let currentFile = "";
	let currentLine = 0;
	let currentContent = "";

	const flush = () => {
		if (currentFile) {
			results.push({
				file: currentFile,
				line: currentLine,
				content: currentContent,
				before: currentBefore,
				after: currentAfter,
			});
			currentFile = "";
			currentBefore = [];
			currentAfter = [];
		}
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (line === "--") {
			flush();
			continue;
		}

		const m = matchRe.exec(line);
		if (m) {
			flush();
			if (results.length >= maxResults) break;
			currentFile = m[1]!;
			currentLine = parseInt(m[2]!, 10);
			currentContent = m[3]!;
			continue;
		}

		// Context lines only apply after a match line
		if (!currentFile) continue;

		const ctx = contextRe.exec(line);
		if (ctx) {
			currentAfter.push(ctx[3]!);
		}
	}

	flush();

	return results;
}

export function createOverrideReadTool(cwd: string): AgentTool {
	return {
		name: "read",
		label: "read",
		description:
			"Pattern-based precise file reader with cross-file search. Modes: (1) range mode (default): read a line range from a file. (2) pattern mode: find pattern matches inside a file with context. (3) search_and_read mode: grep across multiple files and return structured results with context. For cross-file search, provide `query` and optional `glob` instead of `path`.",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "File path (relative to current session cwd or absolute). Required for range/pattern mode." },
				offset: { type: "number", description: "Start line (1-based). Default 1." },
				limit: { type: "number", description: "Max lines to read. Default 200." },
				pattern: {
					type: "string",
					description:
						"Optional grep-like pattern. When provided, read returns matched lines or contextual block.",
				},
				regex: { type: "boolean", description: "Treat pattern as regular expression. Default false." },
				ignoreCase: { type: "boolean", description: "Case-insensitive pattern match. Default false." },
				context: { type: "number", description: "Context lines around match (pattern mode) or around each grep result (search_and_read mode). Default 2 (pattern) or 3 (search_and_read)." },
				occurrence: {
					type: "number",
					description:
						"1-based matched occurrence to inspect. If omitted and multiple matches exist, read lists matches.",
				},
				maxMatches: { type: "number", description: "Max matches in listing mode. Default 20." },
				// search_and_read parameters
				query: {
					type: "string",
					description:
						"Cross-file search query (text or regex, depending on `regex` flag). Triggers search_and_read mode. Provide instead of `path` to search across multiple files.",
				},
				glob: {
					type: "string",
					description:
						"File glob for search_and_read mode, e.g. 'src/**/*.ts' or '**/*.py'. Limits search to matching files.",
				},
				maxResults: {
					type: "number",
					description:
						"Max grep results in search_and_read mode. Default 10.",
				},
			},
			required: [],
		},
		async execute(_toolCallId, rawParams) {
			const params = rawParams as ReadParams;

			// Detect mode
			const hasQuery = typeof params.query === "string" && params.query.trim().length > 0;
			const hasPath = typeof params.path === "string" && params.path.trim().length > 0;

			// -- Mode 3: search_and_read (cross-file grep) --
			if (hasQuery) {
				const query = params.query!.trim();
				const grepContext = clamp(ensurePositiveInt(params.context, 3), 0, 15);
				const maxResults = clamp(ensurePositiveInt(params.maxResults ?? params.maxMatches, 10), 1, 100);
				const isFixedString = !Boolean(params.regex);
				const ignoreCase = Boolean(params.ignoreCase);

				const results = await grepSearch(cwd, query, params.glob, grepContext, maxResults, isFixedString, ignoreCase);
				if (results.length === 0) {
					return {
						content: [{ type: "text", text: `No matches found for query "${query}".` }],
						details: { mode: "search_and_read", matchCount: 0, query },
					};
				}

				// Group by file for output
				const byFile = new Map<string, SearchMatch[]>();
				for (const m of results) {
					const list = byFile.get(m.file) ?? [];
					list.push(m);
					byFile.set(m.file, list);
				}

				const output: string[] = [];
				output.push(`Found ${results.length} match(es) for "${query}" across ${byFile.size} file(s):`);
				output.push("");

				let idx = 0;
				for (const [file, matches] of byFile) {
					output.push(`  ${file} (${matches.length} match(es))`);
					for (const m of matches) {
						idx++;
						const ctxBefore = m.before.length > 0 ? ` | before: ${m.before.length} line(s)` : "";
						const ctxAfter = m.after.length > 0 ? ` | after: ${m.after.length} line(s)` : "";
						output.push(`    [${idx}] L${m.line}: ${clipSnippet(m.content, 140)}${ctxBefore}${ctxAfter}`);
						if (m.before.length > 0) {
							for (const bl of m.before) {
								output.push(`         before: ${clipSnippet(bl, 140)}`);
							}
						}
						if (m.after.length > 0) {
							for (const al of m.after) {
								output.push(`         after:  ${clipSnippet(al, 140)}`);
							}
						}
					}
					output.push("");
				}

				output.push("Tip: use read path=<file> offset=<line> to read context around a match.");

				return {
					content: [{ type: "text", text: output.join("\n") }],
					details: { mode: "search_and_read", matchCount: results.length, files: byFile.size, query },
				};
			}

			// -- Modes 1 & 2 require a path --
			if (!hasPath) {
				throw new Error("read requires either a `path` (for range/pattern mode) or a `query` (for search_and_read mode)");
			}
			const absolutePath = resolve(cwd, params.path);
			const fileContent = await readFile(absolutePath, "utf-8");
			const lines = normalizeLines(fileContent);

			// -- Mode 1: range mode (no pattern) --
			if (!params.pattern) {
				const offset = ensurePositiveInt(params.offset, 1);
				const limit = clamp(ensurePositiveInt(params.limit, 200), 1, 1000);
				if (lines.length > 0 && offset > lines.length) {
					throw new Error(`Offset ${offset} is beyond end of file (${lines.length} lines total)`);
				}
				const text =
					lines.length === 1 && lines[0] === "" ? "File is empty." : renderLineRange(lines, offset, limit);
				return {
					content: [{ type: "text", text }],
					details: { mode: "range", offset, limit, totalLines: lines.length },
				};
			}

			// -- Mode 2: pattern mode (in-file grep) --
			const matcher = buildMatcher(params.pattern, Boolean(params.regex), Boolean(params.ignoreCase));
			const matches: number[] = [];
			for (let i = 0; i < lines.length; i++) {
				if (matcher(lines[i] ?? "")) matches.push(i);
			}

			if (matches.length === 0) {
				return {
					content: [{ type: "text", text: `No matches found for pattern in ${params.path}.` }],
					details: { mode: "pattern", matchCount: 0 },
				};
			}

			const occurrence = params.occurrence ? ensurePositiveInt(params.occurrence, 1) : undefined;
			const patternContext = clamp(ensurePositiveInt(params.context, 2), 0, 30);
			if (occurrence !== undefined) {
				if (occurrence > matches.length) {
					throw new Error(`occurrence ${occurrence} out of range (found ${matches.length} matches)`);
				}
				const target = matches[occurrence - 1]!;
				const start = Math.max(0, target - patternContext);
				const end = Math.min(lines.length - 1, target + patternContext);
				const block: string[] = [];
				for (let i = start; i <= end; i++) {
					block.push(formatLine(i + 1, lines[i] ?? ""));
				}
				return {
					content: [
						{
							type: "text",
							text: [
								`Matched ${matches.length} lines. Showing occurrence ${occurrence}/${matches.length} with context=${patternContext}.`,
								"",
								...block,
							].join("\n"),
						},
					],
					details: { mode: "pattern", matchCount: matches.length, occurrence, context: patternContext },
				};
			}

			if (matches.length === 1) {
				const target = matches[0]!;
				const start = Math.max(0, target - patternContext);
				const end = Math.min(lines.length - 1, target + patternContext);
				const block: string[] = [];
				for (let i = start; i <= end; i++) {
					block.push(formatLine(i + 1, lines[i] ?? ""));
				}
				return {
					content: [
						{
							type: "text",
							text: [`Found 1 match with context=${patternContext}.`, "", ...block].join("\n"),
						},
					],
					details: { mode: "pattern", matchCount: 1, occurrence: 1, context: patternContext },
				};
			}

			const maxMatches = clamp(ensurePositiveInt(params.maxMatches, 20), 1, 200);
			const summary = matches.slice(0, maxMatches).map((lineIndex, index) => {
				const line = lines[lineIndex] ?? "";
				return `${index + 1}. ${lineIndex + 1}|${clipSnippet(line)}`;
			});
			const remain = matches.length - summary.length;

			const output = [
				`Found ${matches.length} matches in ${params.path}.`,
				"Use occurrence=N to inspect one match with full context.",
				"",
				...summary,
			];
			if (remain > 0) {
				output.push("", `[${remain} more matches not shown. Increase maxMatches if needed.]`);
			}

			return {
				content: [{ type: "text", text: output.join("\n") }],
				details: { mode: "pattern", matchCount: matches.length, listed: summary.length },
			};
		},
	};
}
