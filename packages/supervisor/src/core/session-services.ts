import type { JobManager } from "./jobs.js";
import type { SessionServiceApp, SessionServicesMeta } from "./project-runtime.js";
import {
  appsToPortEnv,
  hasRegisteredServices,
  jobManagerAsHost,
  startRegisteredSessionServices,
  stopRegisteredSessionServices,
  type RegisteredServiceEntry,
} from "./session-registered-services.js";

export type { RegisteredServiceEntry };

type SessionMetaStore = {
  list: () => Array<{ id: number; meta: string }>;
  updateMeta: (id: number, patch: Record<string, unknown>) => Record<string, unknown>;
};

/** Build the injected session tip about started services. */
export function buildSessionServicesPrompt(services: SessionServicesMeta): string {
  if (!services.startCommand?.trim()) return "";
  const running =
    services.status === "active" || services.status === "running" || services.status === "starting";
  const status = running ? "active" : services.status === "error" ? "error" : "idle";
  const lines = [
    "## 项目服务",
    running
      ? "本 Session 的项目服务已由 Supervisor 启动并托管，不要重复启动。"
      : services.status === "error"
        ? "本 Session 的项目服务自动启动失败；下一次对话前会重试，也可使用服务工具检查或调整。"
        : "本 Session 已登记项目服务；Supervisor 会在下一次对话前启动它。",
    `- 状态：${status}`,
    `- 启动命令：\`${services.resolvedStartCommand ?? services.startCommand}\``,
  ];
  if (services.error) lines.push(`- 最近错误：${services.error}`);
  if (services.apps?.length) {
    lines.push(
      `- 入口：${services.apps.map((app) => `${app.name}@127.0.0.1:${app.port}${app.path ?? "/"}`).join(", ")}`,
    );
  }
  lines.push(
    "端口已为本 Session 保留，并会注入 bash 环境变量（主入口为 PORT）。",
    "ProjectServiceSetup / Start / Stop 等工具仍可用于对话过程中新增、调整或重启服务。",
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
    apps: previous?.apps,
    status: "idle",
    installedAt: previous?.installedAt,
    lastActiveAt: previous?.lastActiveAt,
    sleepAt: undefined,
    error: undefined,
    pid: null,
    jobId: undefined,
    resolvedStartCommand: undefined,
  };
}

/**
 * After Supervisor restart, child processes / Jobs are gone.
 * Drop process-bound fields from meta.services; keep registration (commands/apps).
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
    const liveStatus =
      services.status === "starting" ||
      services.status === "running" ||
      services.status === "active";
    const hasRuntimeRef = Boolean(services.jobId) || services.pid != null;
    if (!liveStatus && !hasRuntimeRef) continue;
    db.updateMeta(row.id, { services: stoppedSessionServicesMeta(services) });
    changed += 1;
  }
  return changed;
}

function parseApps(raw: unknown): SessionServiceApp[] {
  if (!Array.isArray(raw)) return [];
  const apps: SessionServiceApp[] = [];
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
    apps.push({
      name,
      port,
      path: typeof row.path === "string" ? row.path : undefined,
    });
  }
  return apps;
}

function migrateLegacyEntries(row: Record<string, unknown>): SessionServicesMeta | null {
  if (!Array.isArray(row.entries) || row.entries.length === 0) return null;
  const portEnv =
    row.portEnv && typeof row.portEnv === "object" && !Array.isArray(row.portEnv)
      ? Object.fromEntries(
          Object.entries(row.portEnv as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string" || typeof value === "number")
            .map(([key, value]) => [key, String(value)]),
        )
      : {};

  const entries: RegisteredServiceEntry[] = [];
  for (const item of row.entries) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const startCommand = typeof entry.startCommand === "string" ? entry.startCommand.trim() : "";
    if (!name || !startCommand) continue;
    entries.push({
      name,
      startCommand,
      installCommand: typeof entry.installCommand === "string" ? entry.installCommand : undefined,
      stopCommand: typeof entry.stopCommand === "string" ? entry.stopCommand : undefined,
      destroyCommand: typeof entry.destroyCommand === "string" ? entry.destroyCommand : undefined,
      uninstallCommand:
        typeof entry.uninstallCommand === "string" ? entry.uninstallCommand : undefined,
      uiPorts: Array.isArray(entry.uiPorts)
        ? entry.uiPorts
            .filter((port): port is Record<string, unknown> => !!port && typeof port === "object")
            .map((port) => ({
              envVar: typeof port.envVar === "string" ? port.envVar.trim() : "",
              label: typeof port.label === "string" ? port.label : undefined,
              path: typeof port.path === "string" ? port.path : undefined,
            }))
            .filter((port) => port.envVar)
        : undefined,
      pid: typeof entry.pid === "number" ? entry.pid : null,
      jobId: typeof entry.jobId === "string" ? entry.jobId : undefined,
      resolvedStartCommand:
        typeof entry.resolvedStartCommand === "string" ? entry.resolvedStartCommand : undefined,
    });
  }
  if (entries.length === 0) return null;

  const primary = entries[0]!;
  const apps: SessionServiceApp[] = [];
  for (const entry of entries) {
    for (const port of entry.uiPorts ?? []) {
      const raw = portEnv[port.envVar];
      const num = raw ? Number.parseInt(raw, 10) : NaN;
      if (!Number.isFinite(num) || num <= 0) continue;
      apps.push({
        name: port.label ?? entry.name,
        port: num,
        path: port.path ?? "/",
      });
    }
  }

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

  return {
    status,
    installCommand: primary.installCommand,
    startCommand:
      entries.length === 1
        ? primary.startCommand
        : entries
            .map((entry) => entry.startCommand)
            .join(process.platform === "win32" ? " & " : " & "),
    stopCommand: primary.stopCommand,
    destroyCommand: primary.destroyCommand ?? primary.uninstallCommand,
    apps: apps.length > 0 ? apps : undefined,
    startedAt: typeof row.startedAt === "string" ? row.startedAt : undefined,
    installedAt: typeof row.installedAt === "string" ? row.installedAt : undefined,
    lastActiveAt:
      typeof row.lastActiveAt === "number" && Number.isFinite(row.lastActiveAt)
        ? row.lastActiveAt
        : undefined,
    sleepAt:
      typeof row.sleepAt === "number" && Number.isFinite(row.sleepAt) ? row.sleepAt : undefined,
    error: typeof row.error === "string" ? row.error : undefined,
    pid: primary.pid ?? null,
    jobId: primary.jobId,
    resolvedStartCommand: primary.resolvedStartCommand,
  };
}

export function parseSessionServicesMeta(
  meta: Record<string, unknown> | undefined | null,
): SessionServicesMeta | null {
  const raw = meta?.services;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
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

  const startCommand = typeof row.startCommand === "string" ? row.startCommand.trim() : "";
  if (startCommand) {
    return {
      status,
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
      apps: parseApps(row.apps),
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

  return migrateLegacyEntries(row);
}

/** Port env derived from apps for agent shells / external runtimes. */
export function sessionServicePortEnv(
  meta: Record<string, unknown> | undefined | null,
): Record<string, string> {
  return appsToPortEnv(parseSessionServicesMeta(meta)?.apps);
}

export {
  areRegisteredServicesAlive,
  hasRegisteredServices,
  startRegisteredSessionServices,
  stopRegisteredSessionServices,
} from "./session-registered-services.js";
