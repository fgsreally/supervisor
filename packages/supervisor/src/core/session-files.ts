import { existsSync, readdirSync, rmSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECTS_ROOT = join(homedir(), ".pi", "supervisor", "projects");

export function getSupervisorProjectsRoot(): string {
  return PROJECTS_ROOT;
}

export function getProjectDir(projectId: string | number): string {
  return join(PROJECTS_ROOT, String(projectId));
}

export async function ensureProjectDir(projectId: string | number): Promise<string> {
  const dir = getProjectDir(projectId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function removeProjectDir(projectId: string | number): Promise<void> {
  await rm(getProjectDir(projectId), { recursive: true, force: true });
}

export function removeProjectDirSync(projectId: string | number): void {
  rmSync(getProjectDir(projectId), { recursive: true, force: true });
}

export function getSessionDir(projectId: string | number, sessionId: string | number): string {
  return join(getProjectDir(projectId), "sessions", String(sessionId));
}

export async function ensureSessionDir(
  projectId: string | number,
  sessionId: string | number,
): Promise<string> {
  const dir = getSessionDir(projectId, sessionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function removeSessionDir(
  projectId: string | number,
  sessionId: string | number,
): Promise<void> {
  await rm(getSessionDir(projectId, sessionId), { recursive: true, force: true });
}

export function removeSessionDirSync(projectId: string | number, sessionId: string | number): void {
  rmSync(getSessionDir(projectId, sessionId), { recursive: true, force: true });
}

export function listProjectDirs(): string[] {
  if (!existsSync(PROJECTS_ROOT)) return [];
  return readdirSync(PROJECTS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PROJECTS_ROOT, entry.name));
}

/** @deprecated use getSupervisorProjectsRoot. */
export function getSupervisorSessionsRoot(): string {
  return PROJECTS_ROOT;
}

/** @deprecated project ownership is required for new callers. */
export function listSessionDirs(): string[] {
  return listProjectDirs().flatMap((projectDir) => {
    const sessionsDir = join(projectDir, "sessions");
    if (!existsSync(sessionsDir)) return [];
    return readdirSync(sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(sessionsDir, entry.name));
  });
}
