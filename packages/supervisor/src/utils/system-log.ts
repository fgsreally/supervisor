import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getSupervisorHome } from "./supervisor-home.js";

function systemLogPath(): string {
  const dir = join(getSupervisorHome(), "logs", "system");
  mkdirSync(dir, { recursive: true });
  return join(dir, "supervisor.log");
}

export function appendSystemLog(message: string): void {
  appendFileSync(systemLogPath(), `${new Date().toISOString()} ${message}\n`, "utf8");
}

export function readSystemLogs(options?: { limit?: number }): string {
  const path = systemLogPath();
  if (!existsSync(path)) return "";
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - (options?.limit ?? 400))).join("\n");
}
