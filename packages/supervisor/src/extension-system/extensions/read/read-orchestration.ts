/**
 * Two-phase read orchestration guidance injected into coding sessions.
 * Stage 1: grep/lsp to locate. Stage 2: read for focused context.
 */
export const READ_ORCHESTRATION_HINT = `## Reading strategy (two-phase)

When exploring code before editing:

1. **Locate** with \`grep\` (cross-file text search) or \`lsp\` (symbols, definition, references).
2. **Read** the target file with \`read\` using offset/limit around the located line. Do not read whole large files unless necessary.
3. After edits, use \`lsp\` diagnostics (and rename when renaming symbols) to verify impact.

Prefer \`grep\` + \`read\` for text patterns; prefer \`lsp\` for symbol structure and cross-file relationships.`;

export function appendReadOrchestrationHint(systemPrompt: string): string {
	if (!systemPrompt.trim()) return READ_ORCHESTRATION_HINT;
	if (systemPrompt.includes("Reading strategy (two-phase)")) return systemPrompt;
	return `${systemPrompt}\n\n${READ_ORCHESTRATION_HINT}`;
}

// ---------------------------------------------------------------------------
// Helper types and functions for the search_and_read workflow
// ---------------------------------------------------------------------------

/** A single match from a grep-style search. */
export interface SearchMatch {
	file: string;
	line: number;
	content: string;
	before: string[];
	after: string[];
}

/** Grouped results: one entry per file with its matches. */
export interface FileResult {
	file: string;
	matchCount: number;
	matches: SearchMatch[];
}

/**
 * Given a 1-based line number, suggest a read range (offset, limit) with
 * context lines before and after.  Clamps to avoid negative or
 * past-end-of-file offsets — the caller passes totalLines so we can clamp.
 */
export function suggestReadRange(line: number, totalLines: number, contextAfter = 30): { offset: number; limit: number } {
	const half = Math.floor(contextAfter / 2);
	const start = Math.max(1, line - half);
	const end = Math.min(totalLines, start + contextAfter - 1);
	return { offset: start, limit: Math.max(1, end - start + 1) };
}

/**
 * Format a list of SearchMatch results (typically grouped by file) into a
 * structured text block that an LLM can inspect and decide which file/line
 * to read next.
 */
export function formatGrepResultsToSearchSuggestion(results: SearchMatch[]): string {
	if (results.length === 0) return "No matches found.";

	// Group by file
	const byFile = new Map<string, SearchMatch[]>();
	for (const m of results) {
		const list = byFile.get(m.file) ?? [];
		list.push(m);
		byFile.set(m.file, list);
	}

	const lines: string[] = [];
	lines.push(`Found ${results.length} match(es) across ${byFile.size} file(s):`);
	lines.push("");

	let globalIdx = 0;
	for (const [file, matches] of byFile) {
		lines.push(`  ${file} (${matches.length} match(es))`);
		for (const m of matches) {
			globalIdx++;
			const ctxBefore = m.before.length > 0 ? ` | before: ${m.before.length} line(s)` : "";
			const ctxAfter = m.after.length > 0 ? ` | after: ${m.after.length} line(s)` : "";
			lines.push(`    [${globalIdx}] L${m.line}: ${m.content.trim()}${ctxBefore}${ctxAfter}`);
		}
	}

	lines.push("");
	lines.push("Tip: use read with offset=N to inspect context around a specific match.");
	lines.push("Or run search_and_read with a narrower query to refine.");

	return lines.join("\n");
}

/**
 * Build a read_pattern prepareArguments payload (or a textual suggestion) for
 * reading a specific match from a SearchMatch result.
 */
export function buildReadSuggestionForMatch(match: SearchMatch, maxLines = 40): { filePath: string; offset: number; limit: number } {
	const range = suggestReadRange(match.line, match.line + Math.max(match.before.length + match.after.length, 20), maxLines);
	return {
		filePath: match.file,
		offset: range.offset,
		limit: range.limit,
	};
}
