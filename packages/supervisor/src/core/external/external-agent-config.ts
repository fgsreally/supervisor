import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { basename, delimiter, extname, isAbsolute, join } from "node:path";
import type { Agent } from "../../types.js";

export interface ExternalAgentConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  permissionPolicy?: "allow_once" | "reject_once";
}

const DEFAULT_COMMANDS: Partial<Record<Agent["backendType"], string>> = {
  claude: "claude",
  codex: "codex",
  kimi: "kimi",
};

export function getExternalAgentConfig(agent: Agent): ExternalAgentConfig {
  const persisted = agent.externalConfig;
  const legacy = agent.meta.external as Record<string, unknown> | undefined;
  const command =
    typeof persisted?.command === "string" && persisted.command.trim()
      ? persisted.command.trim()
      : typeof agent.meta.command === "string" && agent.meta.command.trim()
        ? agent.meta.command.trim()
      : typeof legacy?.command === "string" && legacy.command.trim()
        ? legacy.command.trim()
        : (DEFAULT_COMMANDS[agent.backendType] ?? "");
  const rawArgs = Array.isArray(persisted?.args)
    ? persisted.args
    : Array.isArray(agent.meta.args)
      ? agent.meta.args
      : legacy?.args;
  const rawEnv =
    persisted?.env ??
    (agent.meta.env && typeof agent.meta.env === "object" ? agent.meta.env : legacy?.env);
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
    ...(persisted?.permissionPolicy ? { permissionPolicy: persisted.permissionPolicy } : {}),
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

/** Extra dirs often missing when supervisor is launched from IDE / service managers. */
function extraUserBinDirs(): string[] {
  const home = homedir();
  const localAppData = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
  const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
  if (platform() === "win32") {
    return [
      // Codex/npm shims invoke `node` from PATH; ensure stock Node installs are visible
      // even when Supervisor was launched from an IDE with a trimmed environment.
      process.env.ProgramFiles ? join(process.env.ProgramFiles, "nodejs") : "",
      process.env["ProgramFiles(x86)"] ? join(process.env["ProgramFiles(x86)"], "nodejs") : "",
      join(localAppData, "Programs", "nodejs"),
      join(localAppData, "Volta", "bin"),
      process.env.ProgramFiles ? join(process.env.ProgramFiles, "Volta") : "",
      process.env["ProgramFiles(x86)"] ? join(process.env["ProgramFiles(x86)"], "Volta") : "",
      join(home, ".local", "bin"),
      join(appData, "npm"),
      join(localAppData, "pnpm"),
      join(home, ".bun", "bin"),
      join(localAppData, "Programs", "cursor", "resources", "app", "bin"),
    ].filter((dir) => dir && existsSync(dir));
  }
  return [
    join(home, ".local", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".npm-global", "bin"),
    join(home, ".bun", "bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ].filter((dir) => existsSync(dir));
}

function pathSearchDirs(env: NodeJS.ProcessEnv): string[] {
  const fromEnv = (env.PATH ?? "").split(delimiter).filter(Boolean);
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const directory of [...fromEnv, ...extraUserBinDirs()]) {
    const normalized = directory.replace(/^"|"$/g, "");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    dirs.push(normalized);
  }
  return dirs;
}

function envWithExtraPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const dirs = pathSearchDirs(env);
  return {
    ...env,
    PATH: dirs.join(delimiter),
  };
}

function resolveViaWhere(command: string, env: NodeJS.ProcessEnv): string | null {
  const searchEnv = envWithExtraPath(env);
  if (platform() === "win32") {
    const result = spawnSync("where.exe", [command], {
      env: searchEnv,
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
      shell: true,
    });
    if (result.status !== 0) return null;
    const first = (result.stdout ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return first && isExecutable(first) ? first : null;
  }
  const result = spawnSync("which", [command], {
    env: searchEnv,
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.status !== 0) return null;
  const first = (result.stdout ?? "").trim().split(/\r?\n/)[0]?.trim();
  return first && isExecutable(first) ? first : null;
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
  for (const directory of pathSearchDirs(env)) {
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return resolveViaWhere(command, env);
}

/** Windows `.cmd`/`.bat` need `shell: true`; compare extension case-insensitively. */
export function needsWindowsShell(executable: string): boolean {
  if (platform() !== "win32") return false;
  return [".cmd", ".bat", ".com"].includes(extname(executable).toLowerCase());
}

function isVoltaShim(executable: string): boolean {
  if (platform() !== "win32") return false;
  if (!/[\\/]Volta[\\/]bin[\\/]/i.test(executable)) return false;
  if (!needsWindowsShell(executable)) return false;
  try {
    const body = readFileSync(executable, "utf8");
    return /\bvolta\s+run\b/i.test(body);
  } catch {
    return false;
  }
}

/**
 * Spawn an external CLI. Volta shims (`volta run %~n0`) are expanded to
 * `volta run <tool> ...` so Windows shell PATH quirks do not break startup.
 */
export function spawnExternalProcess(
  executable: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdio?: ["pipe", "pipe", "pipe"];
  } = {},
) {
  const env = options.env ? envWithExtraPath(options.env) : envWithExtraPath(process.env);
  if (isVoltaShim(executable)) {
    const volta =
      resolveExecutable("volta", env) ??
      (process.env.ProgramFiles
        ? join(process.env.ProgramFiles, "Volta", "volta.exe")
        : null);
    if (!volta || !isExecutable(volta)) {
      throw new Error(`Volta shim ${executable} 需要 volta.exe，但未找到`);
    }
    const toolName = basename(executable, extname(executable));
    return spawn(volta, ["run", toolName, ...args], {
      cwd: options.cwd,
      env,
      stdio: options.stdio ?? ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });
  }
  return spawn(executable, args, {
    cwd: options.cwd,
    env,
    stdio: options.stdio ?? ["pipe", "pipe", "pipe"],
    windowsHide: true,
    shell: needsWindowsShell(executable),
  });
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
  const mergedEnv = envWithExtraPath({ ...process.env, ...env });
  const executablePath = resolveExecutable(command, mergedEnv);
  if (!executablePath)
    return {
      available: false,
      executablePath: null,
      unavailableReason: `未找到外部 Agent 命令：${command || "(未配置)"}`,
      detectedVersion: null,
      compatibility: "unavailable",
    };
  const result = spawnSync(executablePath, ["--version"], {
    env: mergedEnv,
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
    shell: needsWindowsShell(executablePath),
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
