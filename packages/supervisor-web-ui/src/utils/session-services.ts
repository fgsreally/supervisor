export interface SessionServiceApp {
  name: string;
  port: number;
  path?: string;
}

export interface SessionServicesMeta {
  status: "starting" | "running" | "active" | "idle" | "stopped" | "error" | "unregistered";
  installCommand?: string;
  startCommand?: string;
  stopCommand?: string;
  destroyCommand?: string;
  apps?: SessionServiceApp[];
  sleepAt?: number;
  installedAt?: string;
  error?: string;
  /** Process-bound; cleared on Supervisor restart / job cancel. */
  jobId?: string;
  pid?: number | null;
}

export interface SessionServicesPreview {
  name: string;
  port: number;
  path?: string;
  label?: string;
  previewUrl: string;
  /** @deprecated alias of name */
  scriptName: string;
  /** @deprecated unused */
  envVar?: string;
}

export interface SessionServicesSnapshot {
  status: SessionServicesMeta["status"] | "none";
  sleepAt?: number;
  installedAt?: string;
  apps: SessionServiceApp[];
  previews: SessionServicesPreview[];
  error?: string;
}

function parseApps(raw: unknown): SessionServiceApp[] {
  if (!Array.isArray(raw)) return [];
  const apps: SessionServiceApp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name =
      typeof row.name === "string"
        ? row.name.trim()
        : typeof row.scriptName === "string"
          ? row.scriptName.trim()
          : "";
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

/** Legacy uiPorts + portEnv → apps */
function legacyAppsFromUiPorts(row: Record<string, unknown>): SessionServiceApp[] {
  if (!Array.isArray(row.uiPorts)) return [];
  const portEnv =
    row.portEnv && typeof row.portEnv === "object" && !Array.isArray(row.portEnv)
      ? (row.portEnv as Record<string, unknown>)
      : {};
  const apps: SessionServiceApp[] = [];
  for (const item of row.uiPorts) {
    if (!item || typeof item !== "object") continue;
    const port = item as Record<string, unknown>;
    const name =
      typeof port.scriptName === "string"
        ? port.scriptName.trim()
        : typeof port.label === "string"
          ? port.label.trim()
          : "";
    const envVar = typeof port.envVar === "string" ? port.envVar.trim() : "";
    const raw = envVar ? portEnv[envVar] : undefined;
    const num =
      typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
    if (!name || !Number.isFinite(num) || num <= 0) continue;
    apps.push({
      name,
      port: num,
      path: typeof port.path === "string" ? port.path : undefined,
    });
  }
  return apps;
}

export function parseSessionServicesFromMeta(
  meta: Record<string, unknown> | null | undefined,
): SessionServicesMeta | null {
  const raw = meta?.services;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const status = row.status;
  if (
    status !== "starting" &&
    status !== "running" &&
    status !== "active" &&
    status !== "idle" &&
    status !== "stopped" &&
    status !== "error" &&
    status !== "unregistered"
  ) {
    return null;
  }
  let apps = parseApps(row.apps);
  if (apps.length === 0) apps = legacyAppsFromUiPorts(row);
  return {
    status,
    installCommand: typeof row.installCommand === "string" ? row.installCommand : undefined,
    startCommand: typeof row.startCommand === "string" ? row.startCommand : undefined,
    stopCommand: typeof row.stopCommand === "string" ? row.stopCommand : undefined,
    destroyCommand: typeof row.destroyCommand === "string" ? row.destroyCommand : undefined,
    apps: apps.length > 0 ? apps : undefined,
    sleepAt: typeof row.sleepAt === "number" ? row.sleepAt : undefined,
    installedAt: typeof row.installedAt === "string" ? row.installedAt : undefined,
    error: typeof row.error === "string" ? row.error : undefined,
    jobId: typeof row.jobId === "string" ? row.jobId : undefined,
    pid: typeof row.pid === "number" ? row.pid : null,
  };
}

export function sessionHasProjectServices(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  const services = parseSessionServicesFromMeta(meta);
  return Boolean(services?.startCommand || services?.apps?.length);
}
