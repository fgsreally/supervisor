import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobManager } from "../src/core/jobs.js";
import { SupervisorDb } from "../src/db.js";

let db: SupervisorDb;
let jobs: JobManager;
let sessionId: number;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `supervisor-jobs-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new SupervisorDb(join(tmpDir, "test.db"));
  sessionId = db.insert({
    project_id: null,
    parent_id: null,
    session_id: null,
    pid: null,
    status: "idle",
    cwd: "/tmp",
    meta: "{}",
  }).id;
  jobs = new JobManager(db);
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("JobManager", () => {
  it("persists execution state and invokes cancellation handlers", async () => {
    const job = jobs.create(sessionId, {
      kind: "shell",
      name: "persistent-bash",
      status: "running",
      executionMode: "background",
      capabilities: ["cancel", "read_output"],
    });
    const cancel = vi.fn();
    jobs.setCancelHandler(job.id, cancel);
    jobs.update(job.id, { output: "running tests" });

    const cancelled = await jobs.cancel(job.id);
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancelled).toMatchObject({ status: "cancelled", output: "running tests" });
    expect(jobs.list(sessionId)).toHaveLength(1);
  });

  it("stores schedules separately from their runs", () => {
    const schedule = jobs.createSchedule(sessionId, {
      kind: "timer",
      name: "timer.fire",
      label: "check deploy",
      prompt: "inspect the deployment",
      nextRunAt: Date.now() + 60_000,
      intervalMs: 300_000,
    });
    const run = jobs.create(sessionId, {
      kind: "timer",
      name: "timer.fire",
      label: schedule.label,
      status: "succeeded",
      metadata: { scheduleId: schedule.id },
    });

    expect(jobs.listSchedules(sessionId)).toMatchObject([{ id: schedule.id }]);
    expect(jobs.list(sessionId)).toMatchObject([
      { id: run.id, metadata: { scheduleId: schedule.id } },
    ]);
  });

  it("marks unfinished executions interrupted after restart", () => {
    const job = jobs.create(sessionId, {
      kind: "mcp",
      name: "remote.index",
      status: "running",
    });
    const restarted = new JobManager(db);
    expect(restarted.get(job.id)?.status).toBe("interrupted");
  });
});
