import { join } from "node:path";
import debug from "debug";
import { appendRotatingTextLog, readRotatingTextLog } from "./text-log.js";
import { getWecodeHome } from "./wecode-home.js";

export type SystemLogLevel = "debug" | "info" | "warn" | "error";
export const SYSTEM_LOG_MAX_BYTES = 10 * 1024 * 1024;
const isDevelopment = process.env.WECODE_DEV === "1";

if (isDevelopment) {
  const configured = process.env.WECODE_DEBUG?.trim();
  const patterns = configured
    ? configured
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) =>
          value === "*"
            ? "wecode:*"
            : value.startsWith("wecode:")
              ? value
              : `wecode:${value}*`,
        )
        .join(",")
    : "wecode:*";
  debug.enable(patterns || "wecode:*");
}

function systemLogPath(): string {
  return join(getWecodeHome(), "logs", "system.log");
}

export function appendSystemLog(
  message: string,
  level: SystemLogLevel = "info",
  tags?: string[],
  event?: string,
  consoleMessage = message,
): void {
  const prefix = [
    `[${level}]`,
    ...(event ? [`[${event}]`] : []),
    ...(tags ?? []).map((tag) => `[${tag}]`),
  ].join(" ");
  if (isDevelopment) {
    debug(`wecode:${event ?? "system"}`)(message);
    return;
  }
  appendRotatingTextLog(
    systemLogPath(),
    `${new Date().toISOString()} ${prefix} ${message}`,
    SYSTEM_LOG_MAX_BYTES,
  );
  if (level === "error") console.error(consoleMessage);
}

export function readSystemLogs(options?: { limit?: number }): string {
  return readRotatingTextLog(systemLogPath(), options?.limit ?? 400);
}
