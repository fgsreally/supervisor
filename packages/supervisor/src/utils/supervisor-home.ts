import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

let explicitHome: string | null = null;

function defaultSupervisorHome(): string {
  return join(homedir(), ".supervisor");
}

/**
 * Override supervisor global root (from `--cwd`).
 * When set, db / public / global / agents / projects / media all live under this path.
 * Takes precedence over `SUPERVISOR_HOME` and the default `~/.supervisor`.
 */
export function setSupervisorHome(path: string): void {
  explicitHome = resolve(path);
}

/** Supervisor runtime root: `--cwd` → `SUPERVISOR_HOME` → `~/.supervisor` */
export function getSupervisorHome(): string {
  if (explicitHome) return explicitHome;
  const fromEnv = process.env.SUPERVISOR_HOME?.trim();
  if (fromEnv) return resolve(fromEnv);
  return defaultSupervisorHome();
}

/** Public static files (avatars etc.): `<home>/public` */
export function getSupervisorPublicDir(): string {
  return join(getSupervisorHome(), "public");
}

export function ensureSupervisorPublicDir(): string {
  const dir = getSupervisorPublicDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function supervisorPublicPath(...parts: string[]): string {
  return join(getSupervisorPublicDir(), ...parts);
}

export function ensureSupervisorPublicSubdir(...parts: string[]): string {
  const dir = supervisorPublicPath(...parts);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
