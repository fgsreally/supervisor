import { randomUUID } from "node:crypto";
import type { SessionTreeEntry } from "@earendil-works/pi-agent-core";
import type { SQLiteSessionStorage } from "./session-storage.js";

/**
 * Timeline-only custom message.
 * Stored as `type: "custom"` so pi never includes it in the LLM context.
 */
export const CUSTOM_MESSAGE_TYPE = "custom_message";

export function formatGitCommitCustomMessage(commit: { hash: string; message: string }): string {
  const shortHash = commit.hash.slice(0, 7);
  const summary = commit.message.replace(/\s+/g, " ").trim().slice(0, 80);
  return summary ? `已提交 ${shortHash}：${summary}` : `已提交 ${shortHash}`;
}

export async function appendCustomMessage(
  storage: Pick<SQLiteSessionStorage, "appendEntry" | "getLeafId" | "createEntryId">,
  content: string,
): Promise<string> {
  const text = content.trim();
  if (!text) throw new Error("custom message content is required");
  const id = await storage.createEntryId().catch(() => randomUUID());
  const parentId = await storage.getLeafId();
  const entry = {
    id,
    parentId,
    timestamp: new Date().toISOString(),
    type: "custom",
    customType: CUSTOM_MESSAGE_TYPE,
    data: { text },
  } as SessionTreeEntry;
  await storage.appendEntry(entry);
  return id;
}
