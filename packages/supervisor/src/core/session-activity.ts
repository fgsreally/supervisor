import type { SupervisorDb } from "../db/db.js";
import type { SessionStatus } from "../types.js";
import type { ExtensionSession } from "../extension/types.js";

export const SESSION_ACTIVITY_IDLE_MS = 24 * 60 * 60 * 1000;
export const SESSION_ACTIVITY_TICK_MS = 5 * 60 * 1000;

/** Sessions that opted into session-activity via session.policy.active. */
const activeActivitySessions = new Set<number>();

export function hasSessionActivityPolicy(sessionId: number): boolean {
  return activeActivitySessions.has(sessionId);
}

export function clearSessionActivityPolicy(sessionId: number): void {
  activeActivitySessions.delete(sessionId);
}

/** Wire message events to touch activity; marks the Session for idle scheduling. */
export function applySessionActivityPolicy(session: ExtensionSession): void {
  activeActivitySessions.add(session.id);
  const touch = () => session.activity.touch();
  session.on("message.user", touch, { priority: 1000 });
  session.on("message.assistant", touch, { priority: 1000 });
  session.on("message.tool_call", touch, { priority: 1000 });
  session.on("message.tool_result", touch, { priority: 1000 });
  session.on("message.custom", touch, { priority: 1000 });
}

export function touchSessionActivity(db: SupervisorDb, id: number, at = Date.now()): void {
  const row = db.get(id);
  if (!row) return;
  const protectedStatuses: SessionStatus[] = [
    "initializing",
    "running",
    "blocked",
    "finish",
    "finished",
    "error",
    "stopped",
  ];
  if (!protectedStatuses.includes(row.status)) db.updateStatus(id, "active");
  else db.touchSessionActivityTree(id, at);
}

export function runSessionActivityTick(
  db: SupervisorDb,
  now = Date.now(),
  idleMs = SESSION_ACTIVITY_IDLE_MS,
  shouldIdle?: (sessionId: number) => boolean,
): number {
  if (shouldIdle) {
    let changes = 0;
    for (const row of db.list({ status: "active" })) {
      if ((row.last_active_at ?? row.created_at) > now - idleMs) continue;
      if (!shouldIdle(row.id)) continue;
      db.updateStatus(row.id, "idle");
      changes += 1;
    }
    return changes;
  }
  const result = db.db
    .prepare(
      `UPDATE sessions
       SET status = 'idle'
       WHERE status = 'active' AND last_active_at <= ?`,
    )
    .run(now - idleMs) as { changes?: number };
  return result.changes ?? 0;
}

export function startSessionActivityScheduler(
  db: SupervisorDb,
  onUpdated?: (sessionId: number) => void,
  shouldIdle?: (sessionId: number) => boolean,
): () => void {
  const tick = () => {
    const before = new Set(db.list({ status: "active" }).map((row) => row.id));
    runSessionActivityTick(db, Date.now(), SESSION_ACTIVITY_IDLE_MS, shouldIdle);
    for (const id of before) if (db.get(id)?.status === "idle") onUpdated?.(id);
  };
  tick();
  const timer = setInterval(tick, SESSION_ACTIVITY_TICK_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
