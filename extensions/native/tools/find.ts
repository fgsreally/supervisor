import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { loadPiNativesBindings } from "../pi-natives-loader.js";

const DEFAULT_LIMIT = 1000;
const GLOB_TIMEOUT_MS = 5000;

const findSchema = Type.Object({
  pattern: Type.String({
    description: "Glob pattern to match files, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts'",
  }),
  path: Type.Optional(
    Type.String({ description: "Directory to search in (default: current directory)" }),
  ),
  limit: Type.Optional(Type.Number({ description: "Maximum number of results (default: 1000)" })),
});

type FindParams = {
  pattern: string;
  path?: string;
  limit?: number;
};

export function createNativeFindTool(sessionCwd: string): AgentTool {
  return {
    name: "find",
    label: "find",
    description:
      `Search for files by glob pattern via omp Rust glob (pi-natives). ` +
      `Returns matching file paths relative to the search directory. Respects .gitignore. ` +
      `Output is truncated to ${DEFAULT_LIMIT} results by default.`,
    parameters: findSchema,
    async execute(_toolCallId, params, signal) {
      const { pattern, path: searchDir, limit } = params as FindParams;

      if (!pattern?.trim()) {
        throw new Error("find tool requires a non-empty `pattern` field.");
      }

      const searchPath = resolve(sessionCwd, searchDir?.trim() || ".");
      if (!existsSync(searchPath)) {
        throw new Error(`Path not found: ${searchPath}`);
      }

      const effectiveLimit = Math.max(1, Math.min(DEFAULT_LIMIT, limit ?? DEFAULT_LIMIT));
      const natives = loadPiNativesBindings();

      const result = await natives.glob(
        {
          pattern: pattern.trim(),
          path: searchPath,
          maxResults: effectiveLimit,
          gitignore: true,
          recursive: true,
          signal,
          timeoutMs: GLOB_TIMEOUT_MS,
        },
        null,
      );

      if (result.matches.length === 0) {
        return {
          content: [{ type: "text", text: "No files found matching pattern" }],
          details: { engine: "pi-natives", totalMatches: 0 },
        };
      }

      const lines = result.matches.map((match) => match.path.replace(/\\/g, "/"));
      let text = lines.join("\n");
      if (result.totalMatches > lines.length) {
        text += `\n\n[${effectiveLimit} results limit reached]`;
      }

      return {
        content: [{ type: "text", text }],
        details: {
          engine: "pi-natives",
          totalMatches: result.totalMatches,
          returned: lines.length,
        },
      };
    },
  };
}
