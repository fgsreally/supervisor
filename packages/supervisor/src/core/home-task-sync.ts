import type { HomeTaskStatus, SessionStatus } from "../types.js";
import type { SupervisorDb } from "../db/db.js";

function mapSessionStatusToHomeTask(status: SessionStatus): HomeTaskStatus | null {
  if (status === "running" || status === "waiting_user" || status === "idle" || status === "starting") {
    return "in_progress";
  }
  if (status === "finish" || status === "finished") return "done";
  if (status === "error" || status === "stopped") return "error";
  return null;
}

/** Sync home task rows when a linked session changes status. */
export function syncHomeTaskFromSessionStatus(
  db: SupervisorDb,
  sessionId: number,
  status: SessionStatus,
): void {
  const task = db.getHomeTaskBySessionId(sessionId);
  if (!task) return;

  const nextStatus = mapSessionStatusToHomeTask(status);
  if (!nextStatus) return;

  const error =
    nextStatus === "error"
      ? status === "stopped"
        ? "session stopped"
        : "session error"
      : null;

  if (task.status !== nextStatus || task.error !== error) {
    db.updateHomeTask(task.id, { status: nextStatus, error });
  }

  if (!task.parentId) return;

  const siblings = db.listHomeTaskChildren(task.parentId);
  if (siblings.length === 0) return;

  const allDone = siblings.every((item) => item.status === "done");
  const anyError = siblings.some((item) => item.status === "error");
  const anyActive = siblings.some(
    (item) => item.status === "in_progress" || item.status === "todo" || item.status === "backlog",
  );

  let parentStatus: HomeTaskStatus | null = null;
  if (allDone) parentStatus = "done";
  else if (anyError) parentStatus = "blocked";
  else if (anyActive || nextStatus === "in_progress") parentStatus = "in_progress";

  if (!parentStatus) return;
  const parent = db.getHomeTask(task.parentId);
  if (!parent || parent.status === parentStatus) return;
  db.updateHomeTask(parent.id, {
    status: parentStatus,
    error: parentStatus === "blocked" ? "one or more subtasks failed" : null,
  });
}

export function attachHomeTaskSessionSync(db: SupervisorDb): () => void {
  return db.onSessionStatusChange((sessionId, status) => {
    syncHomeTaskFromSessionStatus(db, sessionId, status);
  });
}
