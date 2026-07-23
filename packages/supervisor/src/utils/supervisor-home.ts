import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Supervisor runtime root: ~/.pi/supervisor */
export function getSupervisorHome(): string {
  return join(homedir(), ".pi", "supervisor");
}

/** Public static files (avatars etc.): ~/.pi/supervisor/public */
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
