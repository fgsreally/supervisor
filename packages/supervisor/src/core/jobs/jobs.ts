import { randomUUID } from "node:crypto";
import type { SupervisorDb } from "../../db/db.js";
import { writeLog } from "../../i18n/logs.js";
import { killProcessTreeSync } from "../../utils/process-tree.js";

export type JobStatus =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export type JobCapability = "cancel" | "input" | "read_output" | "retry";

export interface JobRecord {
  id: string;
  sessionId: number;
  kind: string;
  name: string;
  label: string;
  status: JobStatus;
  executionMode: "inline" | "background";
  parentJobId?: string;
  capabilities: JobCapability[];
  output: string;
  progress?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
  metadata: Record<string, unknown>;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface CreateJobInput {
  kind: string;
  name: string;
  label?: string;
  status?: JobStatus;
  executionMode?: "inline" | "background";
  parentJobId?: string;
  capabilities?: JobCapability[];
  output?: string;
  progress?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateJobInput {
  status?: JobStatus;
  output?: string;
  progress?: Record<string, unknown> | null;
  result?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
}

interface JobRow {
  id: string;
  session_id: number;
  kind: string;
  name: string;
  label: string;
  status: JobStatus;
  execution_mode: "inline" | "background";
  parent_job_id: string | null;
  capabilities: string;
  output: string;
  progress: string | null;
  result: string | null;
  error: string | null;
  metadata: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

function parseJson(value: string | null): unknown {
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function toJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.kind,
    name: row.name,
    label: row.label,
    status: row.status,
    executionMode: row.execution_mode,
    ...(row.parent_job_id ? { parentJobId: row.parent_job_id } : {}),
    capabilities: (parseJson(row.capabilities) as JobCapability[] | undefined) ?? [],
    output: row.output,
    ...(row.progress !== null
      ? { progress: parseJson(row.progress) as Record<string, unknown> }
      : {}),
    ...(row.result !== null ? { result: parseJson(row.result) } : {}),
    ...(row.error !== null ? { error: parseJson(row.error) } : {}),
    metadata: (parseJson(row.metadata) as Record<string, unknown> | undefined) ?? {},
    createdAt: row.created_at,
    ...(row.started_at === null ? {} : { startedAt: row.started_at }),
    ...(row.finished_at === null ? {} : { finishedAt: row.finished_at }),
  };
}

function jobId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

const TERMINAL_STATUSES = new Set<JobStatus>(["succeeded", "failed", "cancelled", "interrupted"]);

/**
 * Persistent execution registry shared by extensions, HTTP APIs, and the Web UI.
 * Jobs are running/finished work units (bash, timer.fire, …).
 * Timer *definitions* live in sessions.meta.timers, not here.
 */
export class JobManager {
  readonly #db: SupervisorDb["db"];
  readonly #cancelHandlers = new Map<string, () => void | Promise<void>>();
  readonly #inputHandlers = new Map<string, (input: string) => void | Promise<void>>();
  #onTerminal: ((job: JobRecord) => void) | undefined;

  constructor(db: SupervisorDb) {
    this.#db = db.db;
    const unfinishedBackgroundJobs = this.#db
      .prepare(
        `SELECT metadata FROM jobs
         WHERE execution_mode = 'background'
           AND status IN ('running', 'waiting')`,
      )
      .all() as Array<{ metadata: string }>;
    for (const row of unfinishedBackgroundJobs) {
      const metadata = parseJson(row.metadata);
      const pid =
        metadata && typeof metadata === "object"
          ? (metadata as Record<string, unknown>).pid
          : undefined;
      if (typeof pid === "number") killProcessTreeSync(pid);
    }
    this.#db
      .prepare(
        "UPDATE jobs SET status = 'interrupted', finished_at = ? WHERE status IN ('queued', 'running', 'waiting')",
      )
      .run(Date.now());
  }

  /** Fired once when a Job first enters a terminal status (succeeded/failed/cancelled/interrupted). */
  setTerminalHandler(handler: ((job: JobRecord) => void) | undefined): void {
    this.#onTerminal = handler;
  }

  create(sessionId: number, input: CreateJobInput): JobRecord {
    const id = jobId();
    const now = Date.now();
    const status = input.status ?? "queued";
    this.#db
      .prepare(
        `INSERT INTO jobs (
          id, session_id, kind, name, label, status, execution_mode, parent_job_id,
          capabilities, output, progress, metadata, created_at, started_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        sessionId,
        input.kind,
        input.name,
        input.label?.trim() || input.name,
        status,
        input.executionMode ?? "inline",
        input.parentJobId ?? null,
        JSON.stringify(input.capabilities ?? []),
        input.output ?? "",
        input.progress ? JSON.stringify(input.progress) : null,
        JSON.stringify(input.metadata ?? {}),
        now,
        status === "running" ? now : null,
        TERMINAL_STATUSES.has(status) ? now : null,
      );
    return this.get(id)!;
  }

  get(id: string): JobRecord | undefined {
    const row = this.#db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
    return row ? toJob(row) : undefined;
  }

  list(sessionId: number, options?: { limit?: number; kind?: string }): JobRecord[] {
    const limit = Math.max(1, Math.min(200, Math.floor(options?.limit ?? 50)));
    const rows = options?.kind
      ? (this.#db
          .prepare(
            "SELECT * FROM jobs WHERE session_id = ? AND kind = ? ORDER BY created_at DESC LIMIT ?",
          )
          .all(sessionId, options.kind, limit) as JobRow[])
      : (this.#db
          .prepare("SELECT * FROM jobs WHERE session_id = ? ORDER BY created_at DESC LIMIT ?")
          .all(sessionId, limit) as JobRow[]);
    return rows.map(toJob);
  }

  update(id: string, patch: UpdateJobInput): JobRecord {
    const current = this.get(id);
    if (!current) throw new Error(`Job ${id} not found`);
    const nextStatus = patch.status ?? current.status;
    const becameTerminal =
      TERMINAL_STATUSES.has(nextStatus) && !TERMINAL_STATUSES.has(current.status);
    const metadata = patch.metadata ? { ...current.metadata, ...patch.metadata } : current.metadata;
    const startedAt =
      nextStatus === "running" ? (current.startedAt ?? Date.now()) : current.startedAt;
    const finishedAt = TERMINAL_STATUSES.has(nextStatus)
      ? (current.finishedAt ?? Date.now())
      : undefined;
    this.#db
      .prepare(
        `UPDATE jobs SET status = ?, output = ?, progress = ?, result = ?, error = ?,
          metadata = ?, started_at = ?, finished_at = ? WHERE id = ?`,
      )
      .run(
        nextStatus,
        patch.output ?? current.output,
        patch.progress === null ? null : JSON.stringify(patch.progress ?? current.progress ?? null),
        patch.result === undefined
          ? JSON.stringify(current.result ?? null)
          : JSON.stringify(patch.result),
        patch.error === undefined
          ? JSON.stringify(current.error ?? null)
          : JSON.stringify(patch.error),
        JSON.stringify(metadata),
        startedAt ?? null,
        finishedAt ?? null,
        id,
      );
    if (TERMINAL_STATUSES.has(nextStatus)) {
      this.#cancelHandlers.delete(id);
      this.#inputHandlers.delete(id);
    }
    const next = this.get(id)!;
    if (becameTerminal) {
      try {
        this.#onTerminal?.(next);
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        writeLog("error", "runtime.jobHandlerFailed", { id, error: detail });
      }
    }
    return next;
  }

  setCancelHandler(id: string, handler: () => void | Promise<void>): void {
    if (!this.get(id)) throw new Error(`Job ${id} not found`);
    this.#cancelHandlers.set(id, handler);
  }

  setInputHandler(id: string, handler: (input: string) => void | Promise<void>): void {
    if (!this.get(id)) throw new Error(`Job ${id} not found`);
    this.#inputHandlers.set(id, handler);
  }

  async input(id: string, input: string): Promise<void> {
    const current = this.get(id);
    if (!current) throw new Error(`Job ${id} not found`);
    if (TERMINAL_STATUSES.has(current.status)) throw new Error(`Job ${id} is not running`);
    const handler = this.#inputHandlers.get(id);
    if (!current.capabilities.includes("input") || !handler) {
      throw new Error(`Job ${id} does not accept input`);
    }
    await handler(input);
  }

  async cancel(id: string): Promise<JobRecord> {
    const current = this.get(id);
    if (!current) throw new Error(`Job ${id} not found`);
    if (TERMINAL_STATUSES.has(current.status)) return current;
    await this.#cancelHandlers.get(id)?.();
    return this.update(id, { status: "cancelled" });
  }
}
