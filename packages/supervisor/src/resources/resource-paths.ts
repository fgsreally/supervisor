import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ResourceDirectoryKind = "skills" | "extensions" | "prompts" | "mcp";

export function getGlobalResourceRoot(): string {
  return join(homedir(), ".pi", "supervisor", "global");
}

export function getGlobalResourceDirs(): Record<ResourceDirectoryKind, string> {
  const root = getGlobalResourceRoot();
  return {
    skills: join(root, "skills"),
    extensions: join(root, "extensions"),
    prompts: join(root, "prompts"),
    mcp: join(root, "mcp"),
  };
}

export function ensureGlobalResourceDirs(): string {
  const root = getGlobalResourceRoot();
  for (const dir of Object.values(getGlobalResourceDirs())) {
    mkdirSync(dir, { recursive: true });
  }
  return root;
}
