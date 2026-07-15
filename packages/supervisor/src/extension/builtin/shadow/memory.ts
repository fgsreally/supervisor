import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSessionDir } from "../../../core/session-files.js";
import type { ShadowProtocolResult } from "./types.js";

export const SHADOW_DIR_NAME = "shadow";
export const SHADOW_MEMORY_FILE = "shadow-memory.md";

export function getShadowDir(projectId: number, sessionId: number): string {
  return join(getSessionDir(projectId, sessionId), SHADOW_DIR_NAME);
}

export function getShadowMemoryPath(projectId: number, sessionId: number): string {
  return join(getShadowDir(projectId, sessionId), SHADOW_MEMORY_FILE);
}

export function readShadowMemory(projectId: number, sessionId: number): string {
  const path = getShadowMemoryPath(projectId, sessionId);
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

export function writeShadowMemory(projectId: number, sessionId: number, content: string): void {
  const dir = getShadowDir(projectId, sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(getShadowMemoryPath(projectId, sessionId), content, "utf-8");
}

export function applyShadowMemoryUpdate(
  projectId: number,
  sessionId: number,
  update: ShadowProtocolResult["shadowMemory"],
): void {
  if (!update?.content.trim()) return;
  if (update.action === "replace") {
    writeShadowMemory(projectId, sessionId, `${update.content.trim()}\n`);
    return;
  }
  const current = readShadowMemory(projectId, sessionId).trimEnd();
  const next = current ? `${current}\n\n${update.content.trim()}` : update.content.trim();
  writeShadowMemory(projectId, sessionId, `${next}\n`);
}
