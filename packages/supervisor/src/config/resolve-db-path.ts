import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { readSupervisorSettings } from "../utils/supervisor-settings.js";
import { getSupervisorHome } from "../utils/supervisor-home.js";

export interface SupervisorLocalConfig {
  dbPath?: string;
}

/**
 * Resolve SQLite path — always under supervisor home unless settings override.
 * 1) explicit override (API / tests)
 * 2) `<home>/settings.json` → `dbPath`
 * 3) default `<home>/supervisor.db`
 *
 * Home itself is `--cwd` / `SUPERVISOR_HOME` / `~/.supervisor`.
 */
export function resolveDbPath(explicit?: string): string {
  const fromArg = explicit?.trim();
  if (fromArg) return resolve(fromArg);

  const home = getSupervisorHome();
  const fromSettings = readSupervisorSettings().dbPath?.trim();
  if (fromSettings) {
    return isAbsolute(fromSettings) ? fromSettings : resolve(home, fromSettings);
  }

  return join(home, "supervisor.db");
}

/** @deprecated Local `.supervisor/config.json` is no longer used for dbPath; home is the root. */
export function readSupervisorLocalConfig(): {
  config: SupervisorLocalConfig;
  configDir: string;
} | null {
  const home = getSupervisorHome();
  const path = join(home, "settings.json");
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8").replace(/^\uFEFF/, "");
    const config = JSON.parse(raw) as SupervisorLocalConfig;
    return { config, configDir: home };
  } catch {
    return null;
  }
}
