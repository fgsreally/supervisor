import { randomUUID } from "node:crypto";
import type { SessionTreeEntry } from "@earendil-works/pi-agent-core";
import type { SupervisorDb } from "../db/db.js";
import { createGitSnapshot, restoreGitSnapshot } from "../utils/git.js";
import { SQLiteSessionStorage } from "./session-storage.js";
import type { SessionRow, SessionCheckpoint } from "../types.js";

const CHECKPOINTS_META_KEY = "checkpoints";

export type SessionBranchType = "subagent" | "fork" | "clone" | "btw";

export function normalizeSessionBranchType(value: string | null): SessionBranchType | null {
  if (value === "spawn") return "subagent";
  return value === "subagent" || value === "fork" || value === "clone" || value === "btw"
    ? value
    : null;
}
type InheritableEntry = SessionTreeEntry & { source?: string | null };

/** Copy a message branch with new ids while preserving its parent chain. */
export async function copyMessagesWithInheritance(
  storage: SQLiteSessionStorage,
  entries: InheritableEntry[],
): Promise<number> {
  const idMap = new Map<string, string>();
  for (const entry of entries) {
    const newId = randomUUID();
    idMap.set(entry.id, newId);
    const copied: SessionTreeEntry = {
      ...entry,
      id: newId,
      parentId: entry.parentId ? (idMap.get(entry.parentId) ?? null) : null,
    };
    await storage.appendEntry(copied, { isOld: true, source: entry.source ?? null });
  }
  return entries.length;
}

export function parseCheckpoints(meta: Record<string, unknown>): SessionCheckpoint[] {
  const raw = meta[CHECKPOINTS_META_KEY];
  if (!Array.isArray(raw)) return [];
  const checkpoints: SessionCheckpoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.entryId !== "string" ||
      typeof row.createdAt !== "number"
    ) {
      continue;
    }
    checkpoints.push({
      id: row.id,
      entryId: row.entryId,
      gitRef: typeof row.gitRef === "string" ? row.gitRef : null,
      ...(typeof row.label === "string" ? { label: row.label } : {}),
      createdAt: row.createdAt,
    });
  }
  return checkpoints.sort((a, b) => a.createdAt - b.createdAt);
}

function assertSessionIdle(session: SessionRow): void {
  if (session.status === "running" || session.status === "waiting_user") {
    throw new Error(
      `Session ${session.id} is busy (status: ${session.status}); wait until idle before checkpoint/rewind`,
    );
  }
}

export async function createSessionCheckpoint(
  db: Pick<SupervisorDb, "get" | "updateMeta">,
  sessionId: number,
  options?: { label?: string },
): Promise<SessionCheckpoint> {
  const session = db.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  assertSessionIdle(session);

  const leafId = session.leaf_id;
  if (!leafId) {
    throw new Error("Cannot create checkpoint: session has no conversation leaf yet");
  }

  const storage = new SQLiteSessionStorage(db as SupervisorDb, sessionId);
  const entry = await storage.getEntry(leafId);
  if (!entry) {
    throw new Error(`Cannot create checkpoint: entry ${leafId} not found`);
  }

  const gitRef = await createGitSnapshot(session.cwd);
  const checkpoint: SessionCheckpoint = {
    id: randomUUID(),
    entryId: leafId,
    gitRef,
    createdAt: Date.now(),
    ...(options?.label?.trim() ? { label: options.label.trim() } : {}),
  };

  const existing = parseCheckpoints(
    typeof session.meta === "string" ? JSON.parse(session.meta) : session.meta,
  );
  db.updateMeta(sessionId, {
    [CHECKPOINTS_META_KEY]: [...existing, checkpoint],
  });

  return checkpoint;
}

export function listSessionCheckpoints(
  db: Pick<SupervisorDb, "get">,
  sessionId: number,
): SessionCheckpoint[] {
  const session = db.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  return parseCheckpoints(
    typeof session.meta === "string" ? JSON.parse(session.meta) : session.meta,
  );
}

export interface RewindCheckpointOptions {
  reloadRuntime?: (sessionId: number, entryId: string) => Promise<void>;
}

export async function rewindSessionToCheckpoint(
  db: Pick<SupervisorDb, "get" | "updateMeta">,
  sessionId: number,
  checkpointId: string,
  options: RewindCheckpointOptions = {},
): Promise<SessionCheckpoint> {
  const session = db.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  assertSessionIdle(session);

  const checkpoints = parseCheckpoints(
    typeof session.meta === "string" ? JSON.parse(session.meta) : session.meta,
  );
  const checkpoint = checkpoints.find((item) => item.id === checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint ${checkpointId} not found`);
  }

  const storage = new SQLiteSessionStorage(db as SupervisorDb, sessionId);
  const entry = await storage.getEntry(checkpoint.entryId);
  if (!entry) {
    throw new Error(`Checkpoint entry ${checkpoint.entryId} no longer exists`);
  }

  if (checkpoint.gitRef) {
    await restoreGitSnapshot(session.cwd, checkpoint.gitRef);
  }

  const auditEntryId = await storage.createEntryId();
  await storage.appendEntry({
    id: auditEntryId,
    parentId: checkpoint.entryId,
    timestamp: new Date().toISOString(),
    type: "custom",
    customType: "checkpoint-rewind",
    data: {
      checkpointId: checkpoint.id,
      entryId: checkpoint.entryId,
      label: checkpoint.label,
      rewoundAt: Date.now(),
    },
  });

  await storage.setLeafId(checkpoint.entryId);

  if (options.reloadRuntime) {
    await options.reloadRuntime(sessionId, checkpoint.entryId);
  }

  return checkpoint;
}
