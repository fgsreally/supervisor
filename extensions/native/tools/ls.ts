import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { loadPiNativesBindings } from "../pi-natives-loader.js";

const DEFAULT_LIMIT = 500;
const LIST_TIMEOUT_MS = 5000;

const lsSchema = Type.Object({
  path: Type.Optional(
    Type.String({ description: "Directory to list (default: current directory)" }),
  ),
  limit: Type.Optional(
    Type.Number({ description: "Maximum number of entries to return (default: 500)" }),
  ),
});

type LsParams = {
  path?: string;
  limit?: number;
};

export function createNativeLsTool(sessionCwd: string): AgentTool {
  return {
    name: "ls",
    label: "ls",
    description:
      `List directory contents via omp Rust listWorkspace (pi-natives). ` +
      `Returns entries sorted alphabetically, with '/' suffix for directories. ` +
      `Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} entries by default.`,
    parameters: lsSchema,
    async execute(_toolCallId, params, signal) {
      const { path: dirParam, limit } = params as LsParams;
      const dirPath = resolve(sessionCwd, dirParam?.trim() || ".");

      if (!existsSync(dirPath)) {
        throw new Error(`Path not found: ${dirPath}`);
      }

      const st = statSync(dirPath);
      if (!st.isDirectory()) {
        throw new Error(`Not a directory: ${dirPath}`);
      }

      const effectiveLimit = Math.max(1, Math.min(DEFAULT_LIMIT, limit ?? DEFAULT_LIMIT));
      const natives = loadPiNativesBindings();

      const result = await natives.listWorkspace({
        path: dirPath,
        maxDepth: 1,
        hidden: true,
        gitignore: true,
        signal,
        timeoutMs: LIST_TIMEOUT_MS,
      });

      const entries = result.entries
        .map((entry) => {
          const suffix = entry.fileType === 2 ? "/" : "";
          return `${entry.path.replace(/\\/g, "/")}${suffix}`;
        })
        .sort((a, b) => a.localeCompare(b))
        .slice(0, effectiveLimit);

      if (entries.length === 0) {
        return {
          content: [{ type: "text", text: "(empty directory)" }],
          details: { engine: "pi-natives", entryCount: 0 },
        };
      }

      let text = entries.join("\n");
      const notices: string[] = [];
      if (result.truncated || result.entries.length > effectiveLimit) {
        notices.push(`${effectiveLimit} entries limit reached`);
      }
      if (notices.length > 0) {
        text += `\n\n[${notices.join(". ")}]`;
      }

      return {
        content: [{ type: "text", text }],
        details: {
          engine: "pi-natives",
          entryCount: entries.length,
          truncated: result.truncated,
        },
      };
    },
  };
}
