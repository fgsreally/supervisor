import type { SessionTreeEntry } from "@earendil-works/pi-agent-core";
import type { AppendEntryOptions } from "./session-storage.js";

export type SessionUnreadHandler = (
  sessionId: number,
  entry: SessionTreeEntry,
  options: AppendEntryOptions,
) => void | Promise<void>;

let unreadHandler: SessionUnreadHandler | null = null;

/** SessionManager registers this so every SQLiteSessionStorage write can update unread state. */
export function setSessionUnreadHandler(handler: SessionUnreadHandler | null): void {
  unreadHandler = handler;
}

export async function notifySessionEntryAppended(
  sessionId: number,
  entry: SessionTreeEntry,
  options: AppendEntryOptions,
): Promise<void> {
  if (!unreadHandler) return;
  await unreadHandler(sessionId, entry, options);
}
