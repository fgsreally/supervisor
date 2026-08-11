import * as api from "@/api";
import { sessionTreeToChatEntries } from "@/utils/session-entries";
import { chatEntriesToTurns } from "@/utils/session-turns";
import type { MessageStorage } from "./message-storage";
import type { SyncMeta } from "./types";

const PAGE_LIMIT = 80;
const PAGE_GAP_MS = 80;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertFromPage(storage: MessageStorage, sessionId: string, messages: api.SessionTreeEntry[]) {
  const entries = sessionTreeToChatEntries(messages);
  const turns = chatEntriesToTurns(sessionId, entries);
  if (turns.length) await storage.upsertTurns(sessionId, turns);
}

/**
 * Fully sync one session's lite history into MessageStorage (newest → older).
 * Safe to call repeatedly; resumes via syncMeta.hasMore / oldestRowId.
 */
export async function syncSessionArchive(
  storage: MessageStorage,
  sessionId: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  if (!storage.persistent) return;
  const signal = options?.signal;

  let meta = await storage.getSyncMeta(sessionId);

  if (!meta) {
    if (signal?.aborted) return;
    const page = await api.getSessionMessagesPage(sessionId, {
      limit: PAGE_LIMIT,
      view: "lite",
    });
    if (signal?.aborted) return;
    await upsertFromPage(storage, sessionId, page.messages);
    meta = {
      sessionId,
      oldestRowId: page.oldestRowId,
      newestRowId: page.newestRowId,
      hasMore: page.hasMore,
      updatedAt: Date.now(),
    };
    await storage.putSyncMeta(meta);
  } else {
    // Warm: refresh newest page first, then continue older if needed.
    if (signal?.aborted) return;
    const newest = await api.getSessionMessagesPage(sessionId, {
      limit: PAGE_LIMIT,
      view: "lite",
    });
    if (signal?.aborted) return;
    await upsertFromPage(storage, sessionId, newest.messages);
    meta = {
      sessionId,
      oldestRowId: meta.oldestRowId ?? newest.oldestRowId,
      newestRowId: newest.newestRowId,
      hasMore: meta.hasMore,
      updatedAt: Date.now(),
    };
    await storage.putSyncMeta(meta);
  }

  let beforeId = meta.oldestRowId;
  let hasMore = meta.hasMore;

  while (hasMore && beforeId != null) {
    if (signal?.aborted) return;
    const page = await api.getSessionMessagesPage(sessionId, {
      limit: PAGE_LIMIT,
      beforeId,
      view: "lite",
    });
    if (signal?.aborted) return;
    await upsertFromPage(storage, sessionId, page.messages);
    beforeId = page.oldestRowId;
    hasMore = page.hasMore;
    const next: SyncMeta = {
      sessionId,
      oldestRowId: page.oldestRowId,
      newestRowId: meta.newestRowId ?? page.newestRowId,
      hasMore: page.hasMore,
      updatedAt: Date.now(),
    };
    await storage.putSyncMeta(next);
    meta = next;
    await sleep(PAGE_GAP_MS);
  }
}
