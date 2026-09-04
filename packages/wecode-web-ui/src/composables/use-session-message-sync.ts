import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from "vue";
import * as api from "@/api";
import {
  createMessageStorage,
  degradeMessageStorageToMemory,
  type MessageStorage,
  type TurnIndex,
} from "@/utils/message-storage";
import { chatEntriesToTurns } from "@/utils/session-turns";
import { sessionTreeToChatEntries } from "@/utils/session-entries";
import type { ChatEntry } from "@/types/chat-entry";

const PAGE_LIMIT = 80;
/** Pause between background pages to avoid starving the UI. */
const PAGE_GAP_MS = 120;

export type SessionMessageSyncOptions = {
  sessionId: Ref<string>;
  /** Currently loaded chat entries (viewport window). */
  chatEntries: Ref<ChatEntry[]>;
  /** When true and storage.persistent, crawl older/newer pages into the archive. */
  enableBackgroundCrawl: { readonly value: boolean };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Hydrate turn index from MessageStorage and progressively sync lite pages.
 * Used on both PC and mobile (storage); PC also feeds MessageMinimap.
 * Cold: paginate UI as today; background fills archive.
 * Warm: local turns available immediately; background syncs newer/older.
 */
export function useSessionMessageSync(options: SessionMessageSyncOptions) {
  const storage = shallowRef<MessageStorage | null>(null);
  const turns = ref<TurnIndex[]>([]);
  const syncing = ref(false);
  const hasLocalArchive = ref(false);

  let activeSessionId: string | null = null;
  let abortSync = false;
  let syncGeneration = 0;

  async function ensureStorage(): Promise<MessageStorage> {
    if (storage.value) return storage.value;
    const next = await createMessageStorage();
    storage.value = next;
    return next;
  }

  async function safeWrite(run: (store: MessageStorage) => Promise<void>): Promise<void> {
    const store = await ensureStorage();
    try {
      await run(store);
    } catch (error) {
      console.warn("[MessageSync] persistent write failed, degrading to memory", error);
      storage.value = await degradeMessageStorageToMemory();
    }
  }

  async function loadLocalTurns(sessionId: string): Promise<TurnIndex[]> {
    const store = await ensureStorage();
    const local = await store.listTurns(sessionId);
    const meta = await store.getSyncMeta(sessionId);
    hasLocalArchive.value = local.length > 0 || meta != null;
    turns.value = local;
    return local;
  }

  async function persistEntries(sessionId: string, entries: ChatEntry[]): Promise<void> {
    const nextTurns = chatEntriesToTurns(sessionId, entries);
    if (!nextTurns.length) return;
    await safeWrite(async (store) => {
      await store.upsertTurns(sessionId, nextTurns);
    });
    if (activeSessionId === sessionId) {
      const merged = new Map(turns.value.map((t) => [t.turnId, t]));
      for (const turn of nextTurns) merged.set(turn.turnId, turn);
      turns.value = [...merged.values()].sort(
        (a, b) => a.createdAt - b.createdAt || a.turnId.localeCompare(b.turnId),
      );
    }
  }

  async function crawlOlder(sessionId: string, generation: number): Promise<void> {
    const store = await ensureStorage();
    if (!store.persistent || !options.enableBackgroundCrawl.value) return;

    let meta = await store.getSyncMeta(sessionId);
    let beforeId = meta?.oldestRowId ?? null;
    let hasMore = meta?.hasMore ?? true;

    // If no meta yet, seed from newest page
    if (!meta) {
      const page = await api.getSessionMessagesPage(sessionId, {
        limit: PAGE_LIMIT,
        view: "lite",
      });
      if (generation !== syncGeneration || abortSync || activeSessionId !== sessionId) return;
      const entries = sessionTreeToChatEntries(page.messages);
      await persistEntries(sessionId, entries);
      meta = {
        sessionId,
        oldestRowId: page.oldestRowId,
        newestRowId: page.newestRowId,
        hasMore: page.hasMore,
        updatedAt: Date.now(),
      };
      await safeWrite(async (s) => s.putSyncMeta(meta!));
      beforeId = page.oldestRowId;
      hasMore = page.hasMore;
    }

    while (hasMore && beforeId != null && !abortSync && generation === syncGeneration) {
      if (activeSessionId !== sessionId || !options.enableBackgroundCrawl.value) break;
      const page = await api.getSessionMessagesPage(sessionId, {
        limit: PAGE_LIMIT,
        beforeId,
        view: "lite",
      });
      if (generation !== syncGeneration || abortSync || activeSessionId !== sessionId) return;
      const entries = sessionTreeToChatEntries(page.messages);
      await persistEntries(sessionId, entries);
      beforeId = page.oldestRowId;
      hasMore = page.hasMore;
      await safeWrite(async (s) =>
        s.putSyncMeta({
          sessionId,
          oldestRowId: page.oldestRowId,
          newestRowId: meta?.newestRowId ?? page.newestRowId,
          hasMore: page.hasMore,
          updatedAt: Date.now(),
        }),
      );
      meta = {
        sessionId,
        oldestRowId: page.oldestRowId,
        newestRowId: meta?.newestRowId ?? page.newestRowId,
        hasMore: page.hasMore,
        updatedAt: Date.now(),
      };
      await sleep(PAGE_GAP_MS);
    }
  }

  async function crawlNewer(sessionId: string, generation: number): Promise<void> {
    const store = await ensureStorage();
    if (!store.persistent || !options.enableBackgroundCrawl.value) return;
    // Newest page refresh: upsert turns from latest window and bump newestRowId
    const page = await api.getSessionMessagesPage(sessionId, {
      limit: PAGE_LIMIT,
      view: "lite",
    });
    if (generation !== syncGeneration || abortSync || activeSessionId !== sessionId) return;
    const entries = sessionTreeToChatEntries(page.messages);
    await persistEntries(sessionId, entries);
    const prev = await store.getSyncMeta(sessionId);
    await safeWrite(async (s) =>
      s.putSyncMeta({
        sessionId,
        oldestRowId: prev?.oldestRowId ?? page.oldestRowId,
        newestRowId: page.newestRowId,
        hasMore: prev?.hasMore ?? page.hasMore,
        updatedAt: Date.now(),
      }),
    );
  }

  async function startSync(sessionId: string): Promise<void> {
    abortSync = false;
    const generation = ++syncGeneration;
    activeSessionId = sessionId;
    syncing.value = true;
    try {
      await loadLocalTurns(sessionId);
      // Always fold current viewport into archive / memory turns (fallback path).
      await persistEntries(sessionId, options.chatEntries.value);
      if (!options.enableBackgroundCrawl.value) return;
      const store = await ensureStorage();
      if (!store.persistent) return;
      await crawlNewer(sessionId, generation);
      await crawlOlder(sessionId, generation);
    } catch (error) {
      if (generation === syncGeneration) {
        console.warn("[MessageSync] background sync failed", error);
      }
    } finally {
      if (generation === syncGeneration) syncing.value = false;
    }
  }

  function stopSync(): void {
    abortSync = true;
    activeSessionId = null;
    syncGeneration += 1;
    syncing.value = false;
  }

  watch(
    () => options.sessionId.value,
    (id) => {
      stopSync();
      turns.value = [];
      hasLocalArchive.value = false;
      if (id) void startSync(id);
    },
    { immediate: true },
  );

  // Keep memory/minimap turns in sync as the viewport grows (load-older / stream).
  watch(
    () => options.chatEntries.value,
    (entries) => {
      const id = options.sessionId.value;
      if (!id || !entries.length) return;
      void persistEntries(id, entries);
    },
  );

  onBeforeUnmount(stopSync);

  return {
    storage,
    turns,
    syncing,
    hasLocalArchive,
    startSync,
    stopSync,
    persistEntries,
  };
}
