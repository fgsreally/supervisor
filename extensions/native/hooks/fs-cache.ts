import { resolve } from "node:path";
import type { defineExtension } from "pi-supervisor";
import { loadPiNativesBindings } from "../pi-natives-loader.js";

type ExtensionContext = Parameters<Parameters<typeof defineExtension>[0]["setup"]>[0];

const MUTATING_TOOLS = new Set(["write", "edit", "bash", "ast_grep"]);

function extractPath(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const record = args as Record<string, unknown>;
  for (const key of ["path", "file_path", "filePath"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function registerFsCacheInvalidation(ctx: ExtensionContext): void {
  ctx.runtime.on("tool.after_call", (event) => {
    if (event.type !== "tool.after_call" || event.result.isError) return;
    if (!MUTATING_TOOLS.has(event.name)) return;

    const path = extractPath(event.args);
    if (!path) return;

    try {
      const natives = loadPiNativesBindings();
      const absolute = resolve(ctx.project.cwd, path);
      natives.invalidateFsScanCache(absolute);
    } catch {
      // pi-natives unavailable — skip silently
    }
  });
}
