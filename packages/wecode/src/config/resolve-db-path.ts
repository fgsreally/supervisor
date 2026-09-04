import { existsSync, readFileSync, renameSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { readWecodeSettings } from "../utils/wecode-settings.js";
import { getWecodeHome } from "../utils/wecode-home.js";

export interface WecodeLocalConfig {
  dbPath?: string;
}

/**
 * Resolve SQLite path — always under wecode home unless settings override.
 * 1) explicit override (API / tests)
 * 2) `<home>/settings.json` → `dbPath`
 * 3) default `<home>/wecode.db`
 *
 * Home itself is `--cwd` / `WECODE_HOME` / `~/.wecode`.
 */
export function resolveDbPath(explicit?: string): string {
  const fromArg = explicit?.trim();
  if (fromArg) return resolve(fromArg);

  const home = getWecodeHome();
  const fromSettings = readWecodeSettings().dbPath?.trim();
  if (fromSettings) {
    return isAbsolute(fromSettings) ? fromSettings : resolve(home, fromSettings);
  }

  const preferred = join(home, "wecode.db");
  const legacy = join(home, "supervisor.db");
  if (!existsSync(preferred) && existsSync(legacy)) {
    try {
      renameSync(legacy, preferred);
    } catch {
      return legacy;
    }
  }
  return preferred;
}

/** @deprecated Local `.wecode/config.json` is no longer used for dbPath; home is the root. */
export function readWecodeLocalConfig(): {
  config: WecodeLocalConfig;
  configDir: string;
} | null {
  const home = getWecodeHome();
  const path = join(home, "settings.json");
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8").replace(/^\uFEFF/, "");
    const config = JSON.parse(raw) as WecodeLocalConfig;
    return { config, configDir: home };
  } catch {
    return null;
  }
}
