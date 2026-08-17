import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { getSupervisorHome } from "./supervisor-home.js";

export type SystemLogLevel = "debug" | "info" | "warn" | "error";

function systemLogPath(): string {
  const dir = join(getSupervisorHome(), "logs", "system");
  mkdirSync(dir, { recursive: true });
  return join(dir, "supervisor.log");
}

export function appendSystemLog(
  message: string,
  level: SystemLogLevel = "info",
  tags?: string[],
): void {
  const prefix = [`[${level}]`, ...(tags ?? []).map((tag) => `[${tag}]`)].join(" ");
  const line = `${new Date().toISOString()} ${prefix} ${message}`;
  appendFileSync(systemLogPath(), `${line}\n`, "utf8");
  const coloredPrefix =
    level === "error"
      ? pc.red(prefix)
      : level === "warn"
        ? pc.yellow(prefix)
        : level === "debug"
          ? pc.cyan(prefix)
          : pc.blue(prefix);
  console.log(`${new Date().toISOString()} ${coloredPrefix} ${message}`);
}

export function readSystemLogs(options?: { limit?: number }): string {
  const path = systemLogPath();
  if (!existsSync(path)) return "";
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - (options?.limit ?? 400))).join("\n");
}
