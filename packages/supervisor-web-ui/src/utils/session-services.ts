export interface SessionUiPort {
  scriptName: string;
  envVar: string;
  label?: string;
  path?: string;
}

export interface SessionServicesMeta {
  status: "starting" | "running" | "active" | "idle" | "stopped" | "error" | "unregistered";
  sleepAt?: number;
  installedAt?: string;
  uiPorts?: SessionUiPort[];
  portEnv?: Record<string, string>;
  error?: string;
}

export interface SessionServicesPreview {
  scriptName: string;
  envVar: string;
  label?: string;
  path?: string;
  previewUrl: string;
}

export interface SessionServicesSnapshot {
  status: SessionServicesMeta["status"] | "none";
  sleepAt?: number;
  installedAt?: string;
  uiPorts: SessionUiPort[];
  previews: SessionServicesPreview[];
  error?: string;
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
  const uiPorts: SessionUiPort[] = [];
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
    status,
    sleepAt: typeof row.sleepAt === "number" ? row.sleepAt : undefined,
    installedAt: typeof row.installedAt === "string" ? row.installedAt : undefined,
    uiPorts: uiPorts.length > 0 ? uiPorts : undefined,
    error: typeof row.error === "string" ? row.error : undefined,
  };
}

export function sessionHasProjectServices(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  const services = parseSessionServicesFromMeta(meta);
  return services != null || !!(meta?.services && typeof meta.services === "object");
}
