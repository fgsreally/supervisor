import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getWecodeHome } from "../utils/wecode-home.js";

/** Wecode per-agent homes: `<wecodeHome>/agents` */
export function getWecodeAgentsRoot(): string {
  return join(getWecodeHome(), "agents");
}

export function getAgentHomeDir(agentId: string | number): string {
  return join(getWecodeAgentsRoot(), String(agentId));
}

export function ensureAgentHome(agentId: string | number, homeDir?: string): string {
  const root = homeDir ?? getAgentHomeDir(agentId);
  mkdirSync(root, { recursive: true });
  return root;
}

/** Read optional SYSTEM.md from agent home (does not read global). */
export function getAgentSystemMdPath(agentHomeDir: string): string {
  return join(agentHomeDir, "SYSTEM.md");
}

export function readAgentHomeSystemPrompt(agentHomeDir: string): string {
  const path = getAgentSystemMdPath(agentHomeDir);
  if (!existsSync(path)) return "";
  try {
    return readFileSync(path, "utf-8").trim();
  } catch {
    return "";
  }
}

export function writeAgentHomeSystemPrompt(agentHomeDir: string, content: string): void {
  mkdirSync(agentHomeDir, { recursive: true });
  writeFileSync(getAgentSystemMdPath(agentHomeDir), content, "utf-8");
}
