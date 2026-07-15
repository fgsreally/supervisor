import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, normalize, resolve, sep } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Context } from "hono";
import { Hono } from "hono";
import {
  assertAgentUserSpawnable,
  getSupervisorAgentsRoot,
  isBuiltinAgent,
} from "../agent/index.js";
import type { ExtensionEvent } from "../extension/index.js";
import type { SessionManager } from "../core/session-manager.js";
import { parseBindResourceBody, parseInstallResourceBody } from "../resources/resource-manager.js";
import { isResourceKind } from "../resources/types.js";
import { readSupervisorSettings, writeSupervisorSettings } from "../utils/supervisor-settings.js";
import type { Model, Provider, SessionStatus } from "../types.js";
import { listWorkspaceFiles } from "./workspace-files.js";

/** Strip apiKey before sending provider to clients. */
function toProviderResponse(p: Provider): Omit<Provider, "apiKey"> & { apiKey: null } {
  return { ...p, apiKey: null };
}

function toModelResponse(m: Model) {
  return {
    providerId: m.providerId,
    modelId: m.modelId,
    name: m.name,
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
    supportsMultimodal: m.supportsMultimodal,
    tags: m.tags,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function jsonError(c: Context, status: 400 | 403 | 404 | 409 | 500 | 501, message: string) {
  return c.json({ error: message }, status);
}

function collectRequestHeaders(c: Context): Record<string, string> {
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

function emitSessionExtensionEvent(
  manager: SessionManager,
  sessionId: number,
  event: ExtensionEvent,
): void {
  try {
    const runtime = manager.getRuntime(sessionId);
    void runtime.extension?.emit(event).catch(() => {});
  } catch {
    // session may not be loaded yet
  }
}

function parseIntegerId(value: string): number | null {
  const id = Number.parseInt(value, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function getAgentMutationError(
  manager: SessionManager,
  agentId: number,
): { status: 403 | 404; message: string } | null {
  const agent = manager.getAgent(agentId);
  if (!agent) return { status: 404, message: "agent not found" };
  if (isBuiltinAgent(agent)) {
    return { status: 403, message: "built-in agents cannot be modified through HTTP" };
  }
  return null;
}

function hasReservedAgentMeta(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return "builtin" in value || "userSpawnable" in value;
}

type PromptImageInput = { mimeType: string; data: string };

function parsePromptImages(value: unknown): PromptImageInput[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const images: PromptImageInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const mimeType = (item as PromptImageInput).mimeType;
    const data = (item as PromptImageInput).data;
    if (
      typeof mimeType !== "string" ||
      typeof data !== "string" ||
      !mimeType.startsWith("image/")
    ) {
      return null;
    }
    images.push({ mimeType, data });
  }
  return images;
}

function parseOptionalSource(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

export function createHttpServer(manager: SessionManager): Hono {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.get("/settings", (c) => c.json(readSupervisorSettings()));

  app.patch("/settings", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(c, 400, "invalid body");
    const patch: Record<string, unknown> = {};
    if (body.utilityProvider !== undefined) {
      if (typeof body.utilityProvider !== "string") {
        return jsonError(c, 400, "utilityProvider must be a string");
      }
      patch.utilityProvider = body.utilityProvider;
    }
    if (body.utilityModelId !== undefined) {
      if (typeof body.utilityModelId !== "string") {
        return jsonError(c, 400, "utilityModelId must be a string");
      }
      patch.utilityModelId = body.utilityModelId;
    }
    return c.json(writeSupervisorSettings(patch));
  });

  // ============ Agent Endpoints ============

  // GET /agents
  app.get("/agents", (c) => {
    return c.json(manager.listAgents());
  });

  // GET /agents/:id
  app.get("/agents/:id", (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid agent id");
    const agent = manager.getAgent(id);
    if (!agent) return jsonError(c, 404, "not found");
    return c.json(agent);
  });

  // POST /agents
  app.post("/agents", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      if (!body.name || typeof body.name !== "string") {
        return jsonError(c, 400, "name is required");
      }
      if (typeof body.providerId !== "number") {
        return jsonError(c, 400, "providerId is required");
      }
      if (hasReservedAgentMeta(body.meta)) {
        return jsonError(c, 400, "builtin and userSpawnable are reserved Agent metadata");
      }
      const agent = manager.insertAgent(
        {
          name: body.name,
          description: body.description,
          provider_id: body.providerId,
          model_id: body.modelId,
          tools_preset: body.toolsPreset,
          home_dir: body.homeDir,
          meta: body.meta,
        },
        { systemMd: body.systemMd },
      );
      return c.json(agent, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  // PATCH /agents/:id
  app.patch("/agents/:id", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid agent id");
      const mutationError = getAgentMutationError(manager, id);
      if (mutationError) return jsonError(c, mutationError.status, mutationError.message);
      if (hasReservedAgentMeta(body.meta)) {
        return jsonError(c, 400, "builtin and userSpawnable are reserved Agent metadata");
      }
      const agent = manager.updateAgent(id, {
        name: body.name,
        description: body.description,
        provider_id: body.providerId,
        model_id: body.modelId,
        tools_preset: body.toolsPreset,
        home_dir: body.homeDir,
        meta: body.meta,
      });
      return c.json(agent);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // GET /agents/:id/resources
  app.get("/agents/:id/resources", async (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid agent id");
      const cwd = c.req.query("cwd") ?? process.cwd();
      return c.json(await manager.resolveAgentResources(id, cwd));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // GET /agents/:id/tools
  app.get("/agents/:id/tools", async (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid agent id");
      const cwd = c.req.query("cwd") ?? process.cwd();
      const tools = await manager.resolveAgentTools(id, cwd);
      return c.json({ agentId: id, tools });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // GET /agents/:id/system-md
  app.get("/agents/:id/system-md", (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid agent id");
      const content = manager.getAgentSystemMd(id);
      return c.json({ content });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // PUT /agents/:id/system-md
  app.put("/agents/:id/system-md", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.content !== "string") {
      return jsonError(c, 400, "content is required");
    }
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid agent id");
      const mutationError = getAgentMutationError(manager, id);
      if (mutationError) return jsonError(c, mutationError.status, mutationError.message);
      const agent = manager.setAgentSystemMd(id, body.content);
      return c.json({ content: agent.systemMd });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // DELETE /agents/:id
  app.delete("/agents/:id", (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid agent id");
    const mutationError = getAgentMutationError(manager, id);
    if (mutationError) return jsonError(c, mutationError.status, mutationError.message);
    manager.deleteAgent(id);
    return c.json({ ok: true });
  });

  // PATCH /agents/:id/meta
  app.patch("/agents/:id/meta", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid agent id");
      const mutationError = getAgentMutationError(manager, id);
      if (mutationError) return jsonError(c, mutationError.status, mutationError.message);
      if (hasReservedAgentMeta(body)) {
        return jsonError(c, 400, "builtin and userSpawnable are reserved Agent metadata");
      }
      const meta = manager.updateAgentMeta(id, body);
      return c.json({ meta });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // ============ Provider Endpoints ============

  // GET /providers
  app.get("/providers", (c) => {
    return c.json(manager.listProviders().map(toProviderResponse));
  });

  // GET /providers/:id
  app.get("/providers/:id", (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return jsonError(c, 400, "invalid provider id");
    const provider = manager.getProvider(id);
    if (!provider) return jsonError(c, 404, "not found");
    return c.json(toProviderResponse(provider));
  });

  // GET /providers/:id/models
  app.get("/providers/:id/models", (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return jsonError(c, 400, "invalid provider id");
    const provider = manager.getProvider(id);
    if (!provider) return jsonError(c, 404, "provider not found");
    return c.json(manager.listModelsByProvider(id).map(toModelResponse));
  });

  // POST /providers/:id/models
  app.post("/providers/:id/models", async (c) => {
    const providerId = parseInt(c.req.param("id"), 10);
    if (isNaN(providerId)) return jsonError(c, 400, "invalid provider id");
    const provider = manager.getProvider(providerId);
    if (!provider) return jsonError(c, 404, "provider not found");

    const body = await c.req.json().catch(() => ({}));
    if (typeof body.modelId !== "string" || !body.modelId.trim()) {
      return jsonError(c, 400, "modelId is required");
    }
    const modelId = body.modelId.trim();
    if (manager.getModel(providerId, modelId)) {
      return jsonError(c, 409, "model already exists");
    }

    const tags =
      Array.isArray(body.tags) && body.tags.every((item: unknown) => typeof item === "string")
        ? body.tags
        : undefined;
    const model = manager.insertModel(providerId, {
      modelId,
      name: typeof body.name === "string" ? body.name.trim() || modelId : modelId,
      contextWindow: typeof body.contextWindow === "number" ? body.contextWindow : undefined,
      maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : undefined,
      supportsMultimodal:
        typeof body.supportsMultimodal === "boolean" ? body.supportsMultimodal : undefined,
      tags,
    });
    return c.json(toModelResponse(model), 201);
  });

  // PATCH /providers/:id/models/:modelId
  app.patch("/providers/:id/models/:modelId", async (c) => {
    const providerId = parseInt(c.req.param("id"), 10);
    if (isNaN(providerId)) return jsonError(c, 400, "invalid provider id");
    const modelId = c.req.param("modelId");
    const provider = manager.getProvider(providerId);
    if (!provider) return jsonError(c, 404, "provider not found");
    if (!manager.getModel(providerId, modelId)) return jsonError(c, 404, "model not found");

    const body = await c.req.json().catch(() => ({}));
    const patch: Parameters<typeof manager.updateModel>[2] = {};
    if (typeof body.name === "string") patch.name = body.name.trim() || modelId;
    if (typeof body.contextWindow === "number") patch.contextWindow = body.contextWindow;
    if (typeof body.maxTokens === "number") patch.maxTokens = body.maxTokens;
    if (typeof body.supportsMultimodal === "boolean")
      patch.supportsMultimodal = body.supportsMultimodal;
    if (Array.isArray(body.tags) && body.tags.every((item: unknown) => typeof item === "string")) {
      patch.tags = body.tags;
    }

    try {
      const model = manager.updateModel(providerId, modelId, patch);
      return c.json(toModelResponse(model));
    } catch (e) {
      return jsonError(c, 404, e instanceof Error ? e.message : "model not found");
    }
  });

  // DELETE /providers/:id/models/:modelId
  app.delete("/providers/:id/models/:modelId", (c) => {
    const providerId = parseInt(c.req.param("id"), 10);
    if (isNaN(providerId)) return jsonError(c, 400, "invalid provider id");
    const modelId = c.req.param("modelId");
    const provider = manager.getProvider(providerId);
    if (!provider) return jsonError(c, 404, "provider not found");
    if (!manager.getModel(providerId, modelId)) return jsonError(c, 404, "model not found");

    try {
      manager.deleteModel(providerId, modelId);
      return c.json({ ok: true });
    } catch (e) {
      return jsonError(c, 404, e instanceof Error ? e.message : "model not found");
    }
  });

  // PATCH /providers/:id — supports { isEnabled, name, apiType, baseUrl }
  app.patch("/providers/:id", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return jsonError(c, 400, "invalid provider id");
    const provider = manager.getProvider(id);
    if (!provider) return jsonError(c, 404, "not found");

    const patch: Parameters<typeof manager.updateProvider>[1] = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.isEnabled === "boolean") patch.is_enabled = body.isEnabled ? 1 : 0;
    if (typeof body.apiType === "string") patch.api_type = body.apiType;
    if (typeof body.baseUrl === "string" || body.baseUrl === null) patch.base_url = body.baseUrl;
    if (typeof body.icon === "string" || body.icon === null) patch.icon = body.icon;

    manager.updateProvider(id, patch);
    const updated = manager.getProvider(id);
    return c.json(toProviderResponse(updated!));
  });

  // POST /providers — create a new provider
  app.post("/providers", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      if (!body.name || typeof body.name !== "string") {
        return jsonError(c, 400, "name is required");
      }
      if (!body.apiType || typeof body.apiType !== "string") {
        return jsonError(c, 400, "apiType is required");
      }
      const provider = manager.insertProvider({
        name: body.name,
        icon: typeof body.icon === "string" ? body.icon : null,
        apiType: body.apiType,
        baseUrl: body.baseUrl,
        apiKey: body.apiKey,
        isEnabled: body.isEnabled,
      });
      return c.json(toProviderResponse(provider), 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  // DELETE /providers/:id — delete a provider and all its models
  app.delete("/providers/:id", (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return jsonError(c, 400, "invalid provider id");
    const provider = manager.getProvider(id);
    if (!provider) return jsonError(c, 404, "not found");
    try {
      manager.deleteProvider(id);
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  // ============ Project Endpoints ============

  app.get("/projects", (c) => {
    return c.json(manager.listProjects());
  });

  app.post("/projects", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.cwd !== "string" || !body.cwd.trim()) {
      return jsonError(c, 400, "cwd is required");
    }
    try {
      const project = manager.createProject({
        cwd: body.cwd,
        name: typeof body.name === "string" ? body.name : undefined,
        meta:
          typeof body.meta === "object" && body.meta !== null
            ? (body.meta as Record<string, unknown>)
            : undefined,
      });
      return c.json(project, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  app.get("/projects/:id", (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid project id");
    const project = manager.getProject(id);
    if (!project) return jsonError(c, 404, "not found");
    return c.json(project);
  });

  app.delete("/projects/:id", (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid project id");
    const project = manager.getProject(id);
    if (!project) return jsonError(c, 404, "not found");
    manager.deleteProject(id);
    return c.json({ ok: true });
  });

  // ============ Session Endpoints ============

  // GET /sessions[?status=&parentId=]
  app.get("/sessions", (c) => {
    const status = c.req.query("status") as SessionStatus | undefined;
    const parentIdParam = c.req.query("parentId");
    const projectIdParam = c.req.query("projectId");
    const parentId =
      parentIdParam === undefined
        ? undefined
        : parentIdParam === "null"
          ? null
          : parseIntegerId(parentIdParam);
    if (parentIdParam !== undefined && parentId === null && parentIdParam !== "null") {
      return jsonError(c, 400, "invalid parent id");
    }
    const projectId = projectIdParam ? parseIntegerId(projectIdParam) : undefined;
    if (projectIdParam && projectId === null) return jsonError(c, 400, "invalid project id");
    const sessions = manager.list({
      ...(status ? { status } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
      ...(projectId !== undefined && projectId !== null ? { projectId } : {}),
    });
    return c.json(
      sessions.map((s) => ({
        ...s,
        lastMessagePreview: manager.getLastMessagePreview(s.id),
      })),
    );
  });

  // GET /sessions/:id
  app.get("/sessions/:id", (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    const session = manager.get(id);
    if (!session) return jsonError(c, 404, "not found");
    return c.json({
      ...session,
      lastMessagePreview: manager.getLastMessagePreview(session.id),
    });
  });

  // GET /sessions/:id/children
  app.get("/sessions/:id/children", (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    return c.json(manager.children(id));
  });

  // GET /messages/search?q=...&sessionId=&role=&limit=
  app.get("/messages/search", (c) => {
    const q = c.req.query("q") ?? "";
    if (!q.trim()) return jsonError(c, 400, "q is required");
    const sessionId = c.req.query("sessionId");
    const parsedSessionId = sessionId ? parseIntegerId(sessionId) : undefined;
    if (sessionId && parsedSessionId === null) return jsonError(c, 400, "invalid session id");
    const role = c.req.query("role");
    const limitRaw = c.req.query("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const hits = manager.searchMessages(q, {
      sessionId: parsedSessionId || undefined,
      role: role || undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return c.json(hits);
  });

  // GET /sessions/:id/messages  — get full conversation history
  app.get("/sessions/:id/messages", async (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const messages = await manager.getSessionMessages(id);
      return c.json(messages);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // POST /sessions  — spawn a new session
  app.post("/sessions", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const parentId =
        body.parentId === undefined || body.parentId === null
          ? undefined
          : typeof body.parentId === "number"
            ? body.parentId
            : parseIntegerId(String(body.parentId));
      if (parentId === null) return jsonError(c, 400, "invalid parent id");
      const agentId =
        body.agentId === undefined || body.agentId === null
          ? null
          : typeof body.agentId === "number"
            ? body.agentId
            : parseIntegerId(String(body.agentId));
      if (agentId === null && body.agentId !== undefined && body.agentId !== null) {
        return jsonError(c, 400, "invalid agent id");
      }
      if (agentId !== null) {
        const agent = manager.getAgent(agentId);
        if (!agent) return jsonError(c, 404, `Agent ${agentId} not found`);
        try {
          assertAgentUserSpawnable(agent, agentId);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          return jsonError(c, 403, message);
        }
      }
      const projectId =
        body.projectId === undefined || body.projectId === null
          ? undefined
          : typeof body.projectId === "number"
            ? body.projectId
            : parseIntegerId(String(body.projectId));
      if (projectId === null) return jsonError(c, 400, "invalid project id");
      const session = await manager.spawn({
        projectId,
        parentId,
        cwd: body.cwd,
        meta: body.meta,
        systemPrompt: body.systemPrompt,
        instructions: body.instructions,
        provider: body.provider,
        model: body.model,
        toolsPreset: body.toolsPreset,
        tools: body.tools,
        agentId,
      });
      return c.json(session, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  // POST /sessions/:id/kill  — send signal to process (kill ≠ delete record)
  app.post("/sessions/:id/kill", async (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      await manager.kill(id);
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // POST /sessions/:id/complete — merge git worktree and mark session finished
  app.post("/sessions/:id/complete", async (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const session = await manager.complete(id);
      return c.json(session);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // POST /sessions/:id/prompt  — send a prompt to session
  app.post("/sessions/:id/prompt", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.message !== "string") {
      return jsonError(c, 400, "invalid body, requires { message: string }");
    }
    const source = parseOptionalSource(body.source);
    if (source === null) return jsonError(c, 400, "source must be a non-empty string");
    const level =
      typeof body.level === "number" && Number.isFinite(body.level) ? body.level : undefined;
    const images = parsePromptImages(body.images);
    if (images === null) {
      return jsonError(c, 400, "invalid images, expected [{ mimeType, data }]");
    }
    const imageContent = images?.map((img) => ({
      type: "image" as const,
      mimeType: img.mimeType,
      data: img.data,
    }));
    const sessionId = parseIntegerId(c.req.param("id"));
    if (sessionId === null) return jsonError(c, 400, "invalid session id");
    const clientId = randomUUID();
    emitSessionExtensionEvent(manager, sessionId, {
      type: "http.request",
      method: "POST",
      path: `/sessions/${sessionId}/prompt`,
      headers: collectRequestHeaders(c),
      clientId,
    });
    const stream = new TransformStream<Uint8Array>();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();
    let ended = false;
    let unsubscribe = () => {};

    const writeSse = async (payload: Record<string, unknown>) => {
      if (ended) return;
      await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    };

    const endStream = async () => {
      if (ended) return;
      ended = true;
      unsubscribe();
      await writer.close().catch(() => {});
    };

    c.req.raw.signal.addEventListener(
      "abort",
      () => {
        void endStream();
      },
      { once: true },
    );

    unsubscribe = manager.onOutput(sessionId, (_id, event) => {
      void writeSse({ type: "event", event }).catch(() => {});
      if (event.type === "agent_end") {
        void writeSse({ type: "done" })
          .catch(() => {})
          .finally(() => {
            void endStream();
          });
      }
    });

    void (async () => {
      try {
        await writeSse({ type: "started", sessionId });
        const disposition = await manager.submitSessionInput(sessionId, {
          message: body.message,
          images: imageContent,
          source,
          level,
        });
        emitSessionExtensionEvent(manager, sessionId, {
          type: "http.response",
          status: 200,
          clientId,
        });
        if (disposition === "queued") {
          await writeSse({ type: "queued", sessionId });
          await endStream();
          return;
        }
        if (!ended) {
          await writeSse({ type: "done" });
          await endStream();
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        emitSessionExtensionEvent(manager, sessionId, {
          type: "http.response",
          status: 409,
          clientId,
        });
        await writeSse({ type: "error", error: message }).catch(() => {});
        await endStream();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });

  // POST /sessions/:id/steer — steer the active turn
  app.post("/sessions/:id/steer", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.message !== "string") {
      return jsonError(c, 400, "invalid body, requires { message: string }");
    }
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      manager.steer(id, body.message);
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // POST /sessions/:id/follow-up — enqueue a follow-up for the active turn
  app.post("/sessions/:id/follow-up", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.message !== "string") {
      return jsonError(c, 400, "invalid body, requires { message: string }");
    }
    const source = parseOptionalSource(body.source);
    if (source === null) return jsonError(c, 400, "source must be a non-empty string");
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      manager.followUp(id, body.message, source);
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // POST /sessions/:id/abort — abort current work without deleting the runtime
  app.post("/sessions/:id/abort", async (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      await manager.abort(id);
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // POST /sessions/:id/compact — compact SQLite-backed conversation context
  app.post("/sessions/:id/compact", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const result = await manager.compact(
        id,
        typeof body.customInstructions === "string" ? body.customInstructions : undefined,
      );
      return c.json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // POST /sessions/:id/checkpoints — create conversation + code checkpoint
  app.post("/sessions/:id/checkpoints", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const checkpoint = await manager.createCheckpoint(id, {
        label: typeof body.label === "string" ? body.label : undefined,
      });
      return c.json(checkpoint, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // GET /sessions/:id/checkpoints — list checkpoints
  app.get("/sessions/:id/checkpoints", (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      return c.json({ checkpoints: manager.listCheckpoints(id) });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // POST /sessions/:id/rewind — rewind to checkpoint (code + conversation leaf)
  app.post("/sessions/:id/rewind", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.checkpointId !== "string") {
      return jsonError(c, 400, "invalid body, requires { checkpointId: string }");
    }
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const session = await manager.rewindToCheckpoint(id, body.checkpointId);
      return c.json(session);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // POST /sessions/:id/commit — explicit git commit (not tied to conversation turns)
  app.post("/sessions/:id/commit", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const result = await manager.commitSession(id, {
        message: typeof body.message === "string" ? body.message : undefined,
      });
      return c.json({ commit: result });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // POST /sessions/:id/model — switch model for a running session
  app.post("/sessions/:id/model", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.provider !== "string" ||
      typeof body.modelId !== "string"
    ) {
      return jsonError(c, 400, "invalid body, requires { provider: string, modelId: string }");
    }
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      await manager.setModel(id, body.provider, body.modelId);
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // POST /sessions/:id/thinking-level — switch thinking level for a running session
  app.post("/sessions/:id/thinking-level", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.level !== "string") {
      return jsonError(c, 400, "invalid body, requires { level: string }");
    }
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      await manager.setThinkingLevel(id, body.level as ThinkingLevel);
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // GET /sessions/:id/state — coding-agent-like headless state snapshot
  app.get("/sessions/:id/state", async (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      return c.json(await manager.getState(id));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // GET /sessions/:id/commands — dynamic slash commands (skills + prompt templates)
  app.get("/sessions/:id/commands", async (c) => {
    try {
      const sessionId = parseIntegerId(c.req.param("id"));
      if (sessionId === null) return jsonError(c, 400, "invalid session id");
      const runtime = manager.getRuntime(sessionId);
      return c.json(runtime.getSlashCommands());
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // GET /sessions/:id/events — SSE stream of agent + supervisor events
  app.get("/sessions/:id/events", async (c) => {
    const sessionId = parseIntegerId(c.req.param("id"));
    if (sessionId === null) return jsonError(c, 400, "invalid session id");
    const clientId = randomUUID();
    emitSessionExtensionEvent(manager, sessionId, {
      type: "ws.connect",
      clientId,
      clientInfo: {
        ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "",
        userAgent: c.req.header("user-agent") ?? undefined,
      },
    });
    const stream = new TransformStream<Uint8Array>();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();
    let closed = false;

    const write = async (payload: Record<string, unknown>) => {
      if (closed) return;
      await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    };

    const close = async () => {
      if (closed) return;
      closed = true;
      await writer.close().catch(() => {});
    };

    c.req.raw.signal.addEventListener("abort", () => void close(), { once: true });

    const unsubOutput = manager.onOutput(sessionId, (_id, event) => {
      void write({ type: "agent", event });
    });

    void write({ type: "connected", sessionId });

    c.req.raw.signal.addEventListener(
      "abort",
      () => {
        unsubOutput();
        emitSessionExtensionEvent(manager, sessionId, {
          type: "ws.disconnect",
          clientId,
          reason: "abort",
        });
      },
      { once: true },
    );

    return new Response(stream.readable, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  });

  // POST /sessions/:id/send  — deprecated RPC passthrough
  app.post("/sessions/:id/send", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(c, 400, "invalid body");
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      await manager.send(id, body);
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // PATCH /sessions/:id/meta
  app.patch("/sessions/:id/meta", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(c, 400, "invalid body");
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      return c.json(manager.updateMeta(id, body));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // PUT /sessions/:id/meta  — replace meta entirely
  app.put("/sessions/:id/meta", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(c, 400, "invalid body");
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    manager.setMeta(id, body);
    return c.json({ ok: true });
  });

  // PATCH /sessions/:id/messages/:messageId/meta — merge message meta
  app.patch("/sessions/:id/messages/:messageId/meta", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(c, 400, "invalid body");
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const meta = manager.updateMessageMeta(id, c.req.param("messageId"), body);
      return c.json({ meta });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // DELETE /sessions/:id  — delete DB record only, does NOT kill the process
  app.delete("/sessions/:id", (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    manager.delete(id);
    return c.json({ ok: true });
  });

  // POST /sessions/:id/fork — fork session from a message
  app.post("/sessions/:id/fork", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const session = await manager.fork(id, body.entryId, {
        label: body.label,
        customInstructions: body.customInstructions,
      });
      return c.json(session, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // GET /sessions/:id/tree — get session tree
  app.get("/sessions/:id/tree", (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      return c.json(manager.getTree(id));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // POST /sessions/:id/clone — clone session
  app.post("/sessions/:id/clone", async (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const session = await manager.clone(id);
      return c.json(session, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // ============ File Endpoints ============

  // GET /workspace/files?cwd=<path> — list files for @ autocomplete
  app.get("/workspace/files", (c) => {
    const cwd = c.req.query("cwd");
    if (!cwd) return jsonError(c, 400, "cwd is required");
    const resolved = resolve(cwd);
    if (!isAbsolute(resolved)) return jsonError(c, 400, "cwd must be absolute");
    try {
      return c.json({ files: listWorkspaceFiles(resolved) });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  // GET /files/content?path=<path>  — read file; only ~/.pi/ and supervisor agent homes are allowed
  app.get("/files/content", async (c) => {
    const raw = c.req.query("path");
    if (!raw) return jsonError(c, 400, "path is required");

    // Expand ~ shorthand
    const expanded = raw.startsWith("~/") || raw === "~" ? `${homedir()}${raw.slice(1)}` : raw;

    // Must be absolute after expansion
    if (!isAbsolute(expanded)) return jsonError(c, 400, "path must be absolute or start with ~");

    const normalized = normalize(resolve(expanded));

    // Whitelist: supervisor agent homes only
    const allowedRoots = [normalize(getSupervisorAgentsRoot())];
    const allowed = allowedRoots.some(
      (root) => normalized === root || normalized.startsWith(root + sep),
    );
    if (!allowed) return jsonError(c, 403, "path is outside allowed directories");

    try {
      const content = await readFile(normalized, "utf-8");
      return c.json({ path: normalized, content });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // POST /sessions/:id/ask-answer — resolve pending ask tool
  app.post("/sessions/:id/ask-answer", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const toolCallId = body.toolCallId;
    const answers = body.answers;
    if (!toolCallId || typeof toolCallId !== "string") {
      return jsonError(c, 400, "toolCallId is required");
    }
    if (!Array.isArray(answers)) {
      return jsonError(c, 400, "answers must be an array");
    }
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const ok = manager.submitAskAnswer(id, toolCallId, answers);
      if (!ok) return jsonError(c, 404, "No pending ask for this tool call");
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 400, message);
    }
  });

  // POST /sessions/:id/approval-resolve — resolve pending extension UI approval
  app.post("/sessions/:id/approval-resolve", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const approvalId = body.approvalId;
    const result = body.result;
    if (!approvalId || typeof approvalId !== "string") {
      return jsonError(c, 400, "approvalId is required");
    }
    if (!result || typeof result !== "object" || typeof result.action !== "string") {
      return jsonError(c, 400, "result.action is required");
    }
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const ok = manager.submitApprovalResolution(id, approvalId, result);
      if (!ok) return jsonError(c, 404, "No pending approval for this id");
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 400, message);
    }
  });

  // GET /resources/global — global catalog (~/.pi/supervisor/global/)
  app.get("/resources/global", (c) => {
    try {
      return c.json(manager.resolveGlobalResources());
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  // GET /resources — resource catalog from database
  app.get("/resources", (c) => {
    try {
      const kind = c.req.query("kind");
      const resources =
        kind && isResourceKind(kind)
          ? manager.resources.listResources(kind)
          : manager.resources.listResources();
      return c.json(resources);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  // POST /resources/install — install resource into global catalog (optionally bind to agent)
  app.post("/resources/install", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const input = parseInstallResourceBody(body as Record<string, unknown>);
      const agentId =
        typeof body.agentId === "number"
          ? body.agentId
          : body.agentId !== undefined
            ? parseIntegerId(String(body.agentId))
            : null;
      if (agentId !== null && !Number.isFinite(agentId)) {
        return jsonError(c, 400, "invalid agentId");
      }
      if (agentId !== null) {
        const mutationError = getAgentMutationError(manager, agentId);
        if (mutationError) return jsonError(c, mutationError.status, mutationError.message);
        const result = await manager.resources.installAndBind({
          ...input,
          agentId,
          priority: typeof body.priority === "number" ? body.priority : undefined,
        });
        return c.json(result, 201);
      }
      const result = await manager.resources.installResource(input);
      return c.json(result, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 400, message);
    }
  });

  // POST /resources/uninstall — remove resource from global catalog
  app.post("/resources/uninstall", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const kind = body.kind;
    const slug = body.slug;
    if (typeof kind !== "string" || typeof slug !== "string") {
      return jsonError(c, 400, "kind and slug are required");
    }
    if (!isResourceKind(kind)) {
      return jsonError(c, 400, "invalid kind");
    }
    try {
      await manager.resources.uninstallResource(kind, slug);
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 400, message);
    }
  });

  // GET /agents/:id/resource-bindings — DB bindings for an agent
  app.get("/agents/:id/resource-bindings", (c) => {
    try {
      const agentId = parseIntegerId(c.req.param("id"));
      if (agentId === null) return jsonError(c, 400, "invalid agent id");
      const kind = c.req.query("kind");
      const bindings = manager.resources.listAgentBindings(
        agentId,
        kind && isResourceKind(kind) ? kind : undefined,
      );
      return c.json(bindings);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  // POST /agents/:id/resources — bind a catalog resource to an agent
  app.post("/agents/:id/resources", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const agentId = parseIntegerId(c.req.param("id"));
      if (agentId === null) return jsonError(c, 400, "invalid agent id");
      const mutationError = getAgentMutationError(manager, agentId);
      if (mutationError) return jsonError(c, mutationError.status, mutationError.message);
      const binding = manager.resources.bindResource(
        parseBindResourceBody(agentId, body as Record<string, unknown>),
      );
      return c.json({ ok: true, binding });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 400, message);
    }
  });

  // DELETE /agents/:id/resources/:resourceId — remove an agent resource binding
  app.delete("/agents/:id/resources/:resourceId", async (c) => {
    try {
      const agentId = parseIntegerId(c.req.param("id"));
      const resourceId = parseIntegerId(c.req.param("resourceId"));
      if (agentId === null || resourceId === null) {
        return jsonError(c, 400, "invalid agent id or resource id");
      }
      const mutationError = getAgentMutationError(manager, agentId);
      if (mutationError) return jsonError(c, mutationError.status, mutationError.message);
      await manager.resources.unbindResource({ agentId, resourceId });
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 400, message);
    }
  });

  // ============ Extension Management (global catalog) ============

  // GET /extensions — list extensions from resource catalog
  app.get("/extensions", (c) => {
    try {
      return c.json(manager.resources.listResources("extension"));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  // POST /extensions/install — install extension from source
  app.post("/extensions/install", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const source = body.source;
    if (!source || typeof source !== "string") {
      return jsonError(c, 400, "source is required (npm:<spec>, git:<url>, or local path)");
    }
    try {
      const result = await manager.resources.installResource({ kind: "extension", source });
      return c.json(result, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 400, message);
    }
  });

  // POST /extensions/:id/update — re-fetch from package.json repository
  app.post("/extensions/:id/update", async (c) => {
    const id = c.req.param("id");
    try {
      const result = await manager.resources.updateResource("extension", id);
      return c.json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 400, message);
    }
  });

  // POST /extensions/:id/uninstall
  app.post("/extensions/:id/uninstall", async (c) => {
    const id = c.req.param("id");
    try {
      await manager.resources.uninstallResource("extension", id);
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 400, message);
    }
  });

  // POST /upload/icons — upload provider icon
  app.post("/upload/icons", async (c) => {
    try {
      const body = await c.req.formData();
      const file = body.get("file") as File;
      if (!file) {
        return jsonError(c, 400, "file is required");
      }

      const agentHome = getSupervisorAgentsRoot();
      const iconsDir = join(agentHome, "icons");
      mkdirSync(iconsDir, { recursive: true });

      const ext = file.name.split(".").pop() || "png";
      const filename = `${randomUUID()}.${ext}`;
      const filepath = join(iconsDir, filename);

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      writeFileSync(filepath, buffer);

      return c.json({ path: `/icons/${filename}` });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  return app;
}
