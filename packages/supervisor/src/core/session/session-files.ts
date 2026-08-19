import { existsSync, readdirSync, rmSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { getSupervisorHome } from "../../utils/supervisor-home.js";

export function getSupervisorProjectsRoot(): string {
  return join(getSupervisorHome(), "projects");
}

export function getProjectDir(projectId: string | number): string {
  return join(getSupervisorProjectsRoot(), String(projectId));
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
  await Promise.all(
    ["attachments", "scripts", "plans", "todos", "outputs", "tmp"].map((name) =>
      mkdir(join(dir, name), { recursive: true }),
    ),
  );
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
  const root = getSupervisorProjectsRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name));
}

/** @deprecated use getSupervisorProjectsRoot. */
export function getSupervisorSessionsRoot(): string {
  return getSupervisorProjectsRoot();
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
