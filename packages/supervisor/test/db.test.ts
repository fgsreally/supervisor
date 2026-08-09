import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SupervisorDb } from "../src/db.js";

let db: SupervisorDb;
let tmpDir: string;

function insertSession(
  db: SupervisorDb,
  overrides: Partial<Parameters<SupervisorDb["insert"]>[0]> = {},
) {
  return db.insert({
    project_id: null,
    parent_id: null,
    status: "idle",
    cwd: "/",
    meta: "{}",
    ...overrides,
  });
}

beforeEach(() => {
  tmpDir = join(tmpdir(), `supervisor-db-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new SupervisorDb(join(tmpDir, "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("supervisor: SupervisorDb", () => {
  it("inserts and retrieves an instance", () => {
    const inst = insertSession(db, { status: "idle", cwd: "/tmp" });
    expect(inst.id).toBeGreaterThan(0);
    expect(inst.status).toBe("idle");
    expect(inst.meta).toEqual({});
    expect(typeof inst.created_at).toBe("number");

    const fetched = db.get(inst.id);
    expect(fetched?.id).toBe(inst.id);
  });

  it("returns undefined for missing id", () => {
    expect(db.get(99999)).toBeUndefined();
  });

  it("lists all instances, newest first", () => {
    insertSession(db, {
      status: "running",
      created_at: 1000,
      last_active_at: 1000,
    });
    const newer = insertSession(db, {
      status: "idle",
      created_at: 2000,
      last_active_at: 2000,
    });
    const list = db.list();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(newer.id);
  });

  it("filters by status", () => {
    insertSession(db, { status: "running" });
    insertSession(db, { status: "idle" });
    expect(db.list({ status: "running" })).toHaveLength(1);
    expect(db.list({ status: "idle" })).toHaveLength(1);
  });

  it("filters by parentId null (root instances)", () => {
    const root = insertSession(db, { status: "running" });
    insertSession(db, { parent_id: root.id, status: "running" });
    expect(db.list({ parentId: null })).toHaveLength(1);
    expect(db.list({ parentId: root.id })).toHaveLength(1);
  });

  it("derives main-list visibility from spawn_type", () => {
    insertSession(db, { spawn_type: null });
    insertSession(db, { spawn_type: "subagent" });
    expect(db.list({ showInSessionList: true })).toHaveLength(1);
    expect(db.list({ showInSessionList: false })).toHaveLength(1);
  });

  it("returns children in creation order", () => {
    const root = insertSession(db, { status: "running" });
    const c1 = insertSession(db, { parent_id: root.id, status: "running" });
    const c2 = insertSession(db, { parent_id: root.id, status: "running" });
    const children = db.children(root.id);
    expect(children.map((c) => c.id)).toEqual([c1.id, c2.id]);
  });

  it("updateStatus changes status and updates lastActiveAt", async () => {
    const inst = insertSession(db, { status: "idle" });
    await new Promise((r) => setTimeout(r, 5));
    db.updateStatus(inst.id, "running");
    const updated = db.get(inst.id)!;
    expect(updated.status).toBe("running");
    expect(updated.last_active_at).toBeGreaterThanOrEqual(updated.created_at);
  });

  it("updateMeta merges patch into existing meta", () => {
    const inst = insertSession(db, { status: "idle", meta: '{"a":1}' });
    const merged = db.updateMeta(inst.id, { b: 2 });
    expect(merged).toEqual({ a: 1, b: 2 });
    expect(db.get(inst.id)!.meta).toEqual({ a: 1, b: 2 });
  });

  it("migrates legacy task tables into session meta", () => {
    const session = insertSession(db, {
      meta: JSON.stringify({
        tasks: ["goal/legacy.md"],
        todos: [{ title: "from meta", status: "done" }],
      }),
    });
    db.db.exec(`
      ALTER TABLE sessions ADD COLUMN current_task_id INTEGER;
      CREATE TABLE session_tasks (
        id INTEGER PRIMARY KEY,
        session_id INTEGER NOT NULL,
        path TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT,
        status TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE session_todos (
        id INTEGER PRIMARY KEY,
        session_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    db.db
      .prepare(
        "INSERT INTO session_tasks VALUES (1, ?, 'plan/current.md', 'plan', 'Current plan', 'planning', 1, 1)",
      )
      .run(session.id);
    db.db
      .prepare("INSERT INTO session_todos VALUES (1, ?, 'from table', 'completed', 0, 1, 1)")
      .run(session.id);
    db.db.prepare("UPDATE sessions SET current_task_id = 1 WHERE id = ?").run(session.id);
    db.close();

    db = new SupervisorDb(join(tmpDir, "test.db"));

    expect(db.get(session.id)?.meta).toMatchObject({
      currentTask: "plan/current.md",
      tasks: [
        { path: "goal/legacy.md", kind: "goal" },
        { path: "plan/current.md", kind: "plan", title: "Current plan", status: "planning" },
      ],
      todos: [
        { title: "from meta", status: "completed" },
        { title: "from table", status: "completed" },
      ],
    });
    expect(db.listSessionTasks(session.id)).toHaveLength(2);
    expect(db.listSessionTodos(session.id)).toHaveLength(2);
    expect(
      db.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_tasks'")
        .get(),
    ).toBeUndefined();
  });

  it("setMeta replaces meta entirely", () => {
    const inst = insertSession(db, {
      status: "idle",
      meta: '{"old":true}',
    });
    db.setMeta(inst.id, { new: true });
    expect(db.get(inst.id)!.meta).toEqual({ new: true });
  });

  it("delete removes the record", () => {
    const inst = insertSession(db, { status: "idle" });
    db.delete(inst.id);
    expect(db.get(inst.id)).toBeUndefined();
  });

  it("updateMeta throws for missing instance", () => {
    expect(() => db.updateMeta(99999, { x: 1 })).toThrow("not found");
  });

  it("normalizes legacy protocol on insert and read", () => {
    const providerId = db.insertProvider({
      slug: "legacy",
      name: "Legacy",
      protocol: "anthropic-messages",
    });
    expect(db.getProvider(providerId)?.protocol).toBe("messages");
    const row = db.db.prepare("SELECT protocol FROM providers WHERE id = ?").get(providerId) as {
      protocol: string;
    };
    expect(row.protocol).toBe("messages");
  });

  it("agents.meta defaults to {} and merges via updateAgentMeta", () => {
    const providerId = db.insertProvider({
      slug: "anthropic",
      name: "Anthropic",
      protocol: "anthropic-messages",
    });
    const model = db.insertModel({ provider_id: providerId, model_id: "test-model" });
    const agent = db.insertAgent({
      name: "test",
      model_id: model.id,
    });
    expect(agent.meta).toEqual({});
    const merged = db.updateAgentMeta(agent.id, { key: "value" });
    expect(merged).toEqual({ key: "value" });
  });

  it("stores ACP agents without a provider", () => {
    const agent = db.insertAgent({
      name: "External",
      backend_type: "acp",
      meta: { external: { command: "example", args: ["acp"] } },
    });
    expect(agent.backendType).toBe("acp");
    expect(agent.providerId).toBeNull();
    expect(agent.homeDir).toBeNull();
  });

  it("stores model context window and vision capability", () => {
    const providerId = db.insertProvider({
      slug: "openai",
      name: "OpenAI",
      protocol: "openai-compatible",
    });
    const model = db.insertModel({
      provider_id: providerId,
      model_id: "gpt-4",
      context_window: 200000,
      supports_vision: 1,
    });
    expect(model.contextWindow).toBe(200000);
    expect(model.supportsVision).toBe(true);
  });

  it("refuses to delete a model that is bound to an agent", () => {
    const providerId = db.insertProvider({
      slug: "anthropic",
      name: "Anthropic",
      protocol: "anthropic-messages",
    });
    const model = db.insertModel({ provider_id: providerId, model_id: "claude-sonnet-4-6" });
    db.insertAgent({
      name: "Coding Agent",
      model_id: model.id,
    });

    expect(() => db.deleteModel(providerId, "claude-sonnet-4-6")).toThrow(
      'Model "claude-sonnet-4-6" is in use by agent(s): Coding Agent',
    );
    expect(db.listModelsByProvider(providerId)).toHaveLength(1);
  });

  it("uses the target columns for converged tables", () => {
    const names = (table: string) =>
      (db.db.pragma(`table_info(${table})`) as Array<{ name: string }>).map(
        (column) => column.name,
      );
    expect(names("models")).toEqual([
      "id",
      "provider_id",
      "model_id",
      "name",
      "context_window",
      "supports_vision",
      "created_at",
      "updated_at",
    ]);
    expect(names("agents")).toEqual([
      "id",
      "name",
      "description",
      "avatar",
      "backend_type",
      "model_id",
      "system_prompt",
      "tools_preset",
      "home_dir",
      "is_builtin",
      "external_config",
      "permission_rules",
      "meta",
      "created_at",
      "updated_at",
    ]);
    expect(names("projects")).toEqual([
      "id",
      "name",
      "description",
      "cwd",
      "home_dir",
      "created_at",
      "updated_at",
    ]);
    expect(names("sessions")).toEqual([
      "id",
      "project_id",
      "parent_id",
      "status",
      "thinking_level",
      "cwd",
      "leaf_id",
      "agent_id",
      "spawn_type",
      "created_by",
      "title",
      "system_prompt",
      "avatar",
      "is_builtin",
      "pinned",
      "muted",
      "unread",
      "external_session_id",
      "error_msg",
      "stage",
      "shadow_enabled",
      "created_at",
      "last_active_at",
      "meta",
    ]);
    expect(names("messages")).toEqual([
      "id",
      "entry_id",
      "session_id",
      "parent_entry_id",
      "type",
      "payload",
      "meta",
      "is_old",
      "origin_msg",
      "role",
      "search_text",
      "created_at",
    ]);
    expect(names("session_input_queue")).toEqual([
      "id",
      "session_id",
      "message",
      "level",
      "origin_msg",
      "images",
      "enqueued_at",
    ]);
  });
});
