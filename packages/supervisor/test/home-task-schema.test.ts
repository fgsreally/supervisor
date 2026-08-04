import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SupervisorDb } from "../src/db/db.js";

let db: SupervisorDb;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "home-schema-"));
  db = new SupervisorDb(join(tmpDir, "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("todo_task schema", () => {
  it("records task history in timeline_events by type", () => {
    const task = db.insertHomeTask({ title: "Timeline task" });
    db.updateHomeTask(task.id, { status: "in_progress" });

    const events = db.listTimelineEvents({ type: "todo_task" });
    expect(events.map((event) => event.kind)).toEqual(["created", "status_changed"]);
    expect(events.every((event) => event.type === "todo_task")).toBe(true);
    expect(events.at(-1)?.entityId).toBe(String(task.id));
  });

  it("persists depends_on agent_id subagent_ids and phase", () => {
    const project = db.insertProject({ cwd: join(tmpDir, "repo"), name: "Demo" });
    const agent = db.insertAgent({ name: "A" });
    const sub = db.insertAgent({ name: "B" });
    const parent = db.insertHomeTask({
      title: "Root",
      projectId: project.id,
      phase: "awaiting_confirm",
    });
    const child = db.insertHomeTask({
      title: "Child",
      projectId: project.id,
      parentId: parent.id,
      agentId: agent.id,
      subagentIds: [sub.id],
      dependsOn: [],
      phase: "draft",
    });
    const updated = db.updateHomeTask(child.id, { dependsOn: [parent.id] });
    expect(updated.dependsOn).toEqual([parent.id]);
    expect(updated.agentId).toBe(agent.id);
    expect(updated.subagentIds).toEqual([sub.id]);
    expect(db.getHomeTask(parent.id)?.phase).toBe("awaiting_confirm");
  });

  it("migrates missing plan columns on existing databases", () => {
    db.db.exec(`
      DROP TABLE todo_task;
      CREATE TABLE todo_task (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        project_id INTEGER,
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT NOT NULL DEFAULT 'normal',
        parent_id INTEGER,
        session_id INTEGER,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    const now = Date.now();
    db.db
      .prepare(
        `INSERT INTO todo_task
          (title, description, project_id, status, priority, parent_id, session_id, error, created_at, updated_at)
         VALUES (?, '', NULL, 'todo', 'normal', NULL, NULL, NULL, ?, ?)`,
      )
      .run("Legacy", now, now);
    db.close();

    db = new SupervisorDb(join(tmpDir, "test.db"));
    const names = new Set(
      (db.db.pragma("table_info(todo_task)") as Array<{ name: string }>).map((c) => c.name),
    );
    expect(names.has("agent_id")).toBe(true);
    expect(names.has("depends_on")).toBe(true);
    expect(names.has("subagent_ids")).toBe(true);
    expect(names.has("phase")).toBe(true);
    const legacy = db.listHomeTasks()[0];
    expect(legacy?.phase).toBe("draft");
    expect(legacy?.dependsOn).toEqual([]);
    expect(legacy?.subagentIds).toEqual([]);
  });

  it("renames legacy home_tasks table to todo_task", () => {
    db.db.exec(`
      DROP TABLE IF EXISTS todo_task;
      CREATE TABLE home_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        project_id INTEGER,
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT NOT NULL DEFAULT 'normal',
        parent_id INTEGER,
        session_id INTEGER,
        agent_id INTEGER,
        depends_on TEXT NOT NULL DEFAULT '[]',
        subagent_ids TEXT NOT NULL DEFAULT '[]',
        phase TEXT NOT NULL DEFAULT 'draft',
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    const now = Date.now();
    db.db
      .prepare(
        `INSERT INTO home_tasks
          (title, description, project_id, status, priority, parent_id, session_id,
           agent_id, depends_on, subagent_ids, phase, error, created_at, updated_at)
         VALUES (?, '', NULL, 'todo', 'normal', NULL, NULL, NULL, '[]', '[]', 'draft', NULL, ?, ?)`,
      )
      .run("FromHome", now, now);
    db.close();

    db = new SupervisorDb(join(tmpDir, "test.db"));
    expect(
      db.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'home_tasks'")
        .get(),
    ).toBeUndefined();
    expect(
      db.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'todo_task'")
        .get(),
    ).toBeTruthy();
    expect(db.listHomeTasks().map((task) => task.title)).toEqual(["FromHome"]);
  });
});
