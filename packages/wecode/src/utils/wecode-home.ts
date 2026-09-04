import { existsSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

let explicitHome: string | null = null;

function defaultWecodeHome(): string {
  const next = join(homedir(), ".wecode");
  const legacy = join(homedir(), ".supervisor");
  if (!existsSync(next) && existsSync(legacy)) {
    try {
      renameSync(legacy, next);
    } catch {
      return legacy;
    }
  }
  return next;
}

/**
 * Override wecode global root (from `--cwd`).
 * When set, db / public / global / agents / projects / media all live under this path.
 * Takes precedence over `WECODE_HOME` and the default `~/.wecode`.
 */
export function setWecodeHome(path: string): void {
  explicitHome = resolve(path);
}

/** Wecode runtime root: `--cwd` → `WECODE_HOME` → `~/.wecode` */
export function getWecodeHome(): string {
  if (explicitHome) return explicitHome;
  const fromEnv = process.env.WECODE_HOME?.trim() || process.env.SUPERVISOR_HOME?.trim();
  if (fromEnv) return resolve(fromEnv);
  return defaultWecodeHome();
}

/** Public static files (avatars etc.): `<home>/public` */
export function getWecodePublicDir(): string {
  return join(getWecodeHome(), "public");
}

export function ensureWecodePublicDir(): string {
  const dir = getWecodePublicDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function wecodePublicPath(...parts: string[]): string {
  return join(getWecodePublicDir(), ...parts);
}

export function ensureWecodePublicSubdir(...parts: string[]): string {
  const dir = wecodePublicPath(...parts);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
