import type { SupervisorDb } from "../../../db/db.js";
import type { SessionState } from "../session-runtime.js";

export interface SessionDraftSnapshot {
  text: string;
  updatedAt: number;
}

export interface SessionStreamSnapshot {
  isStreaming: boolean;
  streamingReply: string;
}

export interface SessionDeviceSyncSnapshot {
  draft: SessionDraftSnapshot | null;
  stream: SessionStreamSnapshot;
}

/** Session-scoped state that is useful when a user changes devices. */
export class SessionDeviceSync {
  constructor(private readonly db: SupervisorDb) {}

  getSnapshot(sessionId: number, state: SessionState): SessionDeviceSyncSnapshot {
    return {
      draft: this.getDraft(sessionId),
      stream: {
        isStreaming: state.isStreaming,
        streamingReply: state.streamingReply ?? "",
      },
    };
  }

  setDraft(sessionId: number, text: string): SessionDraftSnapshot | null {
    if (!this.db.get(sessionId)) throw new Error(`Session ${sessionId} not found`);
    const normalized = text.trim() ? text : "";
    if (!normalized) {
      this.db.db.prepare("DELETE FROM session_drafts WHERE session_id = ?").run(sessionId);
      return null;
    }

    const updatedAt = Date.now();
    this.db.db
      .prepare(
        `INSERT INTO session_drafts (session_id, text, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
      )
      .run(sessionId, text, updatedAt);
    return { text, updatedAt };
  }

  private getDraft(sessionId: number): SessionDraftSnapshot | null {
    const row = this.db.db
      .prepare("SELECT text, updated_at FROM session_drafts WHERE session_id = ?")
      .get(sessionId) as { text: string; updated_at: number } | undefined;
    return row ? { text: row.text, updatedAt: row.updated_at } : null;
  }
}
