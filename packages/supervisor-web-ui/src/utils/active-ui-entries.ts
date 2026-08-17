import * as api from "@/api";
import type { UISession } from "@/types/ui";
import { parseSessionServicesFromMeta } from "./session-services";

export interface ActiveUiEntry {
  key: string;
  sessionId: string;
  sessionTitle: string;
  scriptName: string;
  name: string;
  port: number;
  path?: string;
  label?: string;
  previewUrl: string;
  status: "starting" | "running" | "active" | "stopped" | "error" | "idle";
}

function isActiveStatus(status: string): status is "starting" | "running" | "active" {
  return status === "running" || status === "starting" || status === "active";
}

export function collectActiveUiEntries(sessions: UISession[]): ActiveUiEntry[] {
  const result: ActiveUiEntry[] = [];
  for (const session of sessions) {
    const services = parseSessionServicesFromMeta(session.meta);
    if (!services) continue;
    const views = services.views ?? [];
    if (!views.length) continue;
    if (!isActiveStatus(services.status)) continue;
    for (const app of views) {
      result.push({
        key: `${session.id}:${app.name}:${app.port}`,
        sessionId: session.id,
        sessionTitle: session.title,
        scriptName: app.name,
        name: app.name,
        port: app.port,
        path: app.path,
        label: app.name,
        previewUrl: api.buildSessionPreviewUrl(session.id, app.name, app.path ?? "/"),
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
