import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SupervisorDb } from "../src/db/db.js";
import { syncHomeTaskFromSessionStatus } from "../src/core/home-task-sync.js";

let db: SupervisorDb;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "home-task-"));
  db = new SupervisorDb(join(tmpDir, "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("home-task-sync", () => {
  it("maps session finish to child done and parent done", () => {
    const project = db.insertProject({ cwd: join(tmpDir, "repo"), name: "Demo" });
    const parent = db.insertHomeTask({
      title: "Parent",
      projectId: project.id,
      status: "in_progress",
    });
    const session = db.insert({
      project_id: project.id,
      parent_id: null,
      session_id: null,
      pid: null,
      status: "running",
      cwd: project.cwd,
      meta: "{}",
    });
    const child = db.insertHomeTask({
      title: "Child",
      projectId: project.id,
      parentId: parent.id,
      sessionId: session.id,
      status: "in_progress",
    });

    syncHomeTaskFromSessionStatus(db, session.id, "finish");

    expect(db.getHomeTask(child.id)?.status).toBe("done");
    expect(db.getHomeTask(parent.id)?.status).toBe("done");
  });

  it("maps session error to child error and parent blocked", () => {
    const project = db.insertProject({ cwd: join(tmpDir, "repo2"), name: "Demo2" });
    const parent = db.insertHomeTask({
      title: "Parent",
      projectId: project.id,
      status: "in_progress",
    });
    const session = db.insert({
      project_id: project.id,
      parent_id: null,
      session_id: null,
      pid: null,
      status: "running",
      cwd: project.cwd,
      meta: "{}",
    });
    db.insertHomeTask({
      title: "Child",
      projectId: project.id,
      parentId: parent.id,
      sessionId: session.id,
      status: "in_progress",
    });

    syncHomeTaskFromSessionStatus(db, session.id, "error");

    expect(db.getHomeTaskBySessionId(session.id)?.status).toBe("error");
    expect(db.getHomeTask(parent.id)?.status).toBe("blocked");
  });
});
