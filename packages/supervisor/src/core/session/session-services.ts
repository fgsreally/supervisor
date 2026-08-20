import type { JobManager } from "../jobs/jobs.js";
import type {
  SessionService,
  SessionServiceView,
  SessionServicesMeta,
} from "../project/project-runtime.js";
import {
  servicesToPortEnv,
  hasRegisteredServices,
  jobManagerAsHost,
  startRegisteredSessionServices,
  stopRegisteredSessionServices,
} from "./session-registered-services.js";

type SessionMetaStore = {
  list: () => Array<{ id: number; meta: string }>;
  updateMeta: (id: number, patch: Record<string, unknown>) => Record<string, unknown>;
};

/** Build the injected session tip about started services. */
export function buildSessionServicesPrompt(services: SessionServicesMeta): string {
  const registered = services.services ?? [];
  if (!registered.length && !services.startCommand?.trim()) return "";
  const lines = ["Local services registered for this Session:"];
  if (registered.length) {
    for (const app of registered) {
      const start = app.startCommand ?? services.resolvedStartCommand ?? services.startCommand;
      lines.push(
        `- ${app.name}: port ${app.port} path ${app.path ?? "/"}${start ? ` start \`${start}\`` : ""}`,
      );
    }
  } else {
    lines.push(`- start: \`${services.resolvedStartCommand ?? services.startCommand}\``);
  }
  for (const view of services.views ?? []) {
    lines.push(
      `- view ${view.name}: service ${view.service} port ${view.port} path ${view.path ?? "/"}`,
    );
  }
  lines.push(
    "To add, delete, or update these services, always call UpdateService with action add, delete, or update. Do not start or stop them directly with bash.",
  );
  return lines.join("\n");
}

/** Start agent-registered session services. */
export async function startSessionProjectServices(options: {
  sessionId: number;
  cwd: string;
  jobs: JobManager;
  skipInstall?: boolean;
  lastActiveAtMs?: number;
  services: SessionServicesMeta;
}): Promise<SessionServicesMeta | null> {
  if (!hasRegisteredServices(options.services)) return null;
  return startRegisteredSessionServices({
    sessionId: options.sessionId,
    cwd: options.cwd,
    services: options.services,
    jobs: jobManagerAsHost(options.jobs),
    skipInstall: options.skipInstall,
    lastActiveAtMs: options.lastActiveAtMs,
  });
}

/** Stop or destroy agent-registered session services. */
export async function stopSessionProjectServices(options: {
  sessionId: number;
  cwd: string;
  services: SessionServicesMeta | null | undefined;
  jobs?: JobManager;
  mode?: "stop" | "destroy";
}): Promise<void> {
  if (!hasRegisteredServices(options.services)) return;
  await stopRegisteredSessionServices({
    sessionId: options.sessionId,
    cwd: options.cwd,
    services: options.services,
    jobs: options.jobs ? jobManagerAsHost(options.jobs) : undefined,
    mode: options.mode ?? "stop",
  });
}

export function stoppedSessionServicesMeta(
  previous: SessionServicesMeta | null | undefined,
): SessionServicesMeta {
  return {
    installCommand: previous?.installCommand,
    startCommand: previous?.startCommand ?? "",
    stopCommand: previous?.stopCommand,
    destroyCommand: previous?.destroyCommand ?? previous?.uninstallCommand,
    services: previous?.services?.map((app) => ({ ...app, jobId: undefined, pid: null })),
    views: previous?.views,
    installedAt: previous?.installedAt,
    lastActiveAt: previous?.lastActiveAt,
    pid: null,
    jobId: undefined,
    resolvedStartCommand: undefined,
  };
}

export type SessionServicesStatus = "active" | "idle" | "error" | "unregistered";

/** Derive runtime state from process/job references; never persist a status in meta.services. */
export function getSessionServicesStatus(
  services: SessionServicesMeta | null | undefined,
): SessionServicesStatus {
  if (!services?.services?.length) return "unregistered";
  if (services.error) return "error";
  const active =
    Boolean(services.jobId) ||
    services.pid != null ||
    services.services.some((app) => Boolean(app.jobId) || app.pid != null);
  return active ? "active" : "idle";
}

/**
 * After Supervisor restart, child processes / Jobs are gone.
 * Drop process-bound fields from meta.services; keep Service registration.
 * Eval / background bash are not stored in meta (jobs table + session eval dir).
 */
export function scrubStaleSessionRuntimeMeta(db: SessionMetaStore): number {
  let changed = 0;
  for (const row of db.list()) {
    let meta: Record<string, unknown>;
    try {
      meta = row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : {};
    } catch {
      continue;
    }
    const services = parseSessionServicesMeta(meta);
    if (!services) continue;
    const liveStatus = getSessionServicesStatus(services) === "active";
    const hasRuntimeRef = Boolean(services.jobId) || services.pid != null;
    if (!liveStatus && !hasRuntimeRef) continue;
    db.updateMeta(row.id, { services: stoppedSessionServicesMeta(services) });
    changed += 1;
  }
  return changed;
}

