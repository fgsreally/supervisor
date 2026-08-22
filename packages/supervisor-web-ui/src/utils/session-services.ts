export interface SessionService {
  name: string;
  port: number;
  path?: string;
}

export interface SessionServiceView {
  name: string;
  service: string;
  port: number;
  path?: string;
}

export interface SessionServicesMeta {
  status:
    | "registered"
    | "starting"
    | "running"
    | "active"
    | "idle"
    | "stopped"
    | "error"
    | "unregistered";
  installCommand?: string;
  startCommand?: string;
  stopCommand?: string;
  destroyCommand?: string;
  services?: SessionService[];
  views?: SessionServiceView[];
  sleepAt?: number;
  installedAt?: string;
  error?: string;
  /** Process-bound; cleared on Supervisor restart / Shell cancel. */
  jobId?: string;
  pid?: number | null;
}

export interface SessionServicesPreview {
  name: string;
  service: string;
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
  services: SessionService[];
  views: SessionServiceView[];
  previews: SessionServicesPreview[];
  error?: string;
}

function parseServices(raw: unknown): SessionService[] {
  if (!Array.isArray(raw)) return [];
  const services: SessionService[] = [];
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
    services.push({
      name,
      port,
      path: typeof row.path === "string" ? row.path : undefined,
    });
  }
  return services;
}

export function parseSessionServicesFromMeta(
  meta: Record<string, unknown> | null | undefined,
): SessionServicesMeta | null {
  const raw = meta?.services;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const persistedStatus = row.status;
  const hasPersistedStatus =
    persistedStatus === "registered" ||
    persistedStatus === "starting" ||
    persistedStatus === "running" ||
    persistedStatus === "active" ||
    persistedStatus === "idle" ||
    persistedStatus === "stopped" ||
    persistedStatus === "error" ||
    persistedStatus === "unregistered";
  const hasRuntimeReference =
    (typeof row.jobId === "string" && row.jobId.length > 0) ||
    typeof row.pid === "number" ||
    (Array.isArray(row.services) &&
      row.services.some((item) => {
        if (!item || typeof item !== "object") return false;
        const service = item as Record<string, unknown>;
        return (
          (typeof service.jobId === "string" && service.jobId.length > 0) ||
          typeof service.pid === "number"
        );
      }));
  const status: SessionServicesMeta["status"] = hasPersistedStatus
    ? (persistedStatus as SessionServicesMeta["status"])
    : typeof row.error === "string" && row.error.trim()
      ? "error"
      : hasRuntimeReference
        ? "active"
        : "idle";
  if (
    !hasPersistedStatus &&
    !hasRuntimeReference &&
    typeof row.startCommand !== "string" &&
    !Array.isArray(row.services) &&
    !Array.isArray(row.views)
  ) {
    return null;
  }
  if (
    status !== "registered" &&
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
  const services = parseServices(row.services);
  const views = Array.isArray(row.views)
    ? row.views.flatMap((item): SessionServiceView[] => {
        if (!item || typeof item !== "object") return [];
        const view = item as Record<string, unknown>;
        const name = typeof view.name === "string" ? view.name.trim() : "";
        const service = typeof view.service === "string" ? view.service.trim() : "";
        const port = typeof view.port === "number" ? view.port : Number(view.port);
        return name && service && Number.isFinite(port) && port > 0
          ? [{ name, service, port, path: typeof view.path === "string" ? view.path : undefined }]
          : [];
      })
    : [];
  return {
    status,
    installCommand: typeof row.installCommand === "string" ? row.installCommand : undefined,
    startCommand: typeof row.startCommand === "string" ? row.startCommand : undefined,
    stopCommand: typeof row.stopCommand === "string" ? row.stopCommand : undefined,
    destroyCommand: typeof row.destroyCommand === "string" ? row.destroyCommand : undefined,
    services: services.length > 0 ? services : undefined,
    views: views.length > 0 ? views : undefined,
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
  return Boolean(services?.startCommand || services?.services?.length);
}
