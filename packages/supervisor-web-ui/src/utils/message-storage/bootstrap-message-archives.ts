import * as api from "@/api";
import { createMessageStorage, degradeMessageStorageToMemory } from "./create-message-storage";
import { syncSessionArchive } from "./sync-session-archive";

export type BootstrapArchiveProgress = {
  phase: "prepare" | "syncing" | "done" | "skipped";
  current: number;
  total: number;
  sessionId?: string;
  label: string;
};

/**
 * After auth / during startup loading: prune deleted sessions, then sync every
 * session archive into local MessageStorage (IndexedDB / Capacitor SQLite).
 */
export async function bootstrapMessageArchives(
  onProgress?: (progress: BootstrapArchiveProgress) => void,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const report = (progress: BootstrapArchiveProgress) => onProgress?.(progress);
  report({ phase: "prepare", current: 0, total: 0, label: "正在准备本地消息同步…" });

  let storage = await createMessageStorage();
  if (!storage.persistent) {
    report({ phase: "skipped", current: 0, total: 0, label: "当前环境不支持本地消息库，已跳过" });
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
    report({ phase: "done", current: 0, total: 0, label: "暂无会话需要同步" });
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
      label: `正在同步会话消息 ${index + 1}/${total}`,
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
          label: "本地存储写入失败，已降级跳过全量同步",
        });
        return;
      }
    }
  }

  report({ phase: "done", current: total, total, label: "会话消息同步完成" });
}
