import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getSessionDir } from "../core/session-files.js";
import type { ShadowProtocolResult } from "./types.js";

export const SHADOW_DIR_NAME = "shadow";
export const SHADOW_MEMORY_FILE = "memory.md";
export const SHADOW_LAST_ENTRY_FILE = "last-entry-id.txt";

export function getShadowDir(projectId: number, parentSessionId: number): string {
	return join(getSessionDir(projectId, parentSessionId), SHADOW_DIR_NAME);
}

export function getShadowMemoryPath(projectId: number, parentSessionId: number): string {
	return join(getShadowDir(projectId, parentSessionId), SHADOW_MEMORY_FILE);
}

export function getShadowLastEntryPath(projectId: number, parentSessionId: number): string {
	return join(getShadowDir(projectId, parentSessionId), SHADOW_LAST_ENTRY_FILE);
}

function ensureShadowDir(projectId: number, parentSessionId: number): string {
	const dir = getShadowDir(projectId, parentSessionId);
	mkdirSync(dir, { recursive: true });
	return dir;
}

export function readShadowMemory(projectId: number, parentSessionId: number): string {
	const path = getShadowMemoryPath(projectId, parentSessionId);
	if (!existsSync(path)) return "";
	return readFileSync(path, "utf-8");
}

export function writeShadowMemory(projectId: number, parentSessionId: number, content: string): void {
	ensureShadowDir(projectId, parentSessionId);
	writeFileSync(getShadowMemoryPath(projectId, parentSessionId), content, "utf-8");
}

export function readShadowLastEntryId(projectId: number, parentSessionId: number): string | null {
	const path = getShadowLastEntryPath(projectId, parentSessionId);
	if (!existsSync(path)) return null;
	const value = readFileSync(path, "utf-8").trim();
	return value || null;
}

export function writeShadowLastEntryId(
	projectId: number,
	parentSessionId: number,
	entryId: string,
): void {
	ensureShadowDir(projectId, parentSessionId);
	writeFileSync(getShadowLastEntryPath(projectId, parentSessionId), `${entryId}\n`, "utf-8");
}

export function applyMemoryUpdate(
	projectId: number,
	parentSessionId: number,
	update: ShadowProtocolResult["memory"],
): void {
	if (!update) return;
	if (typeof update.replace === "string") {
		writeShadowMemory(projectId, parentSessionId, update.replace);
		return;
	}
	const append = update.append?.trim();
	if (!append) return;
	const current = readShadowMemory(projectId, parentSessionId).trimEnd();
	const next = current ? `${current}\n\n${append}` : append;
	writeShadowMemory(projectId, parentSessionId, `${next}\n`);
}
