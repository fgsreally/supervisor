import type { HomeTaskStatus, SessionStatus } from "../types.js";
import type { SupervisorDb } from "../db/db.js";

function mapSessionStatusToHomeTask(status: SessionStatus): HomeTaskStatus | null {
  if (
    status === "running" ||
    status === "blocked" ||
    status === "idle" ||
    status === "initializing"
  ) {
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
): { parentId: number | null; childTerminal: boolean } {
  const task = db.getHomeTaskBySessionId(sessionId);
  if (!task) return { parentId: null, childTerminal: false };

  const nextStatus = mapSessionStatusToHomeTask(status);
  if (!nextStatus) return { parentId: task.parentId, childTerminal: false };

  const error =
    nextStatus === "error" ? (status === "stopped" ? "session stopped" : "session error") : null;

  if (task.status !== nextStatus || task.error !== error) {
    db.updateHomeTask(task.id, { status: nextStatus, error });
  }

  const childTerminal = nextStatus === "done" || nextStatus === "error";
  if (!task.parentId) {
    if (nextStatus === "done") {
      db.updateHomeTask(task.id, { phase: "done" });
    } else if (nextStatus === "error") {
      db.updateHomeTask(task.id, { phase: "error" });
    }
    return { parentId: null, childTerminal };
  }

  const siblings = db.listHomeTaskChildren(task.parentId);
  if (siblings.length === 0) return { parentId: task.parentId, childTerminal };

  const allDone = siblings.every((item) => item.status === "done");
  const anyError = siblings.some((item) => item.status === "error");
  const anyActive = siblings.some(
    (item) => item.status === "in_progress" || item.status === "todo" || item.status === "backlog",
  );

  let parentStatus: HomeTaskStatus | null = null;
  if (allDone) parentStatus = "done";
  else if (anyError) parentStatus = "blocked";
  else if (anyActive || nextStatus === "in_progress") parentStatus = "in_progress";

  if (!parentStatus) return { parentId: task.parentId, childTerminal };
  const parent = db.getHomeTask(task.parentId);
  if (!parent) return { parentId: task.parentId, childTerminal };

  const parentPatch: {
    status?: HomeTaskStatus;
    phase?: "done" | "error" | "executing";
    error?: string | null;
  } = {};
  if (parent.status !== parentStatus) parentPatch.status = parentStatus;
  if (parentStatus === "done") {
    parentPatch.phase = "done";
    parentPatch.error = null;
  } else if (parentStatus === "blocked") {
    parentPatch.error = "one or more subtasks failed";
  } else if (parentStatus === "in_progress" && parent.phase !== "executing") {
    parentPatch.phase = "executing";
  }

  if (Object.keys(parentPatch).length > 0) {
    db.updateHomeTask(parent.id, parentPatch);
  }

  return { parentId: task.parentId, childTerminal };
}

export function attachHomeTaskSessionSync(
  db: SupervisorDb,
  options?: { onChildTerminal?: (parentId: number) => void },
): () => void {
  return db.onSessionStatusChange((sessionId, status) => {
    const result = syncHomeTaskFromSessionStatus(db, sessionId, status);
    if (result.childTerminal && result.parentId != null) {
      options?.onChildTerminal?.(result.parentId);
    }
  });
}
