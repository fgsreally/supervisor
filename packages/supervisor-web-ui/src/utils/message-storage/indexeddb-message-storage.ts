import { MessageStorage } from "./message-storage";
import type { ClientCacheRecord, SyncMeta, TurnIndex } from "./types";

const DB_NAME = "supervisor-session-archive";
const DB_VERSION = 2;
const STORE_TURNS = "turns";
const STORE_SYNC = "syncMeta";
const STORE_CACHE = "clientCache";

function turnKey(sessionId: string, turnId: string): string {
  return `${sessionId}\0${turnId}`;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/** Web / desktop IndexedDB implementation of MessageStorage. */
export class IndexedDBMessageStorage extends MessageStorage {
  readonly kind = "indexeddb" as const;
  readonly persistent = true;

  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (typeof indexedDB === "undefined") {
      throw new Error("IndexedDB is not available");
    }
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const openReq = indexedDB.open(DB_NAME, DB_VERSION);
      openReq.onerror = () => reject(openReq.error ?? new Error("IndexedDB open failed"));
      openReq.onupgradeneeded = () => {
        const db = openReq.result;
        if (!db.objectStoreNames.contains(STORE_TURNS)) {
          const turns = db.createObjectStore(STORE_TURNS, { keyPath: "key" });
          turns.createIndex("bySession", "sessionId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SYNC)) {
          db.createObjectStore(STORE_SYNC, { keyPath: "sessionId" });
        }
        if (!db.objectStoreNames.contains(STORE_CACHE)) {
          db.createObjectStore(STORE_CACHE, { keyPath: "id" });
        }
      };
      openReq.onsuccess = () => resolve(openReq.result);
    });
  }

  private requireDb(): IDBDatabase {
    if (!this.db) throw new Error("IndexedDBMessageStorage not initialized");
    return this.db;
  }

  private async withStore<T>(
    storeNames: string | string[],
    mode: IDBTransactionMode,
    run: (tx: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    const db = this.requireDb();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      let result: T;
      let failed = false;
      tx.oncomplete = () => {
        if (!failed) resolve(result);
      };
      tx.onerror = () => {
        failed = true;
        reject(tx.error ?? new Error("IndexedDB transaction failed"));
      };
      tx.onabort = () => {
        failed = true;
        reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      };
      void run(tx)
        .then((value) => {
          result = value;
        })
        .catch((error) => {
          failed = true;
          reject(error);
          try {
            tx.abort();
          } catch {
            // ignore
          }
        });
    });
  }

  async getSyncMeta(sessionId: string): Promise<SyncMeta | null> {
    return this.withStore(STORE_SYNC, "readonly", async (tx) => {
      const row = await request(tx.objectStore(STORE_SYNC).get(sessionId));
      return (row as SyncMeta | undefined) ?? null;
    });
  }

  async putSyncMeta(meta: SyncMeta): Promise<void> {
    await this.withStore(STORE_SYNC, "readwrite", async (tx) => {
      await request(tx.objectStore(STORE_SYNC).put(meta));
    });
  }

  async listTurns(sessionId: string): Promise<TurnIndex[]> {
    return this.withStore(STORE_TURNS, "readonly", async (tx) => {
      const index = tx.objectStore(STORE_TURNS).index("bySession");
      const rows = await request(index.getAll(sessionId));
      const turns = (rows as Array<TurnIndex & { key: string }>).map(
        ({ key: _key, ...turn }) => turn,
      );
      return turns.sort((a, b) => a.createdAt - b.createdAt || a.turnId.localeCompare(b.turnId));
    });
  }

  async upsertTurns(sessionId: string, turns: TurnIndex[]): Promise<void> {
    if (!turns.length) return;
    await this.withStore(STORE_TURNS, "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_TURNS);
      for (const turn of turns) {
        const row = { ...turn, sessionId, key: turnKey(sessionId, turn.turnId) };
        await request(store.put(row));
      }
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.withStore([STORE_TURNS, STORE_SYNC], "readwrite", async (tx) => {
      const turnsStore = tx.objectStore(STORE_TURNS);
      const index = turnsStore.index("bySession");
      const keys = await request(index.getAllKeys(sessionId));
      for (const key of keys) {
        await request(turnsStore.delete(key));
      }
      await request(tx.objectStore(STORE_SYNC).delete(sessionId));
    });
  }

  async listCachedSessionIds(): Promise<string[]> {
    return this.withStore([STORE_TURNS, STORE_SYNC], "readonly", async (tx) => {
      const ids = new Set<string>();
      const syncKeys = await request(tx.objectStore(STORE_SYNC).getAllKeys());
      for (const key of syncKeys) ids.add(String(key));
      const turnRows = await request(tx.objectStore(STORE_TURNS).getAll());
      for (const row of turnRows as Array<{ sessionId?: string }>) {
        if (row.sessionId) ids.add(row.sessionId);
      }
      return [...ids];
    });
  }

  private cacheId(scope: string, cacheKey: string): string {
    return `${scope}\0${cacheKey}`;
  }

  async getClientCache(scope: string, cacheKey: string): Promise<ClientCacheRecord | null> {
    return this.withStore(STORE_CACHE, "readonly", async (tx) => {
      const row = await request(tx.objectStore(STORE_CACHE).get(this.cacheId(scope, cacheKey)));
      if (!row) return null;
      const { id: _id, ...record } = row as ClientCacheRecord & { id: string };
      return record;
    });
  }

  async putClientCache(record: ClientCacheRecord): Promise<void> {
    await this.withStore(STORE_CACHE, "readwrite", async (tx) => {
      await request(tx.objectStore(STORE_CACHE).put({ ...record, id: this.cacheId(record.scope, record.cacheKey) }));
    });
  }

  async deleteClientCache(scope: string, cacheKey: string): Promise<void> {
    await this.withStore(STORE_CACHE, "readwrite", async (tx) => {
      await request(tx.objectStore(STORE_CACHE).delete(this.cacheId(scope, cacheKey)));
    });
  }
}
