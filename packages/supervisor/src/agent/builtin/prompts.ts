import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PackagedAgentPromptKind } from "./registry.js";

export function getPackagedAgentsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../resource/agents"),
    join(here, "../../../resource/agents"),
    join(here, "../../resource/agents"),
    join(here, "../../../prompts/agents"),
    join(here, "../../prompts/agents"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error(`Packaged agents directory not found: ${candidates.join(", ")}`);
}

export function loadBuiltinAgentPrompt(
  kind: PackagedAgentPromptKind | "assistant" | "watson",
): string {
  const filePath = join(getPackagedAgentsDir(), `${kind}.md`);
  if (!existsSync(filePath)) {
    throw new Error(`Missing packaged agent prompt: ${filePath}`);
  }
  return readFileSync(filePath, "utf-8").trim();
}

export function loadPackagedAgentPrompt(kind: PackagedAgentPromptKind): string {
  return loadBuiltinAgentPrompt(kind);
}

/** @deprecated use loadPackagedAgentPrompt */
export const loadInternalAgentPrompt = loadPackagedAgentPrompt;
