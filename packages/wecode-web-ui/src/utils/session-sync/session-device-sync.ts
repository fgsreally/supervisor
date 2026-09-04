import * as api from "@/api";

const DRAFT_KEY_PREFIX = "wecode:session-draft:";
const SAVE_DELAY_MS = 500;

type LoadedSessionDeviceSync = {
  draft: api.SessionDeviceSyncSnapshot["draft"];
  stream: api.SessionDeviceSyncSnapshot["stream"] | null;
};

function draftKey(sessionId: string): string {
  return `${DRAFT_KEY_PREFIX}${sessionId}`;
}

function readLocalDraft(sessionId: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(draftKey(sessionId));
  } catch {
    return null;
  }
}

function writeLocalDraft(sessionId: string, text: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (text) localStorage.setItem(draftKey(sessionId), text);
    else localStorage.removeItem(draftKey(sessionId));
  } catch {
    // Local storage is only an offline fallback; the server remains authoritative.
  }
}

/** Coordinates the two small pieces of Session state needed after a device switch. */
export class SessionDeviceSync {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingWrites = new Map<string, Promise<void>>();

  async load(sessionId: string): Promise<LoadedSessionDeviceSync | null> {
    try {
      const snapshot = await api.getSessionDeviceSync(sessionId);
      writeLocalDraft(sessionId, snapshot.draft?.text ?? "");
      return snapshot;
    } catch {
      const localDraft = readLocalDraft(sessionId);
      return localDraft
        ? {
            draft: { text: localDraft, updatedAt: 0 },
            stream: null,
          }
        : null;
    }
  }

  scheduleDraftSave(sessionId: string, text: string): void {
    writeLocalDraft(sessionId, text);
    const previous = this.timers.get(sessionId);
    if (previous) clearTimeout(previous);
    this.timers.set(
      sessionId,
      setTimeout(() => {
        this.timers.delete(sessionId);
        void this.saveDraft(sessionId, text);
      }, SAVE_DELAY_MS),
    );
  }

  async clearDraft(sessionId: string): Promise<void> {
    const previous = this.timers.get(sessionId);
    if (previous) clearTimeout(previous);
    this.timers.delete(sessionId);
    writeLocalDraft(sessionId, "");
    await this.saveDraft(sessionId, "");
  }

  async flush(sessionId?: string): Promise<void> {
    const ids = sessionId ? [sessionId] : [...this.timers.keys()];
    const scheduled = ids.map(async (id) => {
      const timer = this.timers.get(id);
      if (!timer) return;
      clearTimeout(timer);
      this.timers.delete(id);
      await this.saveDraft(id, readLocalDraft(id) ?? "");
    });
    const pending = (
      sessionId ? [this.pendingWrites.get(sessionId)] : [...this.pendingWrites.values()]
    ).filter((request): request is Promise<void> => !!request);
    await Promise.all([...scheduled, ...pending]);
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async saveDraft(sessionId: string, text: string): Promise<void> {
    const previous = this.pendingWrites.get(sessionId) ?? Promise.resolve();
    const request = previous
      .then(() => api.updateSessionDraft(sessionId, text))
      .then(
        () => undefined,
        () => undefined,
      );
    this.pendingWrites.set(sessionId, request);
    await request;
    if (this.pendingWrites.get(sessionId) === request) this.pendingWrites.delete(sessionId);
  }
}
