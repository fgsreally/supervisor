import { randomUUID } from "node:crypto";
import type { SupervisorDb } from "../db/db.js";
import { parseSessionMeta } from "./session-fields.js";

/** Timer definition stored in sessions.meta.timers (extension config, not a Job). */
export interface SessionTimer {
  id: string;
  prompt: string;
  nextFireAt: number;
  intervalMs?: number;
  label?: string;
  createdAt: number;
}

export function newSessionTimerId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

function asTimer(value: unknown): SessionTimer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
  const nextFireAt =
    typeof record.nextFireAt === "number"
      ? record.nextFireAt
      : typeof record.nextRunAt === "number"
        ? record.nextRunAt
        : NaN;
  if (!prompt || !Number.isFinite(nextFireAt)) return null;
  const id =
    typeof record.id === "string" && record.id.trim() ? record.id.trim() : newSessionTimerId();
  const createdAt =
    typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
      ? record.createdAt
      : nextFireAt;
  const intervalMs =
    typeof record.intervalMs === "number" && record.intervalMs > 0 ? record.intervalMs : undefined;
  const label =
    typeof record.label === "string" && record.label.trim()
      ? record.label.trim()
      : typeof record.intent === "string" && record.intent.trim()
        ? record.intent.trim()
        : undefined;
  return {
    id,
    prompt,
    nextFireAt,
    createdAt,
    ...(intervalMs ? { intervalMs } : {}),
    ...(label ? { label } : {}),
  };
}

export function parseSessionTimers(
  meta: Record<string, unknown> | null | undefined,
): SessionTimer[] {
  if (!Array.isArray(meta?.timers)) return [];
  const timers: SessionTimer[] = [];
  const seen = new Set<string>();
  for (const item of meta.timers) {
    const timer = asTimer(item);
    if (!timer || seen.has(timer.id)) continue;
    seen.add(timer.id);
    timers.push(timer);
  }
  return timers.sort((a, b) => a.nextFireAt - b.nextFireAt);
}

export function listSessionTimers(db: SupervisorDb, sessionId: number): SessionTimer[] {
  const row = db.get(sessionId);
  if (!row) return [];
  return parseSessionTimers(parseSessionMeta(row.meta as string | Record<string, unknown>));
}

export function getSessionTimer(
  db: SupervisorDb,
  sessionId: number,
  timerId: string,
): SessionTimer | undefined {
  return listSessionTimers(db, sessionId).find((timer) => timer.id === timerId);
}

export function writeSessionTimers(
  db: SupervisorDb,
  sessionId: number,
  timers: SessionTimer[],
): SessionTimer[] {
  const normalized = [...timers]
    .map((timer) => asTimer(timer))
    .filter((timer): timer is SessionTimer => timer != null)
    .sort((a, b) => a.nextFireAt - b.nextFireAt);
  db.updateMeta(sessionId, { timers: normalized });
  return normalized;
}

export function upsertSessionTimer(
  db: SupervisorDb,
  sessionId: number,
  timer: SessionTimer,
): SessionTimer {
  const current = listSessionTimers(db, sessionId);
  const next = asTimer(timer);
  if (!next) throw new Error("invalid timer");
  const others = current.filter((item) => item.id !== next.id);
  writeSessionTimers(db, sessionId, [...others, next]);
  return next;
}

export function updateSessionTimerNextFire(
  db: SupervisorDb,
  sessionId: number,
  timerId: string,
  nextFireAt: number,
): SessionTimer {
  const current = getSessionTimer(db, sessionId, timerId);
  if (!current) throw new Error(`Timer ${timerId} not found`);
  return upsertSessionTimer(db, sessionId, { ...current, nextFireAt });
}

export function deleteSessionTimer(db: SupervisorDb, sessionId: number, timerId: string): boolean {
  const current = listSessionTimers(db, sessionId);
  if (!current.some((timer) => timer.id === timerId)) return false;
  writeSessionTimers(
    db,
    sessionId,
    current.filter((timer) => timer.id !== timerId),
  );
  return true;
}

/** Map timers to the HTTP/UI schedule DTO (jobs popover still lists "schedules"). */
export function sessionTimersToScheduleDto(sessionId: number, timers: SessionTimer[]) {
  return timers.map((timer) => ({
    id: timer.id,
    sessionId,
    kind: "timer",
    name: "timer.fire",
    label: timer.label ?? timer.prompt.split("\n")[0]!.slice(0, 120),
    prompt: timer.prompt,
    nextRunAt: timer.nextFireAt,
    ...(timer.intervalMs ? { intervalMs: timer.intervalMs } : {}),
    metadata: {},
    createdAt: timer.createdAt,
    updatedAt: timer.createdAt,
  }));
}
