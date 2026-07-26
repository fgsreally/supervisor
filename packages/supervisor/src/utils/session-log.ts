import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getSessionDir } from "../core/session-files.js";

export type SessionLogLevel = "debug" | "info" | "warn" | "error";

export interface SessionLogEntry {
  t: number;
  l: SessionLogLevel;
  m: string;
  tags?: string[];
  meta?: Record<string, unknown>;
}

export interface AppendSessionLogInput {
  level?: SessionLogLevel;
  message: string;
  tags?: string[];
  meta?: Record<string, unknown>;
}

export interface ReadSessionLogOptions {
  level?: SessionLogLevel;
  tags?: string[];
}

type ProjectIdResolver = (sessionId: number) => number | null | undefined;

let projectIdResolver: ProjectIdResolver | null = null;

/** Wire SessionManager / DB lookup so timing helpers can persist without projectId. */
export function configureSessionLogProjectResolver(resolver: ProjectIdResolver): void {
  projectIdResolver = resolver;
}

function sessionLogPath(projectId: string | number, sessionId: string | number): string {
  return join(getSessionDir(projectId, sessionId), "logs", "session.jsonl");
}

function legacyExtensionLogPath(projectId: string | number, sessionId: string | number): string {
  return join(getSessionDir(projectId, sessionId), "logs", "extensions.log");
}

function ensureLogDir(projectId: string | number, sessionId: string | number): string {
  const dir = join(getSessionDir(projectId, sessionId), "logs");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function normalizeLevel(level: unknown): SessionLogLevel {
  if (level === "debug" || level === "info" || level === "warn" || level === "error") {
    return level;
  }
  return "info";
}

function serializeEntry(entry: SessionLogEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

/** Persist a structured log line for a known project/session pair. */
export function appendSessionLog(
  projectId: string | number,
  sessionId: string | number,
  input: AppendSessionLogInput,
): void {
  const entry: SessionLogEntry = {
    t: Date.now(),
    l: normalizeLevel(input.level),
    m: input.message,
    ...(input.tags?.length ? { tags: [...input.tags] } : {}),
    ...(input.meta && Object.keys(input.meta).length > 0 ? { meta: input.meta } : {}),
  };
  try {
    ensureLogDir(projectId, sessionId);
    appendFileSync(sessionLogPath(projectId, sessionId), serializeEntry(entry), "utf8");
  } catch (error) {
    console.error("[session-log] failed to append", {
      projectId,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Persist by session id when a project resolver is configured.
 * Always mirrors to console for server operators.
 */
export function sessionLog(
  sessionId: number | string,
  level: SessionLogLevel,
  message: string,
  tags?: string[],
  meta?: Record<string, unknown>,
): void {
  const id = Number(sessionId);
  const prefix = `[session-log ${sessionId}]`;
  if (level === "error") console.error(prefix, message, meta ?? "");
  else if (level === "warn") console.warn(prefix, message, meta ?? "");
  else console.log(prefix, message, meta ?? "");

  if (!Number.isFinite(id)) return;
  const projectId = projectIdResolver?.(id);
  if (projectId == null) return;
  appendSessionLog(projectId, id, { level, message, tags, meta });
}

function parseJsonlLine(line: string): SessionLogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<SessionLogEntry>;
    if (typeof parsed.m !== "string") return null;
    return {
      t: typeof parsed.t === "number" ? parsed.t : Date.now(),
      l: normalizeLevel(parsed.l),
      m: parsed.m,
      ...(Array.isArray(parsed.tags) ? { tags: parsed.tags.filter((t): t is string => typeof t === "string") } : {}),
      ...(parsed.meta && typeof parsed.meta === "object" ? { meta: parsed.meta as Record<string, unknown> } : {}),
    };
  } catch {
    return null;
  }
}

/** Parse legacy plain-text extension log lines into structured entries. */
function parseLegacyExtensionLine(line: string): SessionLogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // 2024-01-01T00:00:00.000Z INFO message optional-json
  const match = /^(\S+)\s+(DEBUG|INFO|WARN|ERROR)\s+([\s\S]+)$/i.exec(trimmed);
  if (!match) {
    return {
      t: Date.now(),
      l: "info",
      m: trimmed,
      tags: ["extension", "legacy"],
    };
  }
  const [, iso, levelRaw, rest] = match;
  const t = Date.parse(iso);
  let message = rest;
  let meta: Record<string, unknown> | undefined;
  const metaIdx = rest.lastIndexOf(" {");
  if (metaIdx >= 0) {
    try {
      meta = JSON.parse(rest.slice(metaIdx + 1)) as Record<string, unknown>;
      message = rest.slice(0, metaIdx).trimEnd();
    } catch {
      // keep full rest as message
    }
  }
  return {
    t: Number.isFinite(t) ? t : Date.now(),
    l: normalizeLevel(levelRaw.toLowerCase()),
    m: message,
    tags: ["extension", "legacy"],
    ...(meta ? { meta } : {}),
  };
}

function matchesFilter(entry: SessionLogEntry, options?: ReadSessionLogOptions): boolean {
  if (options?.level && entry.l !== options.level) return false;
  if (options?.tags?.length) {
    const tags = entry.tags ?? [];
    if (!options.tags.some((tag) => tags.includes(tag))) return false;
  }
  return true;
}

/** Read structured session logs (+ legacy extension plaintext if present). */
export function readSessionLog(
  projectId: string | number,
  sessionId: string | number,
  options?: ReadSessionLogOptions,
): SessionLogEntry[] {
  const entries: SessionLogEntry[] = [];

  const jsonl = sessionLogPath(projectId, sessionId);
  if (existsSync(jsonl)) {
    try {
      const text = readFileSync(jsonl, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const entry = parseJsonlLine(line);
        if (entry && matchesFilter(entry, options)) entries.push(entry);
      }
    } catch (error) {
      console.error("[session-log] failed to read session.jsonl", {
        projectId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const legacy = legacyExtensionLogPath(projectId, sessionId);
  if (existsSync(legacy)) {
    try {
      const text = readFileSync(legacy, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const entry = parseLegacyExtensionLine(line);
        if (entry && matchesFilter(entry, options)) entries.push(entry);
      }
    } catch (error) {
      console.error("[session-log] failed to read extensions.log", {
        projectId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  entries.sort((a, b) => a.t - b.t);
  return entries;
}
