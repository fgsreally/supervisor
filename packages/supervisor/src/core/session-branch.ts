import { randomUUID } from "node:crypto";
import type { SessionTreeEntry } from "@earendil-works/pi-agent-core";
import type { SQLiteSessionStorage } from "./session-storage.js";

export type SessionBranchType = "spawn" | "fork" | "clone";
type InheritableEntry = SessionTreeEntry & { source?: string | null };

/**
 * Deep-copy entries with new ids, remapped parentId chain, and is_old=1.
 * Parent session is implied by sessions.parent_id — no extra id column needed.
 */
export async function copyMessagesWithInheritance(
  storage: SQLiteSessionStorage,
  entries: InheritableEntry[],
): Promise<number> {
  const idMap = new Map<string, string>();
  for (const entry of entries) {
    const newId = randomUUID();
    idMap.set(entry.id, newId);
    const copied: SessionTreeEntry = {
      ...entry,
      id: newId,
      parentId: entry.parentId ? (idMap.get(entry.parentId) ?? null) : null,
    };
    await storage.appendEntry(copied, { isOld: true, source: entry.source ?? null });
  }
  return entries.length;
}
