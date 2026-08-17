import type { SupervisorDb } from "../db/db.js";
import { parseSessionMeta } from "./session-fields.js";
import {
  buildSessionServicesPrompt,
  parseSessionServicesMeta,
  stopSessionProjectServices,
  stoppedSessionServicesMeta,
} from "./session-services.js";
import type { JobManager } from "./jobs.js";
import { writeLog } from "../i18n/logs.js";

/** Auto-stop project services after this much inactivity (ms). */
export const SESSION_SERVICE_SLEEP_MS = 24 * 60 * 60 * 1000;

/** Scheduler tick interval (ms). */
export const SESSION_SERVICE_SLEEP_TICK_MS = 5 * 60 * 1000;

export function computeServiceSleepAt(lastActiveAtMs: number): number {
  return lastActiveAtMs + SESSION_SERVICE_SLEEP_MS;
}

function updateServicesPromptBlock(current: string, content: string): string {
  const start = "<!-- ext-sys:service -->";
  const end = "<!-- /ext-sys:service -->";
  const base = current
    .replace(/<!-- ext-sys:(?:service|project-services) -->[\s\S]*?<!-- \/ext-sys:(?:service|project-services) -->\n?/g, "")
    .trim();
  const fragment = content.trim();
  if (!fragment) return base;
  const block = `${start}\n${fragment}\n${end}`;
  return base ? `${base}\n\n${block}` : block;
}

export async function runSessionServiceSleepTick(options: {
  db: SupervisorDb;
  jobs?: JobManager;
  onUpdated?: (sessionId: number) => void;
}): Promise<void> {
  const now = Date.now();
  for (const row of options.db.list()) {
    const services = parseSessionServicesMeta(parseSessionMeta(row.meta));
    if (
      !services ||
      (services.status !== "active" &&
        services.status !== "running" &&
        services.status !== "starting")
    ) {
      continue;
    }
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
      const refreshed = options.db.get(row.id);
      if (refreshed) {
        options.db.updateSessionFields(row.id, {
          systemPrompt: updateServicesPromptBlock(
            refreshed.system_prompt ?? "",
            buildSessionServicesPrompt(stoppedSessionServicesMeta(services)),
          ),
        });
      }
      options.onUpdated?.(row.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      writeLog("error", "runtime.sessionServiceSleepFailed", { id: row.id, error: message });
    }
  }
}

export function startSessionServiceSleepScheduler(
  db: SupervisorDb,
  jobs?: JobManager,
  onUpdated?: (sessionId: number) => void,
): () => void {
  void runSessionServiceSleepTick({ db, jobs, onUpdated });
  const timer = setInterval(() => {
    void runSessionServiceSleepTick({ db, jobs, onUpdated });
  }, SESSION_SERVICE_SLEEP_TICK_MS);
  return () => clearInterval(timer);
}
