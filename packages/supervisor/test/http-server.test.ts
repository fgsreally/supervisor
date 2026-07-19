import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "./mock-agent-harness.js";
import { SupervisorDb } from "../src/db.js";
import { createHttpServer } from "../src/http-server.js";
import { SessionManager } from "../src/session-manager.js";
import { MockAgentHarness } from "./mock-agent-harness.js";

let db: SupervisorDb;
let manager: SessionManager;
let app: ReturnType<typeof createHttpServer>;
let tmpDir: string;

beforeEach(() => {
  MockAgentHarness.instances = [];
  tmpDir = join(tmpdir(), `supervisor-http-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new SupervisorDb(join(tmpDir, "test.db"));
  manager = new SessionManager(db);
  app = createHttpServer(manager);
});

afterEach(async () => {
  await manager.dispose();
  rmSync(tmpDir, { recursive: true, force: true });
});

async function req(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("supervisor: HTTP server", () => {
  it("GET /sessions returns empty array initially", async () => {
    const res = await req("GET", "/sessions");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("POST /sessions spawns an instance and returns 201", async () => {
    const res = await req("POST", "/sessions", { cwd: "/tmp" });
    if (res.status !== 201) {
      console.error("SPAWN FAIL:", res.status, await res.text());
    }
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBeDefined();
    expect(body.status).toBe("idle");
  });

  it("GET /sessions lists spawned instances", async () => {
    await req("POST", "/sessions", { cwd: "/tmp" });
    const list = (await (await req("GET", "/sessions")).json()) as unknown[];
    expect(list).toHaveLength(1);
  });

  it("GET /sessions?status=idle filters by status", async () => {
    await req("POST", "/sessions", { cwd: "/tmp" });
    const list = (await (await req("GET", "/sessions?status=idle")).json()) as Array<{
      status: string;
    }>;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((i) => i.status === "idle")).toBe(true);
  });

  it("GET /sessions/:id returns the instance", async () => {
    const { id } = (await (await req("POST", "/sessions", { cwd: "/tmp" })).json()) as {
      id: string;
    };
    const res = await req("GET", `/sessions/${id}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }).id).toBe(id);
  });

  it("GET /sessions/:id returns 404 for unknown id", async () => {
    expect((await req("GET", "/sessions/99999")).status).toBe(404);
  });

  it("GET /sessions/:id/children returns child list", async () => {
    const { id: parentId } = (await (await req("POST", "/sessions", { cwd: "/tmp" })).json()) as {
      id: string;
    };
    await req("POST", "/sessions", { cwd: "/tmp", parentId });
    const children = (await (await req("GET", `/sessions/${parentId}/children`)).json()) as Array<{
      parentId: string;
    }>;
    expect(children).toHaveLength(1);
    expect(children[0].parentId).toBe(parentId);
  });

  it("POST /sessions/:id/btw creates a hidden BTW child", async () => {
    const { id: parentId } = (await (await req("POST", "/sessions", { cwd: "/tmp" })).json()) as {
      id: string;
    };
    const res = await req("POST", `/sessions/${parentId}/btw`, {});
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(
      expect.objectContaining({
        parentId,
        branchType: "btw",
        showInSessionList: false,
      }),
    );
  });

  it("GET /sessions/:id/messages returns session entries", async () => {
    const { id } = (await (await req("POST", "/sessions", { cwd: "/tmp" })).json()) as {
      id: string;
    };
    const res = await req("GET", `/sessions/${id}/messages`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("PATCH /sessions/:id/meta merges patch", async () => {
    const { id } = (await (
      await req("POST", "/sessions", { cwd: "/tmp", meta: { a: 1 } })
    ).json()) as {
      id: string;
    };
    const res = await req("PATCH", `/sessions/${id}/meta`, { b: 2 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({ a: 1, b: 2 }));
  });

  it("PUT /sessions/:id/meta replaces meta", async () => {
    const { id } = (await (
      await req("POST", "/sessions", { cwd: "/tmp", meta: { old: true } })
    ).json()) as {
      id: string;
    };
    await req("PUT", `/sessions/${id}/meta`, { fresh: true });
    const session = (await (await req("GET", `/sessions/${id}`)).json()) as {
      meta: Record<string, unknown>;
    };
    expect(session.meta).toEqual({ fresh: true });
  });

  it("keeps Agent-managed task metadata read-only over HTTP", async () => {
    const create = await req("POST", "/sessions", {
      cwd: "/tmp",
      meta: { tasks: ["tasks/goal-1.md"] },
    });
    expect(create.status).toBe(403);

    const { id } = (await (await req("POST", "/sessions", { cwd: "/tmp" })).json()) as {
      id: string;
    };
    manager.updateMeta(Number(id), {
      tasks: ["tasks/goal-1.md"],
      currentTask: "tasks/goal-1.md",
      todos: [{ title: "inspect", status: "in_progress" }],
    });

    expect((await req("PATCH", `/sessions/${id}/meta`, { currentTask: null })).status).toBe(403);
    expect((await req("PUT", `/sessions/${id}/meta`, { tasks: [] })).status).toBe(403);
    expect((await req("PATCH", `/sessions/${id}/meta`, { todos: [] })).status).toBe(403);
    expect((await req("PUT", `/sessions/${id}/meta`, { name: "renamed" })).status).toBe(200);

    expect(await (await req("GET", `/sessions/${id}/todos`)).json()).toEqual([
      { title: "inspect", status: "in_progress" },
    ]);

    const session = (await (await req("GET", `/sessions/${id}`)).json()) as {
      meta: Record<string, unknown>;
    };
    expect(session.meta).toEqual({
      name: "renamed",
      tasks: ["tasks/goal-1.md"],
      currentTask: "tasks/goal-1.md",
      todos: [{ title: "inspect", status: "in_progress" }],
    });
  });

  it("POST /sessions/:id/prompt returns SSE stream for running instance", async () => {
    const { id } = (await (await req("POST", "/sessions", { cwd: "/tmp" })).json()) as {
      id: string;
    };
    const res = await req("POST", `/sessions/${id}/prompt`, { message: "hello" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body).toContain('"type":"started"');
    expect(body).toContain('"type":"done"');
  });

  it("GET /sessions/:id/state returns headless state", async () => {
    const { id } = (await (await req("POST", "/sessions", { cwd: "/tmp" })).json()) as {
      id: string;
    };
    const res = await req("GET", `/sessions/${id}/state`);
    expect(res.status).toBe(200);
    const state = (await res.json()) as { id: string; cwd: string };
    expect(state.id).toBe(id);
    expect(state.cwd).toBe("/tmp");
  });

  it("POST /sessions/:id headless controls return ok", async () => {
    const { id } = (await (await req("POST", "/sessions", { cwd: "/tmp" })).json()) as {
      id: string;
    };
    expect((await req("POST", `/sessions/${id}/steer`, { message: "steer" })).status).toBe(200);
    expect((await req("POST", `/sessions/${id}/follow-up`, { message: "next" })).status).toBe(200);
    expect((await req("POST", `/sessions/${id}/abort`)).status).toBe(200);
    expect(
      (await req("POST", `/sessions/${id}/compact`, { customInstructions: "short" })).status,
    ).toBe(200);
    expect((await req("POST", `/sessions/${id}/thinking-level`, { level: "low" })).status).toBe(
      200,
    );
  });

  it("POST /sessions/:id/kill returns ok", async () => {
    const { id } = (await (await req("POST", "/sessions", { cwd: "/tmp" })).json()) as {
      id: string;
    };
    const res = await req("POST", `/sessions/${id}/kill`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("POST /sessions/:id/kill returns 409 for non-running instance", async () => {
    const inst = manager.create();
    expect((await req("POST", `/sessions/${inst.id}/kill`)).status).toBe(409);
  });

  it("DELETE /sessions/:id removes the DB record", async () => {
    const { id } = (await (await req("POST", "/sessions", { cwd: "/tmp" })).json()) as {
      id: string;
    };
    await req("DELETE", `/sessions/${id}`);
    expect((await req("GET", `/sessions/${id}`)).status).toBe(404);
  });

  it("POST /sessions/:id/send returns 409 in embedded mode", async () => {
    const { id } = (await (await req("POST", "/sessions", { cwd: "/tmp" })).json()) as {
      id: string;
    };
    const res = await req("POST", `/sessions/${id}/send`, { type: "prompt", message: "hi" });
    expect(res.status).toBe(409);
  });

  it("checkpoint and rewind HTTP endpoints", async () => {
    const { id } = (await (await req("POST", "/sessions", { cwd: "/tmp" })).json()) as {
      id: string;
    };
    const { SQLiteSessionStorage } = await import("../src/session-storage.js");
    const storage = new SQLiteSessionStorage(db, id);
    const entryId = await storage.createEntryId();
    await storage.appendEntry({
      id: entryId,
      parentId: null,
      timestamp: new Date().toISOString(),
      type: "message",
      message: { role: "user", content: "checkpoint me", timestamp: Date.now() },
    });

    const createRes = await req("POST", `/sessions/${id}/checkpoints`, { label: "save-1" });
    expect(createRes.status).toBe(201);
    const checkpoint = (await createRes.json()) as { id: string; entryId: string };
    expect(checkpoint.entryId).toBe(entryId);

    const listRes = await req("GET", `/sessions/${id}/checkpoints`);
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { checkpoints: Array<{ id: string }> };
    expect(listed.checkpoints).toHaveLength(1);

    const rewindRes = await req("POST", `/sessions/${id}/rewind`, { checkpointId: checkpoint.id });
    expect(rewindRes.status).toBe(200);
  });

  it("POST /sessions/:id/commit returns commit payload shape", async () => {
    const { id } = (await (await req("POST", "/sessions", { cwd: "/tmp" })).json()) as {
      id: string;
    };
    const res = await req("POST", `/sessions/${id}/commit`, {});
    expect(res.status).toBe(409);
  });
});
