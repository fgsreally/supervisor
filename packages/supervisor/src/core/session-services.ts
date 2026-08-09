import type { JobManager } from "./jobs.js";
import type { SessionServicesMeta } from "./project-runtime.js";
import {
  flattenUiPorts,
  jobManagerAsHost,
  startRegisteredSessionServices,
  stopRegisteredSessionServices,
  type RegisteredServiceEntry,
} from "./session-registered-services.js";

export type { RegisteredServiceEntry };

/** Build the injected session tip about started services. */
export function buildSessionServicesPrompt(services: SessionServicesMeta): string {
  const lines: string[] = [];
  for (const entry of services.entries ?? []) {
    if (entry.resolvedStartCommand) {
      lines.push(`- ${entry.name}: \`${entry.resolvedStartCommand}\``);
    }
  }
  if (lines.length === 0) return "";
  return [
    "本 session 的项目服务已启动：",
    ...lines,
    services.portEnv && Object.keys(services.portEnv).length > 0
      ? `已分配端口环境变量：${JSON.stringify(services.portEnv)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Start agent-registered session services from meta.services.entries. */
export async function startSessionProjectServices(options: {
  sessionId: number;
  cwd: string;
  jobs: JobManager;
  skipInstall?: boolean;
  lastActiveAtMs?: number;
  services: SessionServicesMeta;
}): Promise<SessionServicesMeta | null> {
  if (!options.services.entries?.length) return null;
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
  if (!options.services?.entries?.length) return;
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
    entries: previous?.entries,
    portEnv: {},
    status: "idle",
    installedAt: previous?.installedAt,
    lastActiveAt: previous?.lastActiveAt,
    uiPorts:
      previous?.uiPorts ?? (previous?.entries ? flattenUiPorts(previous.entries) : undefined),
  };
}

export function parseSessionServicesMeta(
  meta: Record<string, unknown> | undefined | null,
): SessionServicesMeta | null {
  const raw = meta?.services;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const portEnv =
    row.portEnv && typeof row.portEnv === "object" && !Array.isArray(row.portEnv)
      ? Object.fromEntries(
          Object.entries(row.portEnv as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string" || typeof value === "number")
            .map(([key, value]) => [key, String(value)]),
        )
      : {};
  const status = row.status;
  if (
    status !== "starting" &&
    status !== "running" &&
    status !== "active" &&
    status !== "stopped" &&
    status !== "idle" &&
    status !== "error" &&
    status !== "unregistered"
  ) {
    return null;
  }

  const entries: RegisteredServiceEntry[] = [];
  if (Array.isArray(row.entries)) {
    for (const item of row.entries) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      const startCommand = typeof entry.startCommand === "string" ? entry.startCommand.trim() : "";
      if (!name || !startCommand) continue;
      const uiPorts: RegisteredServiceEntry["uiPorts"] = [];
      if (Array.isArray(entry.uiPorts)) {
        for (const portItem of entry.uiPorts) {
          if (!portItem || typeof portItem !== "object") continue;
          const port = portItem as Record<string, unknown>;
          const envVar = typeof port.envVar === "string" ? port.envVar.trim() : "";
          if (!envVar) continue;
          uiPorts.push({
            envVar,
            label: typeof port.label === "string" ? port.label : undefined,
            path: typeof port.path === "string" ? port.path : undefined,
          });
        }
      }
      entries.push({
        name,
        startCommand,
        installCommand: typeof entry.installCommand === "string" ? entry.installCommand : undefined,
        stopCommand: typeof entry.stopCommand === "string" ? entry.stopCommand : undefined,
        destroyCommand: typeof entry.destroyCommand === "string" ? entry.destroyCommand : undefined,
        uninstallCommand:
          typeof entry.uninstallCommand === "string" ? entry.uninstallCommand : undefined,
        uiPorts: uiPorts.length > 0 ? uiPorts : undefined,
        resolvedStartCommand:
          typeof entry.resolvedStartCommand === "string" ? entry.resolvedStartCommand : undefined,
        jobId: typeof entry.jobId === "string" ? entry.jobId : undefined,
        pid: typeof entry.pid === "number" ? entry.pid : null,
      });
    }
  }

  const uiPorts: SessionServicesMeta["uiPorts"] = [];
  if (Array.isArray(row.uiPorts)) {
    for (const item of row.uiPorts) {
      if (!item || typeof item !== "object") continue;
      const port = item as Record<string, unknown>;
      const envVar = typeof port.envVar === "string" ? port.envVar.trim() : "";
      const scriptName = typeof port.scriptName === "string" ? port.scriptName.trim() : "";
      if (!envVar || !scriptName) continue;
      uiPorts.push({
        scriptName,
        envVar,
        label: typeof port.label === "string" ? port.label : undefined,
        path: typeof port.path === "string" ? port.path : undefined,
      });
    }
  }

  return {
    entries: entries.length > 0 ? entries : undefined,
    portEnv,
    startedAt: typeof row.startedAt === "string" ? row.startedAt : undefined,
    status,
    error: typeof row.error === "string" ? row.error : undefined,
    sleepAt:
      typeof row.sleepAt === "number" && Number.isFinite(row.sleepAt) ? row.sleepAt : undefined,
    installedAt: typeof row.installedAt === "string" ? row.installedAt : undefined,
    lastActiveAt:
      typeof row.lastActiveAt === "number" && Number.isFinite(row.lastActiveAt)
        ? row.lastActiveAt
        : undefined,
    uiPorts:
      uiPorts.length > 0 ? uiPorts : entries.length > 0 ? flattenUiPorts(entries) : undefined,
  };
}

export function sessionServicePortEnv(
  meta: Record<string, unknown> | undefined | null,
): Record<string, string> {
  return parseSessionServicesMeta(meta)?.portEnv ?? {};
}

export {
  areRegisteredServicesAlive,
  startRegisteredSessionServices,
  stopRegisteredSessionServices,
} from "./session-registered-services.js";
