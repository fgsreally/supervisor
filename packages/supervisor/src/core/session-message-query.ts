import type { MessageRow, SessionMessageResponse, SessionMessagesPage } from "../types.js";
import type { SupervisorDb } from "../db/db.js";
import { rowToStoredMessage, toSessionMessageResponse } from "./session-storage.js";
import { toLiteSessionMessage } from "./session-message-lite.js";

const DEFAULT_PAGE_LIMIT = 80;
const MAX_PAGE_LIMIT = 200;
const MAX_TURN_EXPAND = 60;

function isTurnBoundary(row: MessageRow): boolean {
  if (row.type === "system" || row.type === "compaction") return true;
  if (row.type === "message" && row.message_role === "user") return true;
  return false;
}

/**
 * Fetch a newest-first page, then expand older rows so we don't split an
 * assistant turn (toolResult dangling without its assistant/user start).
 */
export function querySessionMessagesPage(
  db: SupervisorDb,
  sessionId: number,
  options?: {
    beforeId?: number;
    limit?: number;
    view?: "lite" | "full";
  },
): SessionMessagesPage {
  const limit = Math.max(1, Math.min(options?.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT));
  const view = options?.view ?? "lite";

  let rows = db.getMessageRowsPage(sessionId, {
    beforeId: options?.beforeId,
    limit,
  });

  if (rows.length > 0) {
    let oldest = rows[rows.length - 1]!;
    let expanded = 0;
    while (!isTurnBoundary(oldest) && expanded < MAX_TURN_EXPAND) {
      const more = db.getMessageRowsPage(sessionId, {
        beforeId: oldest.id,
        limit: 1,
      });
      if (more.length === 0) break;
      rows = [...rows, ...more];
      oldest = more[0]!;
      expanded += 1;
      if (isTurnBoundary(oldest)) break;
    }
  }

  // rows are newest→oldest; UI wants chronological ascending
  const chronological = [...rows].reverse();
  const messages = chronological.map((row) => {
    const full = toSessionMessageResponse(rowToStoredMessage(row));
    return view === "full" ? full : toLiteSessionMessage(full);
  });

  const ids = rows.map((r) => r.id);
  const minId = ids.length ? Math.min(...ids) : null;
  const maxId = ids.length ? Math.max(...ids) : null;
  const hasMore = minId != null ? db.hasOlderMessages(sessionId, minId) : false;

  return {
    messages,
    hasMore,
    oldestRowId: minId,
    newestRowId: maxId,
  };
}

export function getSessionMessageByEntryId(
  db: SupervisorDb,
  sessionId: number,
  entryId: string,
): SessionMessageResponse | null {
  const row = db.getMessageRowByEntryId(sessionId, entryId);
  if (!row) return null;
  return toSessionMessageResponse(rowToStoredMessage(row));
}
