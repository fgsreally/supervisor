import { createMessageStorage } from "./message-storage";
import type { ClientCacheRecord } from "./message-storage/types";

export type CacheReadResult<T> = {
  value: T;
  savedAt: number;
  syncedAt: number | null;
  fingerprint: string | null;
} | null;

// The API base is part of the scope so switching mobile Supervisor instances never mixes data.
function cacheScope(): string {
  if (typeof window === "undefined") return "server";
  return `${window.location.origin}${window.location.pathname.split("/").slice(0, -1).join("/")}`;
}

export async function readClientCache<T>(cacheKey: string): Promise<CacheReadResult<T>> {
  const record = await (await createMessageStorage()).getClientCache(cacheScope(), cacheKey);
  if (!record) return null;
  return {
    value: record.payload as T,
    savedAt: record.savedAt,
    syncedAt: record.syncedAt,
    fingerprint: record.fingerprint ?? null,
  };
}

export async function writeClientCache<T>(
  cacheKey: string,
  value: T,
  syncedAt = Date.now(),
  fingerprint: string | null = null,
): Promise<void> {
  const record: ClientCacheRecord = {
    scope: cacheScope(),
    cacheKey,
    schemaVersion: 1,
    payload: value,
    savedAt: Date.now(),
    syncedAt,
    fingerprint,
  };
  await (await createMessageStorage()).putClientCache(record);
}

export async function deleteClientCache(cacheKey: string): Promise<void> {
  await (await createMessageStorage()).deleteClientCache(cacheScope(), cacheKey);
}

export function cacheKey(resource: string, query?: unknown): string {
  return query === undefined ? resource : `${resource}:${JSON.stringify(query)}`;
}
