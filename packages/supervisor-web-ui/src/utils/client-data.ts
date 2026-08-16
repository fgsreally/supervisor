import * as api from "@/api";
import { cacheKey, readClientCache, writeClientCache } from "./client-cache";

type ResourceOptions<T> = {
  key: string;
  queryKey?: string;
  read: () => Promise<T>;
  apply: (value: T) => void;
  loading?: (value: boolean) => void;
  onError?: (error: unknown) => void;
};

const inflight = new Map<string, Promise<void>>();
const generations = new Map<string, number>();
const retryCounts = new Map<string, number>();

function identity(key: string, queryKey?: string): string {
  return cacheKey(key, queryKey);
}

export async function loadClientResource<T>(options: ResourceOptions<T>): Promise<T> {
  const id = identity(options.key, options.queryKey);
  const cached = await readClientCache<T>(id).catch(() => null);
  if (cached) {
    options.apply(cached.value);
    options.loading?.(false);
    void syncClientResource(options);
    return cached.value;
  }

  options.loading?.(true);
  try {
    const value = await options.read();
    options.apply(value);
    await writeClientCache(id, value);
    void syncClientResource(options);
    return value;
  } catch (error) {
    options.onError?.(error);
    throw error;
  } finally {
    options.loading?.(false);
  }
}

export function syncClientResource<T>(options: ResourceOptions<T>): Promise<void> {
  const id = identity(options.key, options.queryKey);
  const existing = inflight.get(id);
  if (existing) return existing;
  // Keeps lightweight Store API mocks and older embedded UI bundles compatible.
  const sync = (api as unknown as Record<string, unknown>).syncClientCache;
  if (typeof sync !== "function") return Promise.resolve();
  const generation = generations.get(id) ?? 0;
  const task = Promise.resolve(
    (sync as (request: api.ClientCacheSyncRequest) => Promise<api.ClientCacheSyncResponse> | undefined)
      .call(api, { resources: [{ key: options.key, queryKey: options.queryKey }] }),
  )
    .then(async (response) => {
      if (!response) return;
      const item = response.resources.find(
        (entry) => entry.key === options.key && entry.queryKey === options.queryKey,
      );
      if (!item || item.status === "deleted" || item.data === undefined) return;
      if ((generations.get(id) ?? 0) !== generation) return;
      const value = item.data as T;
      await writeClientCache(id, value, item.syncedAt);
      options.apply(value);
      retryCounts.delete(id);
    })
    .catch(async (error) => {
      try {
        const value = await options.read();
        if ((generations.get(id) ?? 0) !== generation) return;
        await writeClientCache(id, value);
        options.apply(value);
        retryCounts.delete(id);
      } catch {
        options.onError?.(error);
        const retry = Math.min((retryCounts.get(id) ?? 0) + 1, 5);
        retryCounts.set(id, retry);
        globalThis.setTimeout(() => {
          void syncClientResource(options);
        }, Math.min(30_000, 1_000 * 2 ** retry));
      }
    })
    .finally(() => {
      inflight.delete(id);
    });
  inflight.set(id, task);
  return task;
}

export function invalidateClientResource(key: string, queryKey?: string): void {
  const id = identity(key, queryKey);
  generations.set(id, (generations.get(id) ?? 0) + 1);
}

export function invalidateAndSyncClientResource<T>(options: ResourceOptions<T>): Promise<void> {
  invalidateClientResource(options.key, options.queryKey);
  return syncClientResource(options);
}
