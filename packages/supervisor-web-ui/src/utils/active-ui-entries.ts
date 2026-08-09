import * as api from "@/api";
import type { UISession } from "@/types/ui";
import { parseSessionServicesFromMeta } from "./session-services";

export interface ActiveUiEntry {
  key: string;
  sessionId: string;
  sessionTitle: string;
  scriptName: string;
  envVar: string;
  label?: string;
  path?: string;
  previewUrl: string;
  status: "starting" | "running" | "stopped" | "error";
}

export function collectActiveUiEntries(sessions: UISession[]): ActiveUiEntry[] {
  const result: ActiveUiEntry[] = [];
  for (const session of sessions) {
    const services = parseSessionServicesFromMeta(session.meta);
    if (!services?.uiPorts?.length) continue;
    if (services.status !== "running" && services.status !== "starting") continue;
    for (const port of services.uiPorts) {
      result.push({
        key: `${session.id}:${port.scriptName}:${port.envVar}`,
        sessionId: session.id,
        sessionTitle: session.title,
        scriptName: port.scriptName,
        envVar: port.envVar,
        label: port.label,
        path: port.path,
        previewUrl: api.buildSessionPreviewUrl(session.id, port.scriptName, port.path ?? "/"),
        status: services.status,
      });
    }
  }
  return result.sort((left, right) => {
    const title = left.sessionTitle.localeCompare(right.sessionTitle, "zh-CN");
    if (title !== 0) return title;
    return (left.label ?? left.scriptName).localeCompare(right.label ?? right.scriptName, "zh-CN");
  });
}

export function paginateActiveUiEntries<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; page: number; totalPages: number; total: number } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
  };
}
