import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { loadPiNativesBindings, type GrepMatch } from "../pi-natives-loader.js";

const DEFAULT_LIMIT = 100;
const GREP_TIMEOUT_MS = 30_000;

const grepSchema = Type.Object({
  pattern: Type.String({ description: "Search pattern (regex or literal string)" }),
  path: Type.Optional(Type.String({ description: "Directory or file to search (default: current directory)" })),
  glob: Type.Optional(Type.String({ description: "Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'" })),
  ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search (default: false)" })),
  literal: Type.Optional(Type.Boolean({ description: "Treat pattern as literal string instead of regex (default: false)" })),
  context: Type.Optional(Type.Number({ description: "Number of lines to show before and after each match (default: 0)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of matches to return (default: 100)" })),
});

type GrepParams = {
  pattern: string;
  path?: string;
  glob?: string;
  ignoreCase?: boolean;
  literal?: boolean;
  context?: number;
  limit?: number;
};

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatGrepMatch(match: GrepMatch, context: number): string[] {
  const lines: string[] = [];
  if (context > 0 && match.contextBefore?.length) {
    for (const ctx of match.contextBefore) {
      lines.push(`${match.path}-${ctx.lineNumber}-${ctx.line}`);
    }
  }
  lines.push(`${match.path}:${match.lineNumber}:${match.line}`);
  if (context > 0 && match.contextAfter?.length) {
    for (const ctx of match.contextAfter) {
      lines.push(`${match.path}-${ctx.lineNumber}-${ctx.line}`);
    }
  }
  return lines;
}

export function createNativeGrepTool(sessionCwd: string): AgentTool {
  return {
    name: "grep",
    label: "grep",
    description:
      `Search file contents via omp Rust grep (pi-natives). Returns matching lines with file paths and line numbers. ` +
      `Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} matches by default.`,
    parameters: grepSchema,
    async execute(_toolCallId, params, signal) {
      const {
        pattern,
        path: searchDir,
        glob: globFilter,
        ignoreCase,
        literal,
        context,
        limit,
      } = params as GrepParams;

      if (!pattern?.trim()) {
        throw new Error("grep tool requires a non-empty `pattern` field.");
      }

      const searchPath = resolve(sessionCwd, searchDir?.trim() || ".");
      if (!existsSync(searchPath)) {
        throw new Error(`Path not found: ${searchPath}`);
      }

      const contextValue = context && context > 0 ? Math.floor(context) : 0;
      const effectiveLimit = Math.max(1, limit ?? DEFAULT_LIMIT);
      const natives = loadPiNativesBindings();

      const result = await natives.grep(
        {
          pattern: literal ? escapeRegexLiteral(pattern) : pattern,
          path: searchPath,
          glob: globFilter,
          ignoreCase: ignoreCase ?? false,
          maxCount: effectiveLimit,
          contextBefore: contextValue,
          contextAfter: contextValue,
          mode: "content",
          gitignore: true,
          signal,
          timeoutMs: GREP_TIMEOUT_MS,
        },
        null,
      );

      if (result.matches.length === 0) {
        return {
          content: [{ type: "text", text: "No matches found" }],
          details: { engine: "pi-natives", totalMatches: 0 },
        };
      }

      const outputLines: string[] = [];
      for (const match of result.matches) {
        outputLines.push(...formatGrepMatch(match, contextValue));
      }

      let text = outputLines.join("\n");
      const notices: string[] = [];
      if (result.limitReached) {
        notices.push(`${effectiveLimit} matches limit reached`);
      }
      if (result.skippedOversized && result.skippedOversized > 0) {
        notices.push(`${result.skippedOversized} oversized files skipped`);
      }
      if (notices.length > 0) {
        text += `\n\n[${notices.join(". ")}]`;
      }

      return {
        content: [{ type: "text", text }],
        details: {
          engine: "pi-natives",
          totalMatches: result.totalMatches,
          filesWithMatches: result.filesWithMatches,
          filesSearched: result.filesSearched,
          limitReached: result.limitReached,
        },
      };
    },
  };
}
