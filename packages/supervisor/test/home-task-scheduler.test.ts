import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SupervisorDb } from "../src/db/db.js";
import { scheduleReadyHomeTasks } from "../src/core/tasks/home-task-scheduler.js";

let db: SupervisorDb;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "home-sched-"));
  db = new SupervisorDb(join(tmpDir, "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("home-task-scheduler", () => {
  it("spawns only dependency-ready children in parallel", async () => {
    const project = db.insertProject({ cwd: join(tmpDir, "repo"), name: "Demo" });
    const agent = db.insertAgent({ name: "Worker" });
    const parent = db.insertHomeTask({
      title: "Root",
      projectId: project.id,
      status: "in_progress",
      phase: "executing",
    });
    const first = db.insertHomeTask({
      title: "First",
      description: "do first",
      projectId: project.id,
      parentId: parent.id,
      agentId: agent.id,
      status: "todo",
    });
    const second = db.insertHomeTask({
      title: "Second",
      description: "do second",
      projectId: project.id,
      parentId: parent.id,
      agentId: agent.id,
      status: "todo",
      dependsOn: [first.id],
    });
    const parallel = db.insertHomeTask({
      title: "Parallel",
      description: "do parallel",
      projectId: project.id,
      parentId: parent.id,
      agentId: agent.id,
      status: "todo",
      subagentIds: [agent.id],
    });

    const spawn = vi.fn(async (options: { title: string; meta?: Record<string, unknown> }) => {
      const session = db.insert({
        project_id: project.id,
        parent_id: null,
        session_id: null,
        pid: null,
        status: "running",
        cwd: project.cwd,
        meta: JSON.stringify(options.meta ?? {}),
      });
      return { id: session.id, title: options.title, meta: options.meta };
    });

    const started = await scheduleReadyHomeTasks(
      {
        db,
        resolveDefaultSpawnAgentId: () => agent.id,
        spawn: spawn as never,
      },
      parent.id,
    );

    expect(started.map((item) => item.id).sort()).toEqual([first.id, parallel.id].sort());
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(db.getHomeTask(second.id)?.sessionId).toBeNull();
    expect(db.getHomeTask(first.id)?.status).toBe("in_progress");
    expect(db.getHomeTask(parallel.id)?.subagentIds).toEqual([agent.id]);

    const parallelCall = spawn.mock.calls.find((call) => call[0].title === "Parallel");
    expect(parallelCall?.[0].meta).toEqual({ subagentIds: [agent.id] });

    db.updateHomeTask(first.id, { status: "done" });
    const next = await scheduleReadyHomeTasks(
      {
        db,
        resolveDefaultSpawnAgentId: () => agent.id,
        spawn: spawn as never,
      },
      parent.id,
    );
    expect(next.map((item) => item.id)).toEqual([second.id]);
    expect(db.getHomeTask(second.id)?.status).toBe("in_progress");
  });

  it("does nothing when parent is not executing", async () => {
    const project = db.insertProject({ cwd: join(tmpDir, "repo2"), name: "Demo2" });
    const parent = db.insertHomeTask({
      title: "Root",
      projectId: project.id,
      phase: "awaiting_confirm",
    });
    db.insertHomeTask({
      title: "Child",
      projectId: project.id,
      parentId: parent.id,
      status: "todo",
    });
    const spawn = vi.fn(async () => ({ id: 1 }));
    const started = await scheduleReadyHomeTasks(
      {
        db,
        resolveDefaultSpawnAgentId: () => 1,
        spawn,
      },
      parent.id,
    );
    expect(started).toEqual([]);
    expect(spawn).not.toHaveBeenCalled();
  });
});
