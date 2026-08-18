/** Light turn index for minimap / local archive (one user turn = one tick). */
export type TurnIndex = {
  sessionId: string;
  /** Stable id for the turn; equals userEntryId. */
  turnId: string;
  userEntryId: string;
  summary: string;
  createdAt: number;
  roleHint: "user";
};

export type SyncMeta = {
  sessionId: string;
  oldestRowId: number | null;
  newestRowId: number | null;
  hasMore: boolean;
  updatedAt: number;
};

export type MessageStorageKind = "indexeddb" | "capacitor" | "memory";

export type ClientCacheRecord = {
  scope: string;
  cacheKey: string;
  schemaVersion: number;
  payload: unknown;
  savedAt: number;
  syncedAt: number | null;
  fingerprint?: string | null;
};
