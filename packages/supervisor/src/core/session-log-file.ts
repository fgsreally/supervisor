import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureSessionDir, getSessionDir, removeSessionDir } from "./session-files.js";

export type Level = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  t: number;
  l: Level;
  m: string;
  tags?: string[];
  meta?: Record<string, unknown>;
}

function logEntryToLine(entry: LogEntry): string {
  const obj: Record<string, unknown> = { t: entry.t, l: entry.l, m: entry.m };
  if (entry.tags?.length) obj.tags = entry.tags;
  if (entry.meta) obj.meta = entry.meta;
  return JSON.stringify(obj) + "\n";
}

/**
 * Per-session log file backed by disk at project work dir / sessions / {sessionId} / session.log.
 * JSONL format — each line is one JSON LogEntry.
 *
 * Thread-safe via promise chaining: all writes serialize through a shared promise queue.
 */
export class SessionLogFile {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly projectId: string,
    private readonly sessionId: string,
  ) {
    this.filePath = join(getSessionDir(projectId, sessionId), "session.log");
  }

  /** Ensure the log directory exists. Called automatically by the first log() call. */
  async init(): Promise<void> {
    await ensureSessionDir(this.projectId, this.sessionId);
  }

  /**
   * Append a log entry. Safe to call before init() completes — writes queue behind it.
   * Returns a promise that resolves once the entry is flushed to disk.
   */
  log(
    level: Level,
    message: string,
    tags?: string[],
    meta?: Record<string, unknown>,
  ): Promise<void> {
    if (this.closed) return Promise.resolve();
    const line = logEntryToLine({ t: Date.now(), l: level, m: message, tags, meta });
    this.writeQueue = this.writeQueue
      .then(() => appendFile(this.filePath, line, "utf-8"))
      .catch((err) => console.error(`SessionLogFile[${this.sessionId}] write error:`, err));
    return this.writeQueue;
  }

  /** Mark as closed; subsequent log() calls are no-ops. */
  async close(): Promise<void> {
    this.closed = true;
    await this.writeQueue;
  }

  /** Read all entries from the log file. Returns [] if file doesn't exist. */
  async readAll(): Promise<LogEntry[]> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as LogEntry);
    } catch {
      return [];
    }
  }

  /** Delete the entire log directory for this session. */
  async destroy(): Promise<void> {
    await this.close();
    await removeSessionDir(this.projectId, this.sessionId);
  }
}
