import { MessageStorage } from "./message-storage";
import type { ClientCacheRecord, SyncMeta, TurnIndex } from "./types";

/** In-process fallback when IndexedDB / Capacitor SQLite are unavailable. */
export class MemoryMessageStorage extends MessageStorage {
  readonly kind = "memory" as const;
  readonly persistent = false;

  private turns = new Map<string, Map<string, TurnIndex>>();
  private syncMeta = new Map<string, SyncMeta>();
  private clientCache = new Map<string, ClientCacheRecord>();

  async init(): Promise<void> {
    // no-op
  }

  async getSyncMeta(sessionId: string): Promise<SyncMeta | null> {
    return this.syncMeta.get(sessionId) ?? null;
  }

  async putSyncMeta(meta: SyncMeta): Promise<void> {
    this.syncMeta.set(meta.sessionId, meta);
  }

  async listTurns(sessionId: string): Promise<TurnIndex[]> {
    const map = this.turns.get(sessionId);
    if (!map) return [];
    return [...map.values()].sort(
      (a, b) => a.createdAt - b.createdAt || a.turnId.localeCompare(b.turnId),
    );
  }

  async upsertTurns(sessionId: string, turns: TurnIndex[]): Promise<void> {
    let map = this.turns.get(sessionId);
    if (!map) {
      map = new Map();
      this.turns.set(sessionId, map);
    }
    for (const turn of turns) {
      map.set(turn.turnId, { ...turn, sessionId });
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.turns.delete(sessionId);
    this.syncMeta.delete(sessionId);
  }

  async listCachedSessionIds(): Promise<string[]> {
    const ids = new Set<string>([...this.turns.keys(), ...this.syncMeta.keys()]);
    return [...ids];
  }

  private cacheId(scope: string, cacheKey: string): string {
    return `${scope}\0${cacheKey}`;
  }

  async getClientCache(scope: string, cacheKey: string): Promise<ClientCacheRecord | null> {
    return this.clientCache.get(this.cacheId(scope, cacheKey)) ?? null;
  }

  async putClientCache(record: ClientCacheRecord): Promise<void> {
    this.clientCache.set(this.cacheId(record.scope, record.cacheKey), record);
  }

  async deleteClientCache(scope: string, cacheKey: string): Promise<void> {
    this.clientCache.delete(this.cacheId(scope, cacheKey));
  }
}
