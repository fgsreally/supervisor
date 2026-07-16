import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface SupervisorSettings {
  utilityProvider?: string;
  utilityModelId?: string;
}

const DEFAULT_SETTINGS: SupervisorSettings = {};

export function getSupervisorSettingsPath(): string {
  return join(homedir(), ".pi", "supervisor", "settings.json");
}

export function readSupervisorSettings(): SupervisorSettings {
  const path = getSupervisorSettingsPath();
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as SupervisorSettings;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSupervisorSettings(patch: Partial<SupervisorSettings>): SupervisorSettings {
  const current = readSupervisorSettings();
  const next = { ...current, ...patch };
  const path = getSupervisorSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return next;
}