function parseViews(raw: unknown): SessionServiceView[] {
  if (!Array.isArray(raw)) return [];
  const views: SessionServiceView[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const service = typeof row.service === "string" ? row.service.trim() : "";
    const port =
      typeof row.port === "number"
        ? row.port
        : typeof row.port === "string"
          ? Number.parseInt(row.port, 10)
          : NaN;
    if (!name || !service || !Number.isFinite(port) || port <= 0) continue;
    views.push({
      name,
      service,
      port,
      path: typeof row.path === "string" && row.path.trim() ? row.path : "/",
    });
  }
  return views;
}

function parseServices(raw: unknown): SessionService[] {
  if (!Array.isArray(raw)) return [];
  const services: SessionService[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const port =
      typeof row.port === "number"
        ? row.port
        : typeof row.port === "string"
          ? Number.parseInt(row.port, 10)
          : NaN;
    if (!name || !Number.isFinite(port) || port <= 0) continue;
    services.push({
      name,
      port,
      portEnv:
        row.portEnv && typeof row.portEnv === "object" && !Array.isArray(row.portEnv)
          ? Object.fromEntries(
              Object.entries(row.portEnv as Record<string, unknown>).flatMap(([key, value]) => {
                const parsed =
                  typeof value === "number"
                    ? value
                    : typeof value === "string"
                      ? Number.parseInt(value, 10)
                      : NaN;
                return /^PORT[1-9]\d*$/.test(key) && Number.isInteger(parsed) && parsed > 0
                  ? [[key, parsed]]
                  : [];
              }),
            )
          : undefined,
      path: typeof row.path === "string" ? row.path : undefined,
      startCommand: typeof row.startCommand === "string" ? row.startCommand.trim() : undefined,
      jobId: typeof row.jobId === "string" ? row.jobId : undefined,
      pid: typeof row.pid === "number" ? row.pid : null,
    });
  }
  return services;
}

export function parseSessionServicesMeta(
  meta: Record<string, unknown> | undefined | null,
): SessionServicesMeta | null {
  const raw = meta?.services;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const startCommand = typeof row.startCommand === "string" ? row.startCommand.trim() : "";
  if (startCommand) {
    return {
      installCommand:
        typeof row.installCommand === "string" ? row.installCommand.trim() || undefined : undefined,
      startCommand,
      stopCommand:
        typeof row.stopCommand === "string" ? row.stopCommand.trim() || undefined : undefined,
      destroyCommand:
        typeof row.destroyCommand === "string"
          ? row.destroyCommand.trim() || undefined
          : typeof row.uninstallCommand === "string"
            ? row.uninstallCommand.trim() || undefined
            : undefined,
      services: parseServices(row.services),
      views: parseViews(row.views),
      startedAt: typeof row.startedAt === "string" ? row.startedAt : undefined,
      installedAt: typeof row.installedAt === "string" ? row.installedAt : undefined,
      lastActiveAt:
        typeof row.lastActiveAt === "number" && Number.isFinite(row.lastActiveAt)
          ? row.lastActiveAt
          : undefined,
      sleepAt:
        typeof row.sleepAt === "number" && Number.isFinite(row.sleepAt) ? row.sleepAt : undefined,
      error: typeof row.error === "string" ? row.error : undefined,
      resolvedStartCommand:
        typeof row.resolvedStartCommand === "string" ? row.resolvedStartCommand : undefined,
      jobId: typeof row.jobId === "string" ? row.jobId : undefined,
      pid: typeof row.pid === "number" ? row.pid : null,
    };
  }

  return null;
}

/** Ports already claimed in other Sessions' meta.services. */
export function collectReservedServicePorts(
  rows: Array<{ id: number; meta: string }>,
  exceptSessionId?: number,
): number[] {
  const ports: number[] = [];
  for (const row of rows) {
    if (row.id === exceptSessionId) continue;
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(row.meta || "{}") as Record<string, unknown>;
    } catch {
      continue;
    }
    const services = parseSessionServicesMeta(meta);
    for (const app of services?.services ?? []) {
      if (Number.isInteger(app.port) && app.port > 0) ports.push(app.port);
      for (const port of Object.values(app.portEnv ?? {})) {
        if (Number.isInteger(port) && port > 0) ports.push(port);
      }
    }
  }
  return [...new Set(ports)];
}

/** Port env derived from registered Services for agent shells / external runtimes. */
export function sessionServicePortEnv(
  meta: Record<string, unknown> | undefined | null,
): Record<string, string> {
  return servicesToPortEnv(parseSessionServicesMeta(meta)?.services);
}

export {
  areRegisteredServicesAlive,
  hasRegisteredServices,
  startRegisteredSessionServices,
  stopRegisteredSessionServices,
} from "./session-registered-services.js";
