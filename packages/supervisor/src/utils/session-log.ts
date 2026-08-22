import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getSessionDir } from "../core/session/session-files.js";
import { translateLog, translateRawLog, writeLog, type LogKey } from "../i18n/logs.js";
import { appendRotatingTextLog } from "./text-log.js";

export type SessionLogLevel = "debug" | "info" | "warn" | "error";
export const SESSION_LOG_MAX_BYTES = 2 * 1024 * 1024;

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
  limit?: number;
  before?: number;
  after?: number;
}

export interface ReadSessionLogResult {
  entries: SessionLogEntry[];
  hasMore: boolean;
}

type ProjectIdResolver = (sessionId: number) => number | null | undefined;

let projectIdResolver: ProjectIdResolver | null = null;

/** Wire SessionManager / DB lookup so timing helpers can persist without projectId. */
export function configureSessionLogProjectResolver(resolver: ProjectIdResolver): void {
  projectIdResolver = resolver;
}

function sessionLogPath(projectId: string | number, sessionId: string | number): string {
  return join(getSessionDir(projectId, sessionId), "logs", "session.log");
}

function legacySessionLogPath(projectId: string | number, sessionId: string | number): string {
  return join(getSessionDir(projectId, sessionId), "logs", "session.jsonl");
}

function legacyExtensionLogPath(projectId: string | number, sessionId: string | number): string {
  return join(getSessionDir(projectId, sessionId), "logs", "extensions.log");
}

function normalizeLevel(level: unknown): SessionLogLevel {
  if (level === "debug" || level === "info" || level === "warn" || level === "error") {
    return level;
  }
  return "info";
}

function serializeEntry(entry: SessionLogEntry): string {
  const tags = entry.tags?.length ? ` ${entry.tags.map((tag) => `[${tag}]`).join(" ")}` : "";
  const meta = entry.meta ? ` meta=${JSON.stringify(entry.meta)}` : "";
  return `${new Date(entry.t).toISOString()} [${entry.l}]${tags} ${entry.m}${meta}`;
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
    appendRotatingTextLog(
      sessionLogPath(projectId, sessionId),
      serializeEntry(entry),
      SESSION_LOG_MAX_BYTES,
    );
  } catch (error) {
    writeLog(
      "error",
      "runtime.sessionLog.appendFailed",
      {},
      {
        projectId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

/**
 * Persist by session id when a project resolver is configured.
 * Session-scoped logs are file-only; system logging is intentionally separate.
 */
export function sessionLog(
  sessionId: number | string,
  level: SessionLogLevel,
  message: string,
  tags?: string[],
  meta?: Record<string, unknown>,
): void {
  const id = Number(sessionId);
  const localizedMessage = translateRawLog(message);
  if (!Number.isFinite(id)) return;
  let projectId: number | string | null | undefined;
  try {
    projectId = projectIdResolver?.(id);
  } catch {
    // Session logging must never surface a secondary error while the database is closing.
    return;
  }
  if (projectId == null) return;
  appendSessionLog(projectId, id, { level, message: localizedMessage, tags, meta });
}

export function sessionLogEvent(
  sessionId: number | string,
  level: SessionLogLevel,
  key: LogKey,
  params: Record<string, string | number | boolean | null | undefined> = {},
  tags?: string[],
  meta?: Record<string, unknown>,
): void {
  sessionLog(sessionId, level, translateLog(key, params), tags, meta);
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
      ...(Array.isArray(parsed.tags)
        ? { tags: parsed.tags.filter((t): t is string => typeof t === "string") }
        : {}),
      ...(parsed.meta && typeof parsed.meta === "object"
        ? { meta: parsed.meta as Record<string, unknown> }
        : {}),
    };
  } catch {
    return null;
  }
}

function parseTextLine(line: string): SessionLogEntry | null {
  const trimmed = line.trim();
  const match = /^(\S+) \[(debug|info|warn|error)\](.*)$/i.exec(trimmed);
  if (!match) return null;
  const timestamp = Date.parse(match[1]);
  let rest = match[3].trim();
  const tags: string[] = [];
  while (rest.startsWith("[")) {
    const end = rest.indexOf("]");
    if (end < 0) break;
    tags.push(rest.slice(1, end));
    rest = rest.slice(end + 1).trimStart();
  }
  let meta: Record<string, unknown> | undefined;
  const metaIndex = rest.lastIndexOf(" meta=");
  if (metaIndex >= 0) {
    try {
      const parsed = JSON.parse(rest.slice(metaIndex + 6));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        meta = parsed as Record<string, unknown>;
        rest = rest.slice(0, metaIndex);
      }
    } catch {
      // Keep the original message when the optional metadata is malformed.
    }
  }
  return {
    t: Number.isFinite(timestamp) ? timestamp : Date.now(),
    l: normalizeLevel(match[2].toLowerCase()),
    m: rest,
    ...(tags.length ? { tags } : {}),
    ...(meta ? { meta } : {}),
  };
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
): ReadSessionLogResult {
  const entries: SessionLogEntry[] = [];
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);

  const textLog = sessionLogPath(projectId, sessionId);
  if (existsSync(textLog)) {
    try {
      const text = readFileSync(textLog, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const entry = parseTextLine(line);
        if (entry && matchesFilter(entry, options)) entries.push(entry);
      }
    } catch (error) {
      writeLog(
        "error",
        "runtime.sessionLog.readJsonlFailed",
        {},
        { projectId, sessionId, error: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  const jsonl = legacySessionLogPath(projectId, sessionId);
  if (existsSync(jsonl)) {
    try {
      const text = readFileSync(jsonl, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const entry = parseJsonlLine(line);
        if (entry && matchesFilter(entry, options)) entries.push(entry);
      }
    } catch (error) {
      writeLog(
        "error",
        "runtime.sessionLog.readJsonlFailed",
        {},
        {
          projectId,
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
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
      writeLog(
        "error",
        "runtime.sessionLog.readLegacyFailed",
        {},
        {
          projectId,
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  entries.sort((a, b) => a.t - b.t);

  if (options?.after != null && Number.isFinite(options.after)) {
    const newer = entries.filter((entry) => entry.t > options.after!);
    return {
      entries: newer.slice(0, limit),
      hasMore: newer.length > limit,
    };
  }

  if (options?.before != null && Number.isFinite(options.before)) {
    const older = entries.filter((entry) => entry.t < options.before!);
    const slice = older.slice(-limit);
    return {
      entries: slice,
      hasMore: older.length > limit,
    };
  }

  const slice = entries.slice(-limit);
  return {
    entries: slice,
    hasMore: entries.length > limit,
  };
}
