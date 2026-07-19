import { accessSync, constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { delimiter, extname, isAbsolute, join } from "node:path";
import type { Agent } from "../../types.js";

export interface ExternalAgentConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

const DEFAULT_COMMANDS: Partial<Record<Agent["backendType"], string>> = {
  claude: "claude",
  codex: "codex",
  kimi: "kimi",
};

export function getExternalAgentConfig(agent: Agent): ExternalAgentConfig {
  const legacy = agent.meta.external as Record<string, unknown> | undefined;
  const command =
    typeof agent.meta.command === "string" && agent.meta.command.trim()
      ? agent.meta.command.trim()
      : typeof legacy?.command === "string" && legacy.command.trim()
        ? legacy.command.trim()
        : (DEFAULT_COMMANDS[agent.backendType] ?? "");
  const rawArgs = Array.isArray(agent.meta.args) ? agent.meta.args : legacy?.args;
  const rawEnv =
    agent.meta.env && typeof agent.meta.env === "object" ? agent.meta.env : legacy?.env;
  return {
    command,
    args: Array.isArray(rawArgs)
      ? rawArgs.filter((value): value is string => typeof value === "string")
      : [],
    env:
      rawEnv && typeof rawEnv === "object"
        ? Object.fromEntries(
            Object.entries(rawEnv).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          )
        : {},
  };
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveExecutable(command: string, env = process.env): string | null {
  if (!command) return null;
  if (isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    return isExecutable(command) ? command : null;
  }
  const extensions =
    process.platform === "win32"
      ? extname(command)
        ? [""]
        : (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
      : [""];
  for (const directory of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory.replace(/^"|"$/g, ""), `${command}${extension}`);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

export function externalAgentAvailability(agent: Agent): {
  available: boolean;
  executablePath: string | null;
  unavailableReason: string | null;
  detectedVersion: string | null;
  compatibility: "compatible" | "unknown" | "unavailable";
} {
  if (agent.backendType === "native") {
    return {
      available: true,
      executablePath: null,
      unavailableReason: null,
      detectedVersion: null,
      compatibility: "compatible",
    };
  }
  const { command, env } = getExternalAgentConfig(agent);
  const executablePath = resolveExecutable(command, { ...process.env, ...env });
  if (!executablePath)
    return {
      available: false,
      executablePath: null,
      unavailableReason: `未找到外部 Agent 命令：${command || "(未配置)"}`,
      detectedVersion: null,
      compatibility: "unavailable",
    };
  const result = spawnSync(executablePath, ["--version"], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 3000,
    windowsHide: true,
  });
  const detectedVersion =
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().split(/\r?\n/)[0] || null;
  return {
    available: executablePath !== null,
    executablePath,
    unavailableReason: null,
    detectedVersion,
    compatibility: result.status === 0 && detectedVersion ? "compatible" : "unknown",
  };
}
