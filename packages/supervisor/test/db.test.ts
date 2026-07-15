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
    session_id: null,
    pid: null,
    status: "starting",
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
    const inst = insertSession(db, { status: "starting", cwd: "/tmp" });
    expect(inst.id).toBeGreaterThan(0);
    expect(inst.status).toBe("starting");
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

  it("filters sessions by main-list visibility", () => {
    insertSession(db, { show_in_session_list: 1 });
    insertSession(db, { show_in_session_list: 0 });
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
    const inst = insertSession(db, { status: "starting" });
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

  it("agents.meta defaults to {} and merges via updateAgentMeta", () => {
    const providerId = db.insertProvider({
      slug: "anthropic",
      name: "Anthropic",
      api_type: "anthropic-messages",
    });
    const agent = db.insertAgent({
      name: "test",
      provider_id: providerId,
    });
    expect(agent.meta).toEqual({});
    const merged = db.updateAgentMeta(agent.id, { key: "value" });
    expect(merged).toEqual({ key: "value" });
  });

  it("stores model context window and multimodal flags", () => {
    const providerId = db.insertProvider({
      slug: "openai",
      name: "OpenAI",
      api_type: "openai-compatible",
    });
    const model = db.insertModel({
      provider_id: providerId,
      model_id: "gpt-4",
      context_window: 200000,
      supports_multimodal: 1,
    });
    expect(model.contextWindow).toBe(200000);
    expect(model.supportsMultimodal).toBe(true);
  });
});
