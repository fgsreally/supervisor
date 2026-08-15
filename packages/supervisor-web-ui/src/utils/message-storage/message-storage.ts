import type { ClientCacheRecord, MessageStorageKind, SyncMeta, TurnIndex } from "./types";

/**
 * Local message archive adapter.
 * Web → IndexedDBMessageStorage; Capacitor → CapacitorMessageStorage; fallback → Memory.
 */
export abstract class MessageStorage {
  abstract readonly kind: MessageStorageKind;
  /** false = do not crawl full history in background sync */
  abstract readonly persistent: boolean;

  abstract init(): Promise<void>;

  abstract getSyncMeta(sessionId: string): Promise<SyncMeta | null>;
  abstract putSyncMeta(meta: SyncMeta): Promise<void>;

  abstract listTurns(sessionId: string): Promise<TurnIndex[]>;
  abstract upsertTurns(sessionId: string, turns: TurnIndex[]): Promise<void>;

  /** Delete all local message cache for a session (turns + syncMeta). */
  abstract deleteSession(sessionId: string): Promise<void>;

  /** Session ids that have any local cache (for reconcile with remote list). */
  abstract listCachedSessionIds(): Promise<string[]>;

  abstract getClientCache(scope: string, cacheKey: string): Promise<ClientCacheRecord | null>;
  abstract putClientCache(record: ClientCacheRecord): Promise<void>;
  abstract deleteClientCache(scope: string, cacheKey: string): Promise<void>;

  /**
   * Drop local caches for sessions missing from the remote list
   * (e.g. deleted on another device). Call after fetchSessions succeeds.
   */
  async pruneDeletedSessions(remoteSessionIds: Iterable<string>): Promise<string[]> {
    const remote = new Set(remoteSessionIds);
    const local = await this.listCachedSessionIds();
    const removed: string[] = [];
    for (const id of local) {
      if (!remote.has(id)) {
        await this.deleteSession(id);
        removed.push(id);
      }
    }
    return removed;
  }
}
