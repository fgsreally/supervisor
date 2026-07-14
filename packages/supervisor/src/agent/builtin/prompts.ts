import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PackagedAgentKind } from "./registry.js";

export function getPackagedAgentsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, "../../../agents");
  if (!existsSync(dir)) {
    throw new Error(`Packaged agents directory not found: ${dir}`);
  }
  return dir;
}

export function loadBuiltinAgentPrompt(kind: PackagedAgentKind | "assistant"): string {
  const filePath = join(getPackagedAgentsDir(), kind, "prompt.md");
  if (!existsSync(filePath)) {
    throw new Error(`Missing packaged agent prompt: ${filePath}`);
  }
  return readFileSync(filePath, "utf-8").trim();
}

export function loadPackagedAgentPrompt(kind: PackagedAgentKind): string {
  return loadBuiltinAgentPrompt(kind);
}

/** @deprecated use loadPackagedAgentPrompt */
export const loadInternalAgentPrompt = loadPackagedAgentPrompt;
