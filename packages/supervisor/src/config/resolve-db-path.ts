import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readSupervisorSettings } from "../utils/supervisor-settings.js";

const DEFAULT_DB_PATH = join(homedir(), ".pi", "supervisor.db");

export interface SupervisorLocalConfig {
  dbPath?: string;
}

function findConfigWalkingUp(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, ".supervisor", "config.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function localConfigPath(): string | null {
  const fromCwd = findConfigWalkingUp(process.cwd());
  if (fromCwd) return fromCwd;
  return findConfigWalkingUp(dirname(fileURLToPath(import.meta.url)));
}

/** Read project-local `.supervisor/config.json` when present. */
export function readSupervisorLocalConfig(): {
  config: SupervisorLocalConfig;
  configDir: string;
} | null {
  const path = localConfigPath();
  if (!path) return null;
  try {
    const raw = readFileSync(path, "utf-8").replace(/^\uFEFF/, "");
    const config = JSON.parse(raw) as SupervisorLocalConfig;
    return { config, configDir: dirname(path) };
  } catch {
    return null;
  }
}

/**
 * Resolve SQLite path:
 * 1) explicit override (API / tests)
 * 2) project `.supervisor/config.json` → `dbPath`
 * 3) `~/.pi/supervisor/settings.json` → `dbPath`
 * 4) default `~/.pi/supervisor.db`
 */
export function resolveDbPath(explicit?: string): string {
  const fromArg = explicit?.trim();
  if (fromArg) return resolve(fromArg);

  const local = readSupervisorLocalConfig();
  const fromLocal = local?.config.dbPath?.trim();
  if (local && fromLocal) {
    return isAbsolute(fromLocal) ? fromLocal : resolve(local.configDir, fromLocal);
  }

  const fromSettings = readSupervisorSettings().dbPath?.trim();
  if (fromSettings) {
    return isAbsolute(fromSettings) ? fromSettings : resolve(fromSettings);
  }

  return DEFAULT_DB_PATH;
}
