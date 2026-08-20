import { randomUUID } from "node:crypto";
import type { SessionTreeEntry } from "@earendil-works/pi-agent-core";
import type { SupervisorDb } from "../../db/db.js";
import type { SQLiteSessionStorage } from "./session-storage.js";

/**
 * Timeline-only custom message.
 * Stored as `type: "custom"` so pi never includes it in the LLM context.
 */
export const CUSTOM_MESSAGE_TYPE = "custom_message";
export const SHADOW_MESSAGE_TYPE = "shadow_message";
export const SHADOW_RUN_MESSAGE_TYPE = "shadow_run";
export type ShadowMessageLevel = "error" | "warning" | "info";

export function formatGitCommitCustomMessage(commit: { hash: string; message: string }): string {
  const shortHash = commit.hash.slice(0, 7);
  const summary = commit.message.replace(/\s+/g, " ").trim().slice(0, 80);
  return summary ? `已提交 ${shortHash}：${summary}` : `已提交 ${shortHash}`;
}

export async function appendCustomMessage(
  storage: Pick<SQLiteSessionStorage, "appendEntry" | "getLeafId" | "createEntryId">,
  content: string,
  customType = CUSTOM_MESSAGE_TYPE,
  createdAt = Date.now(),
): Promise<string> {
  const text = content.trim();
  if (!text) throw new Error("custom message content is required");
  const id = await storage.createEntryId().catch(() => randomUUID());
  const parentId = await storage.getLeafId();
  const entry = {
    id,
    parentId,
    timestamp: new Date(createdAt).toISOString(),
    type: "custom",
    customType,
    data: { text },
  } as SessionTreeEntry;
  await storage.appendEntry(entry);
  return id;
}

export async function appendShadowRunPlaceholder(
  storage: Pick<SQLiteSessionStorage, "appendEntry" | "getLeafId" | "createEntryId">,
  startedAt: number,
): Promise<string> {
  const id = await storage.createEntryId().catch(() => randomUUID());
  const parentId = await storage.getLeafId();
  const entry = {
    id,
    parentId,
    timestamp: new Date(startedAt).toISOString(),
    type: "custom",
    customType: SHADOW_RUN_MESSAGE_TYPE,
    data: { status: "running", text: "", level: "info", startedAt },
  } as SessionTreeEntry;
  await storage.appendEntry(entry);
  return id;
}

export function updateShadowRunMessage(
  db: SupervisorDb,
  sessionId: number,
  entryId: string,
  patch: {
    status: "completed" | "failed";
    text?: string;
    level?: ShadowMessageLevel;
  },
): boolean {
  const row = db.db
    .prepare("SELECT payload FROM messages WHERE session_id = ? AND entry_id = ?")
    .get(sessionId, entryId) as { payload: string } | undefined;
  if (!row) return false;
  const entry = JSON.parse(row.payload) as SessionTreeEntry;
  if (entry.type !== "custom" || entry.customType !== SHADOW_RUN_MESSAGE_TYPE) return false;
  const existingData =
    entry.data && typeof entry.data === "object" && !Array.isArray(entry.data) ? entry.data : {};
  entry.data = { ...existingData, ...patch };
  db.db
    .prepare("UPDATE messages SET payload = ? WHERE session_id = ? AND entry_id = ?")
    .run(JSON.stringify(entry), sessionId, entryId);
  return true;
}

export async function appendShadowMessage(
  storage: Pick<SQLiteSessionStorage, "appendEntry" | "getLeafId" | "createEntryId">,
  content: string,
  level: ShadowMessageLevel,
): Promise<string> {
  const text = content.trim();
  if (!text) throw new Error("shadow message content is required");
  const id = await storage.createEntryId().catch(() => randomUUID());
  const parentId = await storage.getLeafId();
  const entry = {
    id,
    parentId,
    timestamp: new Date().toISOString(),
    type: "custom",
    customType: SHADOW_MESSAGE_TYPE,
    data: { text, level },
  } as SessionTreeEntry;
  await storage.appendEntry(entry);
  return id;
}
