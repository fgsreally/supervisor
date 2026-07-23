import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSupervisorHome } from "../utils/supervisor-home.js";

/** Supervisor per-agent homes: ~/.pi/supervisor/agents */
export function getSupervisorAgentsRoot(): string {
  return join(getSupervisorHome(), "agents");
}

export function getAgentHomeDir(agentId: string | number): string {
  return join(getSupervisorAgentsRoot(), String(agentId));
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
