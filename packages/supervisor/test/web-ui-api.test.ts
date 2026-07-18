import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "./mock-agent-harness.js";
import { SupervisorDb } from "../src/db.js";
import { createHttpServer } from "../src/http-server.js";
import { SessionManager } from "../src/session-manager.js";

let db: SupervisorDb;
let manager: SessionManager;
let app: ReturnType<typeof createHttpServer>;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `supervisor-web-ui-test-${Date.now()}`);
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

describe("supervisor: Web UI API compatibility", () => {
  describe("Provider management", () => {
    it("POST /providers creates a new provider", async () => {
      const res = await req("POST", "/providers", {
        name: "Test Provider",
        apiType: "anthropic-messages",
        baseUrl: "https://api.test.com",
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; name: string; apiKey: null };
      expect(body.id).toBeDefined();
      expect(body.name).toBe("Test Provider");
      expect(body.apiKey).toBeNull();
    });

    it("POST /providers requires name", async () => {
      const res = await req("POST", "/providers", { apiType: "anthropic-messages" });
      expect(res.status).toBe(400);
    });

    it("POST /providers requires apiType", async () => {
      const res = await req("POST", "/providers", { name: "Test" });
      expect(res.status).toBe(400);
    });

    it("DELETE /providers/:id removes provider", async () => {
      const createRes = await req("POST", "/providers", {
        name: "To Delete",
        apiType: "anthropic-messages",
      });
      const { id } = (await createRes.json()) as { id: string };

      const deleteRes = await req("DELETE", `/providers/${id}`);
      expect(deleteRes.status).toBe(200);
      expect(await deleteRes.json()).toEqual({ ok: true });

      // Verify it's gone
      const getRes = await req("GET", `/providers/${id}`);
      expect(getRes.status).toBe(404);
    });

    it("DELETE /providers/:id returns 404 for unknown", async () => {
      const res = await req("DELETE", "/providers/99999");
      expect(res.status).toBe(404);
    });

    it("GET /providers lists providers with null apiKey", async () => {
      await req("POST", "/providers", {
        name: "Provider 1",
        apiType: "anthropic-messages",
        apiKey: "secret-key",
      });

      const res = await req("GET", "/providers");
      expect(res.status).toBe(200);
      const list = (await res.json()) as Array<{ apiKey: null }>;
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].apiKey).toBeNull();
    });

    it("PATCH /providers/:id updates the encrypted API key without exposing it", async () => {
      const createRes = await req("POST", "/providers", {
        name: "Provider with key",
        apiType: "openai-compatible",
      });
      const { id } = (await createRes.json()) as { id: string };

      const updateRes = await req("PATCH", `/providers/${id}`, { apiKey: "updated-secret" });
      expect(updateRes.status).toBe(200);
      expect((await updateRes.json()) as { apiKey: null }).toMatchObject({ apiKey: null });
      expect(db.getProvider(Number(id))?.apiKey).toBe("updated-secret");
    });
  });

  describe("Agent management", () => {
    it("rejects built-in Agent mutations through HTTP", async () => {
      const providerId = db.insertProvider({
        slug: "builtin-test",
        name: "Builtin Test",
        api_type: "anthropic-messages",
      });
      const agent = db.insertAgent({
        name: "Builtin",
        provider_id: providerId,
        meta: { builtin: true, userSpawnable: true },
      });

      expect((await req("PATCH", `/agents/${agent.id}`, { name: "Changed" })).status).toBe(403);
      expect(
        (await req("PUT", `/agents/${agent.id}/system-md`, { content: "Changed" })).status,
      ).toBe(403);
      expect((await req("PATCH", `/agents/${agent.id}/meta`, { key: "value" })).status).toBe(403);
      expect((await req("POST", `/agents/${agent.id}/resources`, { resourceId: 1 })).status).toBe(
        403,
      );
      expect((await req("DELETE", `/agents/${agent.id}/resources/1`)).status).toBe(403);
      expect((await req("DELETE", `/agents/${agent.id}`)).status).toBe(403);
    });

    it("rejects reserved built-in metadata when creating an Agent", async () => {
      const res = await req("POST", "/agents", {
        name: "Fake Builtin",
        providerId: 1,
        meta: { builtin: true },
      });
      expect(res.status).toBe(400);
    });

    it("POST /agents creates agent", async () => {
      // First create a provider
      const providerRes = await req("POST", "/providers", {
        name: "Test Provider",
        apiType: "anthropic-messages",
      });
      const { id: providerId } = (await providerRes.json()) as { id: string };

      // Create agent
      const res = await req("POST", "/agents", {
        name: "Test Agent",
        providerId,
        description: "A test agent",
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; name: string; providerId: string };
      expect(body.id).toBeDefined();
      expect(body.name).toBe("Test Agent");
      expect(body.providerId).toBe(providerId);
    });

    it("POST /agents creates an isolated ACP agent without a provider", async () => {
      const res = await req("POST", "/agents", {
        name: "External ACP",
        backendType: "acp",
        meta: { external: { command: "example", args: ["acp"] } },
      });
      expect(res.status).toBe(201);
      const agent = (await res.json()) as {
        id: string;
        backendType: string;
        providerId: string | null;
        homeDir: string | null;
      };
      expect(agent).toMatchObject({
        backendType: "acp",
        providerId: null,
        homeDir: null,
      });

      const resources = (await (await req("GET", `/agents/${agent.id}/resources`)).json()) as {
        homeDir: string;
        tools: unknown[];
        layers: { agent: Record<string, unknown[]> };
      };
      expect(resources.homeDir).toBe("");
      expect(resources.tools).toEqual([]);
      expect(resources.layers.agent).toEqual({ skills: [], prompts: [], extensions: [], mcp: [] });
    });

    it("GET /agents/:id/resources returns agent resources", async () => {
      // Create provider and agent
      const providerRes = await req("POST", "/providers", {
        name: "Test Provider",
        apiType: "anthropic-messages",
      });
      const { id: providerId } = (await providerRes.json()) as { id: string };

      const agentRes = await req("POST", "/agents", {
        name: "Test Agent",
        providerId,
      });
      const { id: agentId } = (await agentRes.json()) as { id: string };

      // Get resources
      const res = await req("GET", `/agents/${agentId}/resources`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        agentId: string;
        layers: { agent: { skills: unknown[] } };
      };
      expect(body.agentId).toBe(agentId);
      expect(body.layers).toBeDefined();
      expect(body.layers.agent).toBeDefined();
      expect(body.layers.agent.skills).toBeDefined();
    });

    it("GET /agents/:id/system-md returns system prompt", async () => {
      const providerRes = await req("POST", "/providers", {
        name: "Test Provider",
        apiType: "anthropic-messages",
      });
      const { id: providerId } = (await providerRes.json()) as { id: string };

      const agentRes = await req("POST", "/agents", {
        name: "Test Agent",
        providerId,
        systemMd: "You are a helpful assistant.",
      });
      const { id: agentId } = (await agentRes.json()) as { id: string };

      const res = await req("GET", `/agents/${agentId}/system-md`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { content: string };
      expect(body.content).toBe("You are a helpful assistant.");
    });

    it("PUT /agents/:id/system-md updates system prompt", async () => {
      const providerRes = await req("POST", "/providers", {
        name: "Test Provider",
        apiType: "anthropic-messages",
      });
      const { id: providerId } = (await providerRes.json()) as { id: string };

      const agentRes = await req("POST", "/agents", {
        name: "Test Agent",
        providerId,
      });
      const { id: agentId } = (await agentRes.json()) as { id: string };

      const res = await req("PUT", `/agents/${agentId}/system-md`, {
        content: "New system prompt",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { content: string };
      expect(body.content).toBe("New system prompt");
    });
  });

  describe("Global resources", () => {
    it("GET /resources/global returns project resources", async () => {
      const res = await req("GET", `/resources/global?cwd=${tmpDir}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        skills: unknown[];
        prompts: unknown[];
        extensions: unknown[];
      };
      expect(body.skills).toBeDefined();
      expect(body.prompts).toBeDefined();
      expect(body.extensions).toBeDefined();
    });
  });

  describe("Session with lastMessagePreview", () => {
    it("GET /sessions includes lastMessagePreview", async () => {
      await req("POST", "/sessions", { cwd: "/tmp", meta: { name: "Test" } });

      const res = await req("GET", "/sessions");
      expect(res.status).toBe(200);
      const list = (await res.json()) as Array<{ lastMessagePreview?: string }>;
      expect(list.length).toBeGreaterThan(0);
      // lastMessagePreview should be present (may be null or string)
      expect(list[0]).toHaveProperty("lastMessagePreview");
    });

    it("GET /sessions/:id includes lastMessagePreview", async () => {
      const createRes = await req("POST", "/sessions", { cwd: "/tmp", meta: { name: "Test" } });
      const { id } = (await createRes.json()) as { id: string };

      const res = await req("GET", `/sessions/${id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { lastMessagePreview?: string };
      expect(body).toHaveProperty("lastMessagePreview");
    });
  });

  describe("Model management", () => {
    it("POST /providers/:id/models creates model", async () => {
      const providerRes = await req("POST", "/providers", {
        name: "Test Provider",
        apiType: "anthropic-messages",
      });
      const { id: providerId } = (await providerRes.json()) as { id: string };

      const res = await req("POST", `/providers/${providerId}/models`, {
        modelId: "test-model",
        name: "Test Model",
        contextWindow: 128000,
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { modelId: string; name: string; contextWindow: number };
      expect(body.modelId).toBe("test-model");
      expect(body.name).toBe("Test Model");
      expect(body.contextWindow).toBe(128000);
    });

    it("PATCH /providers/:id/models/:modelId updates model", async () => {
      const providerRes = await req("POST", "/providers", {
        name: "Test Provider",
        apiType: "anthropic-messages",
      });
      const { id: providerId } = (await providerRes.json()) as { id: string };

      await req("POST", `/providers/${providerId}/models`, {
        modelId: "test-model",
        name: "Test Model",
      });

      const res = await req("PATCH", `/providers/${providerId}/models/test-model`, {
        name: "Updated Model",
        contextWindow: 200000,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { name: string; contextWindow: number };
      expect(body.name).toBe("Updated Model");
      expect(body.contextWindow).toBe(200000);
    });

    it("DELETE /providers/:id/models/:modelId removes model", async () => {
      const providerRes = await req("POST", "/providers", {
        name: "Test Provider",
        apiType: "anthropic-messages",
      });
      const { id: providerId } = (await providerRes.json()) as { id: string };

      await req("POST", `/providers/${providerId}/models`, {
        modelId: "test-model",
        name: "Test Model",
      });

      const res = await req("DELETE", `/providers/${providerId}/models/test-model`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });

    it("DELETE /providers/:id/models/:modelId returns 409 when agent uses model", async () => {
      const providerRes = await req("POST", "/providers", {
        name: "Test Provider",
        apiType: "anthropic-messages",
      });
      const { id: providerId } = (await providerRes.json()) as { id: string };

      await req("POST", `/providers/${providerId}/models`, {
        modelId: "test-model",
        name: "Test Model",
      });

      await req("POST", "/agents", {
        name: "Bound Agent",
        providerId: Number(providerId),
        modelId: "test-model",
      });

      const res = await req("DELETE", `/providers/${providerId}/models/test-model`);
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Bound Agent");
    });
  });

  describe("Session checkpoints", () => {
    it("POST/GET checkpoints and POST rewind", async () => {
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
        message: { role: "user", content: "save", timestamp: Date.now() },
      });

      const createRes = await req("POST", `/sessions/${id}/checkpoints`, { label: "ui-save" });
      expect(createRes.status).toBe(201);
      const checkpoint = (await createRes.json()) as { id: string };

      const listRes = await req("GET", `/sessions/${id}/checkpoints`);
      expect(listRes.status).toBe(200);
      const listed = (await listRes.json()) as {
        checkpoints: Array<{ id: string; label?: string }>;
      };
      expect(listed.checkpoints[0]?.id).toBe(checkpoint.id);
      expect(listed.checkpoints[0]?.label).toBe("ui-save");

      const rewindRes = await req("POST", `/sessions/${id}/rewind`, {
        checkpointId: checkpoint.id,
      });
      expect(rewindRes.status).toBe(200);
    });
  });

  describe("Session tree", () => {
    it("GET /sessions/:id/tree returns tree structure", async () => {
      const parentRes = await req("POST", "/sessions", { cwd: "/tmp" });
      const { id: parentId } = (await parentRes.json()) as { id: string };

      const childRes = await req("POST", "/sessions", { cwd: "/tmp", parentId });
      const { id: childId } = (await childRes.json()) as { id: string };

      const res = await req("GET", `/sessions/${parentId}/tree`);
      expect(res.status).toBe(200);
      const tree = (await res.json()) as { session: { id: string }; children: unknown[] };
      expect(tree.session.id).toBe(parentId);
      expect(tree.children.length).toBeGreaterThan(0);
      expect(JSON.stringify(tree.children)).toContain(childId);
    });
  });
});
