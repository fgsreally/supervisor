import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import {
  loadPiNativesBindings,
  type AstFindMatch,
  type SummaryResult,
} from "../pi-natives-loader.js";
import { prependSuffixNotice, resolveReadablePath } from "../utils/path-resolve.js";

const AST_TIMEOUT_MS = 30_000;

const astGrepSchema = Type.Object({
  pattern: Type.String({
    description:
      "AST pattern (ast-grep syntax). Example: 'console.log($$ARG)'. Required for search/edit.",
  }),
  path: Type.Optional(
    Type.String({
      description:
        "File or directory. Required for summary/edit; optional for search (defaults to workspace).",
    }),
  ),
  maxResults: Type.Optional(Type.Number({ description: "Max results (default 20)." })),
  action: Type.Optional(
    Type.Union([Type.Literal("search"), Type.Literal("summary"), Type.Literal("edit")], {
      description: 'Mode: "search" (default), "summary", or "edit".',
    }),
  ),
  rewrite: Type.Optional(
    Type.String({ description: "Replacement text for action=edit (supports $$VAR / $$$VAR)." }),
  ),
});

type AstGrepParams = {
  pattern?: string;
  path?: string;
  maxResults?: number;
  action?: "search" | "summary" | "edit";
  rewrite?: string;
};

function formatMatch(match: AstFindMatch): string {
  const header = `${match.path}:${match.startLine}:${match.startColumn}-${match.endLine}:${match.endColumn}`;
  const body = match.text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `${header}\n${body}`;
}

function renderSummary(summary: SummaryResult): string {
  const parts: string[] = [];
  for (const segment of summary.segments) {
    if (segment.kind === "elided") {
      parts.push(`… [lines ${segment.startLine}-${segment.endLine} elided] …`);
      continue;
    }
    if (segment.text) parts.push(segment.text);
  }
  const language = summary.language ?? "unknown";
  return [
    `AST structural summary (${language}, ${summary.totalLines} lines, pi-natives)`,
    "",
    ...parts,
  ].join("\n");
}

export function createNativeAstGrepTool(sessionCwd: string): AgentTool {
  return {
    name: "ast_grep",
    label: "ast_grep",
    description:
      "Structural code search and edit via omp Rust ast-grep (pi-natives). " +
      "Modes: search (AST pattern), summary (tree-sitter elision), edit (pattern rewrite).",
    parameters: astGrepSchema,
    async execute(_toolCallId, params, signal) {
      const {
        pattern = "",
        path: pathParam,
        maxResults = 20,
        action = "search",
        rewrite,
      } = params as AstGrepParams;

      const limit = Math.max(1, Math.floor(maxResults));
      const natives = loadPiNativesBindings();

      if (action === "summary") {
        if (!pathParam?.trim()) {
          throw new Error("ast_grep action=summary requires a path");
        }
        const { absolutePath, suffixResolution } = await resolveReadablePath(
          pathParam,
          sessionCwd,
          signal,
        );
        if (!existsSync(absolutePath)) {
          throw new Error(`Path not found: ${pathParam}`);
        }
        const code = await readFile(absolutePath, "utf8");
        const summary = natives.summarizeCode({ code, path: absolutePath, unfoldUntilLines: 0 });
        const text = prependSuffixNotice(renderSummary(summary), suffixResolution);
        return {
          content: [{ type: "text", text }],
          details: { engine: "pi-natives", mode: "summary", parsed: summary.parsed },
        };
      }

      const trimmedPattern = pattern.trim();
      if (!trimmedPattern) {
        throw new Error("ast_grep action=search/edit requires a non-empty pattern");
      }

      if (action === "edit") {
        if (!pathParam?.trim()) throw new Error("ast_grep action=edit requires a path");
        if (!rewrite) throw new Error("ast_grep action=edit requires a rewrite parameter");

        const { absolutePath, suffixResolution } = await resolveReadablePath(
          pathParam,
          sessionCwd,
          signal,
        );
        if (!existsSync(absolutePath)) {
          throw new Error(`Path not found: ${pathParam}`);
        }

        const result = await natives.astEdit({
          rewrites: { [trimmedPattern]: rewrite },
          path: absolutePath,
          dryRun: false,
          maxReplacements: limit,
          signal,
          timeoutMs: AST_TIMEOUT_MS,
        });

        const lines: string[] = [];
        if (result.applied) {
          lines.push(
            `Applied ${result.totalReplacements} replacement(s) across ${result.filesTouched} file(s).`,
          );
        } else {
          lines.push(
            `Dry-run preview: ${result.totalReplacements} replacement(s) across ${result.filesTouched} file(s).`,
          );
        }
        for (const change of result.changes.slice(0, limit)) {
          lines.push(
            `${change.path}:${change.startLine}  ${change.before.trim()} -> ${change.after.trim()}`,
          );
        }
        if (result.changes.length > limit) {
          lines.push(`[${result.changes.length - limit} more changes not shown]`);
        }
        if (result.parseErrors?.length) {
          lines.push("", `Parse errors: ${result.parseErrors.join("; ")}`);
        }

        return {
          content: [
            { type: "text", text: prependSuffixNotice(lines.join("\n"), suffixResolution) },
          ],
          details: {
            engine: "pi-natives",
            mode: "edit",
            applied: result.applied,
            totalReplacements: result.totalReplacements,
          },
        };
      }

      const searchPath = pathParam?.trim() ? resolve(sessionCwd, pathParam.trim()) : sessionCwd;
      if (pathParam?.trim() && !existsSync(searchPath)) {
        throw new Error(`Path not found: ${pathParam}`);
      }

      const result = await natives.astGrep({
        patterns: [trimmedPattern],
        path: searchPath,
        limit,
        signal,
        timeoutMs: AST_TIMEOUT_MS,
      });

      if (result.matches.length === 0) {
        const errors = result.parseErrors?.length
          ? `\nParse errors: ${result.parseErrors.join("; ")}`
          : "";
        return {
          content: [
            {
              type: "text",
              text: `No AST matches found for pattern "${trimmedPattern}".${errors}`,
            },
          ],
          details: { engine: "pi-natives", matchCount: 0 },
        };
      }

      let text = result.matches.map(formatMatch).join("\n\n");
      if (result.limitReached) {
        text += `\n\n[${limit} matches limit reached; ${result.totalMatches} total]`;
      }
      if (result.parseErrors?.length) {
        text += `\n\nParse errors: ${result.parseErrors.join("; ")}`;
      }

      return {
        content: [{ type: "text", text }],
        details: {
          engine: "pi-natives",
          matchCount: result.matches.length,
          totalMatches: result.totalMatches,
          filesWithMatches: result.filesWithMatches,
        },
      };
    },
  };
}
