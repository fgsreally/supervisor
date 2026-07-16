import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createReadTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadPiNativesBindings, type SummaryResult } from "../pi-natives-loader.js";
import { prependSuffixNotice, resolveReadablePath } from "../utils/path-resolve.js";

const MAX_SUMMARY_BYTES = 2 * 1024 * 1024;
const MAX_SUMMARY_LINES = 20_000;
const MIN_TOTAL_LINES = 100;
const MIN_BODY_LINES = 3;
const MIN_COMMENT_LINES = 3;

const readSchema = Type.Object({
  path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  offset: Type.Optional(
    Type.Number({ description: "Line number to start reading from (1-indexed)" }),
  ),
  limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});

type ReadParams = {
  path: string;
  offset?: number;
  limit?: number;
};

function countLines(text: string): number {
  if (text.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
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
  const header = [
    `Structural summary (${language}, ${summary.totalLines} lines, tree-sitter via pi-natives)`,
    "Re-read with offset/limit to expand elided regions.",
    "",
  ];
  return [...header, ...parts].join("\n");
}

async function trySummarize(absolutePath: string, signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) throw new Error("Operation aborted");

  const fileStat = await stat(absolutePath);
  if (fileStat.size > MAX_SUMMARY_BYTES) return null;

  const code = await readFile(absolutePath, "utf8");
  if (signal?.aborted) throw new Error("Operation aborted");

  const lineCount = countLines(code);
  if (lineCount < MIN_TOTAL_LINES || lineCount > MAX_SUMMARY_LINES) return null;

  const natives = loadPiNativesBindings();
  const result = natives.summarizeCode({
    code,
    path: absolutePath,
    minBodyLines: MIN_BODY_LINES,
    minCommentLines: MIN_COMMENT_LINES,
    unfoldUntilLines: 0,
  });

  if (!result.parsed || !result.elided) return null;
  return renderSummary(result);
}

export function createNativeReadTool(sessionCwd: string): AgentTool {
  const baseRead = createReadTool(sessionCwd);

  return {
    name: "read",
    label: "read",
    description:
      `${baseRead.description} Large source files without offset/limit may return a structural tree-sitter summary (Rust). ` +
      `Missing paths may be resolved via suffix glob.`,
    parameters: readSchema,
    async execute(toolCallId, params, signal, onUpdate) {
      const { path: filePath, offset, limit } = params as ReadParams;
      if (!filePath?.trim()) {
        throw new Error("read tool requires a non-empty `path` field.");
      }

      const { absolutePath, suffixResolution } = await resolveReadablePath(
        filePath.trim(),
        sessionCwd,
        signal,
      );

      const shouldSummarize = offset === undefined && limit === undefined;

      if (shouldSummarize && existsSync(absolutePath)) {
        try {
          const summaryText = await trySummarize(absolutePath, signal);
          if (summaryText) {
            return {
              content: [
                {
                  type: "text",
                  text: prependSuffixNotice(summaryText, suffixResolution),
                },
              ],
              details: {
                engine: "pi-natives",
                mode: "summary",
                path: absolutePath,
                suffixResolved: suffixResolution?.displayPath,
              },
            };
          }
        } catch (error) {
          if (signal?.aborted) throw error;
        }
      }

      const readPath =
        suffixResolution && existsSync(absolutePath)
          ? relative(sessionCwd, absolutePath).replace(/\\/g, "/") || "."
          : filePath.trim();

      const result = await baseRead.execute(
        toolCallId,
        { ...params, path: readPath },
        signal,
        onUpdate,
      );

      if (suffixResolution && result.content?.length) {
        const text = result.content
          .filter((b): b is { type: "text"; text: string } => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        return {
          ...result,
          content: [{ type: "text", text: prependSuffixNotice(text, suffixResolution) }],
          details: {
            ...(typeof result.details === "object" && result.details ? result.details : {}),
            suffixResolved: suffixResolution.displayPath,
          },
        };
      }

      return result;
    },
  };
}
