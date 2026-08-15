import type { Session } from "../types.js";
import type { SessionServiceApp, SessionServicesMeta } from "./project-runtime.js";
import { parseSessionServicesMeta } from "./session-services.js";

export interface SessionPreviewTarget {
  scriptName: string;
  port: number;
  proxyBasePath: string;
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
    proxyBasePath: prefix,
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
  url.searchParams.delete("password");
  return url;
}

function appendPreviewPassword(url: string, password: string | null): string {
  if (!password) return url;
  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const separator = beforeHash.includes("?") ? "&" : "?";
  return `${beforeHash}${separator}password=${encodeURIComponent(password)}${hash}`;
}

function proxyRootPath(path: string, target: SessionPreviewTarget, password: string | null): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (path === target.proxyBasePath || path.startsWith(`${target.proxyBasePath}/`)) return path;
  return appendPreviewPassword(`${target.proxyBasePath}${path}`, password);
}

export function rewriteSessionPreviewText(
  text: string,
  contentType: string,
  target: SessionPreviewTarget,
  requestUrl: URL,
): string {
  const password = requestUrl.searchParams.get("password");
  let rewritten = text;

  if (contentType.includes("text/html")) {
    rewritten = rewritten.replace(
      /\b(src|href|action|poster)=(['"])(\/[^'"]*)\2/gi,
      (_match, attribute: string, quote: string, path: string) =>
        `${attribute}=${quote}${proxyRootPath(path, target, password)}${quote}`,
    );
  }

  if (
    contentType.includes("javascript") ||
    contentType.includes("ecmascript") ||
    contentType.includes("text/css") ||
    contentType.includes("text/html")
  ) {
    rewritten = rewritten.replace(
      /(['"`])(\/(?!\/)[@A-Za-z0-9._~-][^'"`\r\n]*)\1/g,
      (_match, quote: string, path: string) =>
        `${quote}${proxyRootPath(path, target, password)}${quote}`,
    );
    rewritten = rewritten.replace(
      /url\(\s*(['"]?)(\/(?!\/)[^)'"]*)\1\s*\)/gi,
      (_match, quote: string, path: string) =>
        `url(${quote}${proxyRootPath(path, target, password)}${quote})`,
    );
  }

  // Vite's HMR client bakes its base and WebSocket path into /@vite/client.
  // Keep both on the Session preview route instead of falling back to Supervisor's root.
  if (contentType.includes("javascript") && text.includes('const socketHost = `')) {
    const proxyBase = `${target.proxyBasePath}/`;
    rewritten = rewritten
      .replace('const base$1 = "/" || "/";', `const base$1 = ${JSON.stringify(proxyBase)};`)
      .replace('const base = "/" || "/";', `const base = ${JSON.stringify(proxyBase)};`)
      .replace('${"/"}', `\${${JSON.stringify(proxyBase)}}`);
    if (password) {
      const encoded = encodeURIComponent(password);
      rewritten = rewritten
        .replaceAll('?token=${wsToken}', `?token=\${wsToken}&password=${encoded}`)
        .replace(
          't=${timestamp}${query ? `&${query}` : ""}',
          `t=\${timestamp}\${query ? \`&\${query}\` : ""}&password=${encoded}`,
        );
    }
  }

  return rewritten;
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

  const fetchOptions: RequestInit = {
    method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    redirect: "manual",
  };
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, fetchOptions);
  } catch {
    const ipv6Url = new URL(upstreamUrl);
    ipv6Url.hostname = "[::1]";
    upstream = await fetch(ipv6Url, fetchOptions);
  }

  const responseHeaders = sanitizePreviewResponseHeaders(upstream.headers);
  const contentType = responseHeaders.get("content-type")?.toLowerCase() ?? "";
  const shouldRewrite =
    contentType.includes("text/html") ||
    contentType.includes("javascript") ||
    contentType.includes("ecmascript") ||
    contentType.includes("text/css");
  if (shouldRewrite) {
    const text = await upstream.text();
    return new Response(rewriteSessionPreviewText(text, contentType, target, new URL(request.url)), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }
  const location = responseHeaders.get("location");
  if (location?.startsWith("/")) {
    responseHeaders.set(
      "location",
      proxyRootPath(location, target, new URL(request.url).searchParams.get("password")),
    );
  }
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
  const active =
    services.status === "starting" ||
    services.status === "running" ||
    services.status === "active";
  const previews = active
    ? apps.map((app) => ({
        name: app.name,
        port: app.port,
        path: app.path,
        scriptName: app.name,
        label: app.name,
        previewUrl: `${origin}${buildSessionPreviewPath(session.id, app.name, app.path ?? "/")}`,
      }))
    : [];
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
