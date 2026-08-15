import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
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

  it("keeps timer fire runs as Jobs without a schedules table", () => {
    const run = jobs.create(sessionId, {
      kind: "timer",
      name: "timer.fire",
      label: "check deploy",
      status: "succeeded",
      metadata: { timerId: "abc123" },
    });

    expect(jobs.list(sessionId)).toMatchObject([{ id: run.id, metadata: { timerId: "abc123" } }]);
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

  it("kills persisted background process trees before marking their jobs interrupted", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    const pid = child.pid!;
    const job = jobs.create(sessionId, {
      kind: "shell",
      name: "persistent-bash",
      status: "running",
      executionMode: "background",
      metadata: { pid },
    });

    const restarted = new JobManager(db);

    expect(restarted.get(job.id)?.status).toBe("interrupted");
    expect(() => process.kill(pid, 0)).toThrow();
  });
});
