import * as api from "@/api";
import { cacheKey, readClientCache, writeClientCache } from "./client-cache";

export type ResourceOptions<T> = {
  key: string;
  queryKey?: string;
  cacheKey?: string;
  groupKey?: string;
  read: () => Promise<T>;
  apply: (value: T) => void;
  loading?: (value: boolean) => void;
  onError?: (error: unknown) => void;
};

// A resource group is refreshed once per loaded application lifecycle.
const syncedGroups = new Set<string>();
const inflight = new Map<string, Promise<unknown>>();
const loads = new Map<string, Promise<unknown>>();
const groupValues = new Map<string, unknown>();

export function resetClientResourceLifecycle(): void {
  syncedGroups.clear();
  inflight.clear();
  loads.clear();
  groupValues.clear();
}

function resourceIdentity<T>(options: ResourceOptions<T>): string {
  return options.cacheKey ?? cacheKey(options.key, options.queryKey);
}

function groupIdentity<T>(options: ResourceOptions<T>): string {
  return options.groupKey ?? resourceIdentity(options);
}

export async function loadClientResource<T>(options: ResourceOptions<T>): Promise<T> {
  const id = resourceIdentity(options);
  const existing = loads.get(id);
  if (existing) return existing as Promise<T>;

  const task = loadClientResourceInternal(options);
  loads.set(id, task);
  try {
    return await task;
  } finally {
    loads.delete(id);
  }
}

async function loadClientResourceInternal<T>(options: ResourceOptions<T>): Promise<T> {
  const id = resourceIdentity(options);
  const cached = await readClientCache<T>(id).catch(() => null);

  if (cached) {
    if (!syncedGroups.has(groupIdentity(options))) options.apply(cached.value);
    options.loading?.(false);
    groupValues.set(groupIdentity(options), cached.value);
    void syncClientResource(options, cached.fingerprint, cached.value).catch(() => undefined);
    return cached.value;
  }

  const group = groupIdentity(options);
  if (syncedGroups.has(group) && groupValues.has(group)) {
    return groupValues.get(group) as T;
  }

  options.loading?.(true);
  try {
    const refreshed = await syncClientResource<T>(options);
    if (refreshed !== undefined) return refreshed;

    const value = await options.read();
    options.apply(value);
    await writeClientCache(id, value);
    groupValues.set(group, value);
    syncedGroups.add(group);
    return value;
  } catch (error) {
    options.onError?.(error);
    throw error;
  } finally {
    options.loading?.(false);
  }
}

export function syncClientResource<T>(
  options: ResourceOptions<T>,
  cachedFingerprint: string | null = null,
  cachedValue?: T,
): Promise<T | undefined> {
  const group = groupIdentity(options);
  if (syncedGroups.has(group)) return Promise.resolve(undefined);

  const existing = inflight.get(group);
  if (existing) return existing as Promise<T | undefined>;

  const sync = (api as unknown as Record<string, unknown>).syncClientCache;
  const task = Promise.resolve(
    typeof sync === "function"
      ? (
          sync as (
            request: api.ClientCacheSyncRequest,
          ) => Promise<api.ClientCacheSyncResponse> | undefined
        ).call(api, {
          resources: [
            { key: options.key, queryKey: options.queryKey, fingerprint: cachedFingerprint },
          ],
        })
      : undefined,
  )
    .then(async (response) => {
      const item = response?.resources.find(
        (entry) => entry.key === options.key && entry.queryKey === options.queryKey,
      );
      if (item?.status === "unchanged") {
        if (cachedValue !== undefined) {
          await writeClientCache(
            resourceIdentity(options),
            cachedValue,
            item.syncedAt,
            item.fingerprint,
          );
          groupValues.set(group, cachedValue);
        }
        syncedGroups.add(group);
        return undefined;
      }
      if (item?.status === "updated" && item.data !== undefined) {
        const value = item.data as T;
        await writeClientCache(resourceIdentity(options), value, item.syncedAt, item.fingerprint);
        options.apply(value);
        groupValues.set(group, value);
        syncedGroups.add(group);
        return value;
      }

      const value = await options.read();
      options.apply(value);
      await writeClientCache(resourceIdentity(options), value);
      groupValues.set(group, value);
      syncedGroups.add(group);
      return value;
    })
    .catch((error) => {
      options.onError?.(error);
      throw error;
    })
    .finally(() => {
      inflight.delete(group);
    });

  inflight.set(group, task);
  return task as Promise<T | undefined>;
}
