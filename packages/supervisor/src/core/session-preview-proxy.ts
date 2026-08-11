import type { Session } from "../types.js";
import type { SessionServiceApp, SessionServicesMeta } from "./project-runtime.js";
import { parseSessionServicesMeta } from "./session-services.js";

export interface SessionPreviewTarget {
  scriptName: string;
  port: number;
  basePath: string;
  subPath: string;
}

const FRAME_BLOCKING_HEADERS = [
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
];

function isPreviewableStatus(status: SessionServicesMeta["status"] | undefined): boolean {
  return status === "running" || status === "active" || status === "starting";
}

export function buildSessionPreviewPath(
  sessionId: number,
  scriptName: string,
  subPath = "/",
): string {
  const normalized = subPath.startsWith("/") ? subPath.slice(1) : subPath;
  const encoded = encodeURIComponent(scriptName);
  return normalized
    ? `/sessions/${sessionId}/preview/${encoded}/${normalized}`
    : `/sessions/${sessionId}/preview/${encoded}/`;
}

export function resolveSessionPreviewTarget(options: {
  session: Pick<Session, "id" | "meta">;
  scriptName: string;
  requestPath: string;
}): SessionPreviewTarget | null {
  const services = parseSessionServicesMeta(options.session.meta);
  if (!services || !isPreviewableStatus(services.status)) return null;
  const app = findServiceApp(services, options.scriptName);
  if (!app) return null;
  const prefix = `/sessions/${options.session.id}/preview/${encodeURIComponent(options.scriptName)}`;
  let subPath = options.requestPath.startsWith(prefix)
    ? options.requestPath.slice(prefix.length)
    : options.requestPath;
  if (!subPath.startsWith("/")) subPath = `/${subPath}`;
  return {
    scriptName: options.scriptName,
    port: app.port,
    basePath: app.path ?? "/",
    subPath: subPath === "/" ? (app.path ?? "/") : subPath,
  };
}

export function findServiceApp(
  services: SessionServicesMeta,
  name: string,
): SessionServiceApp | undefined {
  return services.apps?.find((app) => app.name === name);
}

/** @deprecated use findServiceApp */
export function findUiPort(services: SessionServicesMeta, scriptName: string) {
  const app = findServiceApp(services, scriptName);
  if (!app) return undefined;
  return { scriptName: app.name, envVar: "PORT", label: app.name, path: app.path };
}

export function buildPreviewUpstreamUrl(target: SessionPreviewTarget, requestUrl: URL): URL {
  const upstreamPath = target.subPath.startsWith("/") ? target.subPath : `/${target.subPath}`;
  const url = new URL(upstreamPath, `http://127.0.0.1:${target.port}`);
  url.search = requestUrl.search;
  return url;
}

export function sanitizePreviewResponseHeaders(headers: Headers): Headers {
  const next = new Headers(headers);
  for (const name of FRAME_BLOCKING_HEADERS) {
    next.delete(name);
  }
  const csp = next.get("content-security-policy");
  if (csp) {
    const withoutFrameAncestors = csp
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part && !part.toLowerCase().startsWith("frame-ancestors"))
      .join("; ");
    if (withoutFrameAncestors) next.set("content-security-policy", withoutFrameAncestors);
    else next.delete("content-security-policy");
  }
  next.delete("content-length");
  return next;
}

export async function proxySessionPreviewRequest(
  request: Request,
  target: SessionPreviewTarget,
): Promise<Response> {
  const upstreamUrl = buildPreviewUpstreamUrl(target, new URL(request.url));
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("accept-encoding");

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await request.arrayBuffer().catch(() => undefined);

  const upstream = await fetch(upstreamUrl, {
    method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    redirect: "manual",
  });

  const responseHeaders = sanitizePreviewResponseHeaders(upstream.headers);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export interface SessionServicesPreviewDto {
  name: string;
  port: number;
  path?: string;
  previewUrl: string;
  /** @deprecated alias of name */
  scriptName: string;
  /** @deprecated unused */
  envVar?: string;
  label?: string;
}

export function buildSessionServicesDto(
  session: Pick<Session, "id" | "meta">,
  origin = "",
): {
  status: SessionServicesMeta["status"] | "none";
  sleepAt?: number;
  installedAt?: string;
  apps: SessionServiceApp[];
  /** @deprecated use apps */
  uiPorts: Array<{ scriptName: string; envVar: string; label?: string; path?: string }>;
  previews: SessionServicesPreviewDto[];
  error?: string;
} {
  const services = parseSessionServicesMeta(session.meta);
  if (!services) {
    return { status: "none", apps: [], uiPorts: [], previews: [] };
  }
  const apps = services.apps ?? [];
  const previews = apps.map((app) => ({
    name: app.name,
    port: app.port,
    path: app.path,
    scriptName: app.name,
    label: app.name,
    previewUrl: `${origin}${buildSessionPreviewPath(session.id, app.name, app.path ?? "/")}`,
  }));
  return {
    status: services.status,
    sleepAt: services.sleepAt,
    installedAt: services.installedAt,
    apps,
    uiPorts: apps.map((app) => ({
      scriptName: app.name,
      envVar: "PORT",
      label: app.name,
      path: app.path,
    })),
    previews,
    error: services.error,
  };
}
