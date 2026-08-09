import type { SupervisorDb } from "../db/db.js";
import { parseSessionMeta } from "./session-fields.js";
import {
  parseSessionServicesMeta,
  stopSessionProjectServices,
  stoppedSessionServicesMeta,
} from "./session-services.js";
import type { JobManager } from "./jobs.js";

/** Auto-stop project services after this much inactivity (ms). */
export const SESSION_SERVICE_SLEEP_MS = 24 * 60 * 60 * 1000;

/** Scheduler tick interval (ms). */
export const SESSION_SERVICE_SLEEP_TICK_MS = 5 * 60 * 1000;

export function computeServiceSleepAt(lastActiveAtMs: number): number {
  return lastActiveAtMs + SESSION_SERVICE_SLEEP_MS;
}

export async function runSessionServiceSleepTick(options: {
  db: SupervisorDb;
  jobs?: JobManager;
}): Promise<void> {
  const now = Date.now();
  for (const row of options.db.list()) {
    const services = parseSessionServicesMeta(parseSessionMeta(row.meta));
    if (!services || services.status !== "running") continue;
    const sleepAt = services.sleepAt;
    if (!sleepAt || sleepAt > now) continue;
    try {
      await stopSessionProjectServices({
        sessionId: row.id,
        cwd: row.cwd,
        services,
        jobs: options.jobs,
        mode: "stop",
      });
      options.db.updateMeta(row.id, {
        services: stoppedSessionServicesMeta(services),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`session service sleep failed [${row.id}]:`, message);
    }
  }
}

export function startSessionServiceSleepScheduler(db: SupervisorDb, jobs?: JobManager): () => void {
  void runSessionServiceSleepTick({ db, jobs });
  const timer = setInterval(() => {
    void runSessionServiceSleepTick({ db, jobs });
  }, SESSION_SERVICE_SLEEP_TICK_MS);
  return () => clearInterval(timer);
}
