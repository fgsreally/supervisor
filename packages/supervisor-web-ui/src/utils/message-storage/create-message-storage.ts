import { Capacitor } from "@capacitor/core";
import { IndexedDBMessageStorage } from "./indexeddb-message-storage";
import { MemoryMessageStorage } from "./memory-message-storage";
import type { MessageStorage } from "./message-storage";

let singleton: MessageStorage | null = null;
let initPromise: Promise<MessageStorage> | null = null;

async function tryInit(storage: MessageStorage): Promise<MessageStorage | null> {
  try {
    await storage.init();
    return storage;
  } catch (error) {
    console.warn(`[MessageStorage] ${storage.kind} init failed, falling back`, error);
    return null;
  }
}

/**
 * Probe once and return the best available MessageStorage.
 * Native → Capacitor SQLite; Web → IndexedDB; else Memory.
 */
export async function createMessageStorage(): Promise<MessageStorage> {
  if (singleton) return singleton;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { CapacitorMessageStorage } = await import("./capacitor-message-storage");
        const native = await tryInit(new CapacitorMessageStorage());
        if (native) {
          singleton = native;
          return native;
        }
      } catch (error) {
        console.warn("[MessageStorage] Capacitor driver unavailable", error);
      }
    } else {
      const idb = await tryInit(new IndexedDBMessageStorage());
      if (idb) {
        singleton = idb;
        return idb;
      }
    }

    const memory = new MemoryMessageStorage();
    await memory.init();
    singleton = memory;
    return memory;
  })();

  return initPromise;
}

/** Test helper / forced remount. */
export function resetMessageStorageForTests(): void {
  singleton = null;
  initPromise = null;
}

/**
 * Replace the active storage with an in-memory driver after a persistent write failure.
 */
export async function degradeMessageStorageToMemory(): Promise<MessageStorage> {
  const memory = new MemoryMessageStorage();
  await memory.init();
  singleton = memory;
  initPromise = Promise.resolve(memory);
  return memory;
}
