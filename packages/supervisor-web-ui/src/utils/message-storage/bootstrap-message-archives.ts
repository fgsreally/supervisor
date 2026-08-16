import * as api from "@/api";
import { createMessageStorage, degradeMessageStorageToMemory } from "./create-message-storage";
import { syncSessionArchive } from "./sync-session-archive";
import { translate as t } from "@/i18n";

export type BootstrapArchiveProgress = {
  phase: "prepare" | "syncing" | "done" | "skipped";
  current: number;
  total: number;
  sessionId?: string;
  label: string;
};

/**
 * Optional full-archive crawl for every session.
 * Not used at app startup — message sync happens when opening a session
 * via `useSessionMessageSync`. Kept for manual / tooling use.
 */
export async function bootstrapMessageArchives(
  onProgress?: (progress: BootstrapArchiveProgress) => void,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const report = (progress: BootstrapArchiveProgress) => onProgress?.(progress);
  report({ phase: "prepare", current: 0, total: 0, label: t("archive.prepare") });

  let storage = await createMessageStorage();
  if (!storage.persistent) {
    report({ phase: "skipped", current: 0, total: 0, label: t("archive.skippedUnsupported") });
    return;
  }

  const sessions = await api.listSessions();
  if (options?.signal?.aborted) return;

  try {
    await storage.pruneDeletedSessions(sessions.map((session) => session.id));
  } catch (error) {
    console.warn("[MessageStorage] bootstrap prune failed", error);
  }

  const ids = sessions.map((session) => session.id);
  const total = ids.length;
  if (total === 0) {
    report({ phase: "done", current: 0, total: 0, label: t("archive.noSessions") });
    return;
  }

  for (let index = 0; index < ids.length; index++) {
    if (options?.signal?.aborted) return;
    const sessionId = ids[index]!;
    report({
      phase: "syncing",
      current: index + 1,
      total,
      sessionId,
      label: t("archive.syncing", { current: index + 1, total }),
    });
    try {
      await syncSessionArchive(storage, sessionId, { signal: options?.signal });
    } catch (error) {
      console.warn(`[MessageStorage] bootstrap sync failed for ${sessionId}`, error);
      try {
        storage = await degradeMessageStorageToMemory();
      } catch {
        // ignore
      }
      if (!storage.persistent) {
        report({
          phase: "skipped",
          current: index + 1,
          total,
          label: t("archive.storageFailed"),
        });
        return;
      }
    }
  }

  report({ phase: "done", current: total, total, label: t("archive.done") });
}
