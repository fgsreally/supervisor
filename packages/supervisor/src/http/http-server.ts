import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFile, realpath } from "node:fs/promises";
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
import { getProjectDir, getSessionDir } from "../core/session-files.js";
import { activeTaskPaths, readTaskArtifact } from "../core/task-artifacts.js";
import { parseSessionTodos } from "../core/session-todos.js";
import {
  parseBindResourceBody,
  parseInstallResourceBody,
  parseUpsertResourceContentBody,
} from "../resources/resource-manager.js";
import { isResourceKind } from "../resources/types.js";
import {
  isFeatureModelRef,
  isUtilityFeature,
  readSupervisorSettings,
  writeSupervisorSettings,
} from "../utils/supervisor-settings.js";
import { ensureSupervisorPublicDir } from "../utils/supervisor-home.js";
import { encryptApiKey } from "../utils/encrypt.js";
import { decryptApiKey } from "../utils/encrypt.js";
import { testApiKey, type ApiKeyProvider } from "../utils/test-api-key.js";
import { resolveApiKey } from "../tools/web/credentials.js";
import { gitPull, gitPush, listWorktreeCommits } from "../utils/git.js";
import {
  listDailyWorkRecords,
  runDailyWorkAnalysis,
  yesterdayDayKey,
} from "../core/daily-work.js";
import {
  HOME_TASK_PRIORITIES,
  HOME_TASK_STATUSES,
  type HomeTask,
  type HomeTaskPriority,
  type HomeTaskStatus,
  type Model,
  type Provider,
  type SessionStatus,
} from "../types.js";
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

const ASSET_CONTENT_TYPES: Record<string, string> = {
  webm: "video/webm",
  mp4: "video/mp4",
  mov: "video/quicktime",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
};

function assetContentType(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  return ASSET_CONTENT_TYPES[extension] ?? "application/octet-stream";
}

async function readOwnedAsset(root: string, relativePath: string): Promise<Uint8Array | null> {
  if (!relativePath || relativePath.includes("\0") || isAbsolute(relativePath)) return null;
  const rootPath = await realpath(root).catch(() => null);
  const candidate = await realpath(resolve(root, relativePath)).catch(() => null);
  if (!rootPath || !candidate) return null;
  if (candidate !== rootPath && !candidate.startsWith(`${rootPath}${sep}`)) return null;
  return readFile(candidate).catch(() => null);
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
  options?: { allowExternalBuiltinConfig?: boolean },
): { status: 403 | 404; message: string } | null {
  const agent = manager.getAgent(agentId);
  if (!agent) return { status: 404, message: "agent not found" };
  if (
    isBuiltinAgent(agent) &&
    !(options?.allowExternalBuiltinConfig && agent.backendType !== "native")
  ) {
    return { status: 403, message: "built-in agents cannot be modified through HTTP" };
  }
  return null;
}

function hasReservedAgentMeta(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return "builtin" in value || "userSpawnable" in value;
}

function hasAgentManagedTaskMeta(value: Record<string, unknown>): boolean {
  return (
    Object.hasOwn(value, "tasks") ||
    Object.hasOwn(value, "currentTask") ||
    Object.hasOwn(value, "todos")
  );
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

function toHomeTaskResponse(task: HomeTask) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    projectId: task.projectId,
    status: task.status,
    priority: task.priority,
    parentId: task.parentId,
    sessionId: task.sessionId,
    error: task.error,
    meta: task.meta,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function createHttpServer(manager: SessionManager): Hono {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true }));

  // ============ Home ============

  app.get("/home/daily-work", (c) => {
    const from = c.req.query("from") || undefined;
    const to = c.req.query("to") || undefined;
    const limitRaw = c.req.query("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    return c.json(
      listDailyWorkRecords({
        from,
        to,
        limit: Number.isFinite(limit) ? limit : undefined,
      }),
    );
  });

  app.post("/home/daily-work/run", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const dayKey =
      typeof body?.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day)
        ? body.day
        : yesterdayDayKey();
    try {
      const record = await runDailyWorkAnalysis(manager.database, dayKey);
      return c.json(record);
    } catch (error: unknown) {
      return jsonError(c, 500, error instanceof Error ? error.message : String(error));
    }
  });

  app.get("/home/tasks", (c) => {
    const parentRaw = c.req.query("parentId");
    const projectRaw = c.req.query("projectId");
    const parentId =
      parentRaw === "null" || parentRaw === ""
        ? null
        : parentRaw
          ? Number.parseInt(parentRaw, 10)
          : undefined;
    const projectId = projectRaw ? Number.parseInt(projectRaw, 10) : undefined;
    if (parentId !== undefined && parentId !== null && !Number.isFinite(parentId)) {
      return jsonError(c, 400, "invalid parentId");
    }
    if (projectId !== undefined && !Number.isFinite(projectId)) {
      return jsonError(c, 400, "invalid projectId");
    }
    const tasks = manager.listHomeTasks({
      ...(parentId !== undefined ? { parentId } : {}),
      ...(projectId !== undefined ? { projectId } : {}),
    });
    return c.json(tasks.map(toHomeTaskResponse));
  });

  app.post("/home/tasks", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.title !== "string" || !body.title.trim()) {
      return jsonError(c, 400, "title is required");
    }
    const priority =
      typeof body.priority === "string" &&
      (HOME_TASK_PRIORITIES as readonly string[]).includes(body.priority)
        ? (body.priority as HomeTaskPriority)
        : "normal";
    const status =
      typeof body.status === "string" &&
      (HOME_TASK_STATUSES as readonly string[]).includes(body.status)
        ? (body.status as HomeTaskStatus)
        : "todo";
    try {
      const task = manager.createHomeTask({
        title: body.title,
        description: typeof body.description === "string" ? body.description : "",
        projectId:
          body.projectId === null || body.projectId === undefined
            ? null
            : Number(body.projectId),
        priority,
        status,
        meta: body.meta && typeof body.meta === "object" ? body.meta : undefined,
      });
      return c.json(toHomeTaskResponse(task), 201);
    } catch (error: unknown) {
      return jsonError(c, 400, error instanceof Error ? error.message : String(error));
    }
  });

  app.patch("/home/tasks/:id", async (c) => {
    const id = Number.parseInt(c.req.param("id"), 10);
    if (!Number.isFinite(id)) return jsonError(c, 400, "invalid task id");
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(c, 400, "invalid body");
    try {
      const patch: Record<string, unknown> = {};
      if (typeof body.title === "string") patch.title = body.title;
      if (typeof body.description === "string") patch.description = body.description;
      if (body.projectId === null) patch.projectId = null;
      else if (body.projectId !== undefined) patch.projectId = Number(body.projectId);
      if (
        typeof body.status === "string" &&
        (HOME_TASK_STATUSES as readonly string[]).includes(body.status)
      ) {
        patch.status = body.status;
      }
      if (
        typeof body.priority === "string" &&
        (HOME_TASK_PRIORITIES as readonly string[]).includes(body.priority)
      ) {
        patch.priority = body.priority;
      }
      if (body.error === null || typeof body.error === "string") patch.error = body.error;
      if (body.meta && typeof body.meta === "object") patch.meta = body.meta;
      const task = manager.updateHomeTask(id, patch as never);
      return c.json(toHomeTaskResponse(task));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonError(c, message.includes("not found") ? 404 : 400, message);
    }
  });

  app.delete("/home/tasks/:id", (c) => {
    const id = Number.parseInt(c.req.param("id"), 10);
    if (!Number.isFinite(id)) return jsonError(c, 400, "invalid task id");
    if (!manager.deleteHomeTask(id)) return jsonError(c, 404, "not found");
    return c.json({ ok: true });
  });

  app.post("/home/tasks/:id/decompose", async (c) => {
    const id = Number.parseInt(c.req.param("id"), 10);
    if (!Number.isFinite(id)) return jsonError(c, 400, "invalid task id");
    try {
      const result = await manager.decomposeHomeTask(id);
      return c.json({
        task: toHomeTaskResponse(result.task),
        children: result.children.map(toHomeTaskResponse),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("not found")
        ? 404
        : message.includes("未配置")
          ? 400
          : 409;
      return jsonError(c, status, message);
    }
  });

  app.get("/settings", (c) => {
    const settings = readSupervisorSettings();
    const {
      tavilyApiKeyEncrypted: _tavily,
      braveApiKeyEncrypted: _brave,
      serperApiKeyEncrypted: _serper,
      firecrawlApiKeyEncrypted: _firecrawl,
      speechApiKeyEncrypted,
      doubaoSpeechApiKeyEncrypted,
      ...safeSettings
    } = settings;
    return c.json({
      ...safeSettings,
      tavilyApiKeyConfigured: Boolean(
        _tavily || process.env[safeSettings.tavilyApiKeyEnv ?? "TAVILY_API_KEY"],
      ),
      braveApiKeyConfigured: Boolean(
        _brave || process.env[safeSettings.braveApiKeyEnv ?? "BRAVE_API_KEY"],
      ),
      serperApiKeyConfigured: Boolean(
        _serper || process.env[safeSettings.serperApiKeyEnv ?? "SERPER_API_KEY"],
      ),
      firecrawlApiKeyConfigured: Boolean(
        _firecrawl || process.env[safeSettings.firecrawlApiKeyEnv ?? "FIRECRAWL_API_KEY"],
      ),
      speechApiKeyConfigured: Boolean(speechApiKeyEncrypted),
      doubaoSpeechApiKeyConfigured: Boolean(doubaoSpeechApiKeyEncrypted),
    });
  });

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
    if (body.featureModels !== undefined) {
      if (
        !body.featureModels ||
        typeof body.featureModels !== "object" ||
        Array.isArray(body.featureModels)
      ) {
        return jsonError(c, 400, "featureModels must be an object");
      }
      const next: Record<string, { providerId: number; modelId: string }> = {};
      for (const [feature, value] of Object.entries(body.featureModels as Record<string, unknown>)) {
        if (!isUtilityFeature(feature)) {
          return jsonError(c, 400, `unknown utility feature: ${feature}`);
        }
        if (value === null || value === undefined) continue;
        if (!isFeatureModelRef(value)) {
          return jsonError(
            c,
            400,
            `featureModels.${feature} must be { providerId, modelId } or null`,
          );
        }
        const provider = manager.getProvider(value.providerId);
        if (!provider) {
          return jsonError(c, 400, `provider ${value.providerId} not found for ${feature}`);
        }
        if (!manager.getModel(value.providerId, value.modelId.trim())) {
          return jsonError(
            c,
            400,
            `model ${value.modelId} not found for provider ${value.providerId}`,
          );
        }
        next[feature] = { providerId: value.providerId, modelId: value.modelId.trim() };
      }
      patch.featureModels = next;
    }
    if (body.browserMode !== undefined) {
      if (body.browserMode !== "headless" && body.browserMode !== "headed") {
        return jsonError(c, 400, "browserMode must be headless or headed");
      }
      patch.browserMode = body.browserMode;
    }
    if (body.webSearchProvider !== undefined) {
      if (
        !["duckduckgo", "tavily", "brave", "serper", "firecrawl"].includes(body.webSearchProvider)
      ) {
        return jsonError(c, 400, "invalid webSearchProvider");
      }
      patch.webSearchProvider = body.webSearchProvider;
    }
    if (body.webFetchProvider !== undefined) {
      if (
        !["native", "tavily", "firecrawl", "native-then-tavily", "native-then-firecrawl"].includes(
          body.webFetchProvider,
        )
      ) {
        return jsonError(c, 400, "invalid webFetchProvider");
      }
      patch.webFetchProvider = body.webFetchProvider;
    }
    if (body.tavilyApiKeyEnv !== undefined) {
      if (
        typeof body.tavilyApiKeyEnv !== "string" ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(body.tavilyApiKeyEnv)
      ) {
        return jsonError(c, 400, "tavilyApiKeyEnv must be an environment variable name");
      }
      patch.tavilyApiKeyEnv = body.tavilyApiKeyEnv;
    }
    for (const field of ["braveApiKeyEnv", "serperApiKeyEnv", "firecrawlApiKeyEnv"] as const) {
      if (body[field] === undefined) continue;
      if (typeof body[field] !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(body[field])) {
        return jsonError(c, 400, `${field} must be an environment variable name`);
      }
      patch[field] = body[field];
    }
    for (const [bodyField, savedField] of [
      ["tavilyApiKey", "tavilyApiKeyEncrypted"],
      ["braveApiKey", "braveApiKeyEncrypted"],
      ["serperApiKey", "serperApiKeyEncrypted"],
      ["firecrawlApiKey", "firecrawlApiKeyEncrypted"],
    ] as const) {
      if (body[bodyField] === undefined) continue;
      if (typeof body[bodyField] !== "string") {
        return jsonError(c, 400, `${bodyField} must be a string`);
      }
      patch[savedField] = body[bodyField] ? encryptApiKey(body[bodyField]) : undefined;
    }
    if (body.speechRecognitionMode !== undefined) {
      if (!["browser", "qwen", "doubao"].includes(body.speechRecognitionMode)) {
        return jsonError(c, 400, "invalid speechRecognitionMode");
      }
      patch.speechRecognitionMode = body.speechRecognitionMode;
    }
    if (body.speechRecognitionLanguage !== undefined) {
      if (
        typeof body.speechRecognitionLanguage !== "string" ||
        body.speechRecognitionLanguage.length > 32
      ) {
        return jsonError(c, 400, "invalid speechRecognitionLanguage");
      }
      patch.speechRecognitionLanguage = body.speechRecognitionLanguage;
    }
    if (body.speechApiKey !== undefined) {
      if (typeof body.speechApiKey !== "string")
        return jsonError(c, 400, "speechApiKey must be a string");
      patch.speechApiKeyEncrypted = body.speechApiKey
        ? encryptApiKey(body.speechApiKey)
        : undefined;
    }
    if (body.doubaoSpeechApiKey !== undefined) {
      if (typeof body.doubaoSpeechApiKey !== "string") {
        return jsonError(c, 400, "doubaoSpeechApiKey must be a string");
      }
      patch.doubaoSpeechApiKeyEncrypted = body.doubaoSpeechApiKey
        ? encryptApiKey(body.doubaoSpeechApiKey)
        : undefined;
    }
    if (body.doubaoSpeechResourceId !== undefined) {
      if (
        typeof body.doubaoSpeechResourceId !== "string" ||
        body.doubaoSpeechResourceId.length > 128
      ) {
        return jsonError(c, 400, "invalid doubaoSpeechResourceId");
      }
      patch.doubaoSpeechResourceId = body.doubaoSpeechResourceId;
    }
    const saved = writeSupervisorSettings(patch);
    const {
      tavilyApiKeyEncrypted,
      braveApiKeyEncrypted,
      serperApiKeyEncrypted,
      firecrawlApiKeyEncrypted,
      speechApiKeyEncrypted,
      doubaoSpeechApiKeyEncrypted,
      ...safeSaved
    } = saved;
    return c.json({
      ...safeSaved,
      tavilyApiKeyConfigured: Boolean(
        tavilyApiKeyEncrypted || process.env[safeSaved.tavilyApiKeyEnv ?? "TAVILY_API_KEY"],
      ),
      braveApiKeyConfigured: Boolean(
        braveApiKeyEncrypted || process.env[safeSaved.braveApiKeyEnv ?? "BRAVE_API_KEY"],
      ),
      serperApiKeyConfigured: Boolean(
        serperApiKeyEncrypted || process.env[safeSaved.serperApiKeyEnv ?? "SERPER_API_KEY"],
      ),
      firecrawlApiKeyConfigured: Boolean(
        firecrawlApiKeyEncrypted ||
        process.env[safeSaved.firecrawlApiKeyEnv ?? "FIRECRAWL_API_KEY"],
      ),
      speechApiKeyConfigured: Boolean(speechApiKeyEncrypted),
      doubaoSpeechApiKeyConfigured: Boolean(doubaoSpeechApiKeyEncrypted),
    });
  });

  app.post("/settings/test-api-key", async (c) => {
    const body = await c.req.json().catch(() => null);
    const providers: ApiKeyProvider[] = [
      "qwen",
      "doubao",
      "tavily",
      "brave",
      "serper",
      "firecrawl",
    ];
    if (!body || !providers.includes(body.provider)) return jsonError(c, 400, "invalid provider");
    const settings = readSupervisorSettings();
    try {
      let apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      if (!apiKey && body.provider === "qwen" && settings.speechApiKeyEncrypted) {
        apiKey = decryptApiKey(settings.speechApiKeyEncrypted);
      } else if (!apiKey && body.provider === "doubao" && settings.doubaoSpeechApiKeyEncrypted) {
        apiKey = decryptApiKey(settings.doubaoSpeechApiKeyEncrypted);
      } else if (!apiKey && !["qwen", "doubao"].includes(body.provider)) {
        const name = body.provider as "tavily" | "brave" | "serper" | "firecrawl";
        const envNames = {
          tavily: settings.tavilyApiKeyEnv ?? "TAVILY_API_KEY",
          brave: settings.braveApiKeyEnv ?? "BRAVE_API_KEY",
          serper: settings.serperApiKeyEnv ?? "SERPER_API_KEY",
          firecrawl: settings.firecrawlApiKeyEnv ?? "FIRECRAWL_API_KEY",
        };
        const encrypted = {
          tavily: settings.tavilyApiKeyEncrypted,
          brave: settings.braveApiKeyEncrypted,
          serper: settings.serperApiKeyEncrypted,
          firecrawl: settings.firecrawlApiKeyEncrypted,
        };
        apiKey = resolveApiKey(name, envNames[name], encrypted[name]);
      }
      if (!apiKey) return jsonError(c, 409, "API key is not configured");
      await testApiKey(body.provider, apiKey, { resourceId: settings.doubaoSpeechResourceId });
      return c.json({ ok: true });
    } catch (error) {
      return jsonError(c, 409, error instanceof Error ? error.message : String(error));
    }
  });

  // ============ Agent Endpoints ============

  // GET /agents
  app.get("/agents", (c) => {
    return c.json(manager.listAgents());
  });

  app.post("/agents/detect", (c) => c.json(manager.detectExternalAgents()));

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
      const backendType =
        body.backendType === "codex" ||
        body.backendType === "claude" ||
        body.backendType === "kimi" ||
        body.backendType === "acp"
          ? body.backendType
          : "native";
      const legacyExternal = body.meta?.external as Record<string, unknown> | undefined;
      if (
        backendType === "acp" &&
        typeof body.meta?.command !== "string" &&
        typeof legacyExternal?.command !== "string"
      ) {
        return jsonError(c, 400, "meta.command is required for ACP agents");
      }
      if (hasReservedAgentMeta(body.meta)) {
        return jsonError(c, 400, "builtin and userSpawnable are reserved Agent metadata");
      }
      const agent = manager.insertAgent(
        {
          name: body.name,
          description: body.description,
          icon: body.icon,
          provider_id: backendType === "native" ? body.providerId : null,
          backend_type: backendType,
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
      const mutationError = getAgentMutationError(manager, id, {
        allowExternalBuiltinConfig: true,
      });
      if (mutationError) return jsonError(c, mutationError.status, mutationError.message);
      if (hasReservedAgentMeta(body.meta)) {
        return jsonError(c, 400, "builtin and userSpawnable are reserved Agent metadata");
      }
      const current = manager.getAgent(id);
      const agent = manager.updateAgent(id, {
        name: body.name,
        description: body.description,
        icon: body.icon,
        provider_id: body.providerId,
        model_id: body.modelId,
        tools_preset: body.toolsPreset,
        home_dir: body.homeDir,
        meta:
          body.meta && current
            ? { ...current.meta, ...(body.meta as Record<string, unknown>) }
            : undefined,
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

  // PUT /agents/:id/system-md — allowed for built-in agents (prompt customization)
  app.put("/agents/:id/system-md", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.content !== "string") {
      return jsonError(c, 400, "content is required");
    }
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid agent id");
      const agent = manager.getAgent(id);
      if (!agent) return jsonError(c, 404, "agent not found");
      const updated = manager.setAgentSystemMd(id, body.content);
      return c.json({ content: updated.systemMd });
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
      const message = e instanceof Error ? e.message : "model not found";
      if (message.includes("is in use by agent")) {
        return jsonError(c, 409, message);
      }
      return jsonError(c, 404, message);
    }
  });

  // PATCH /providers/:id — supports provider configuration updates.
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
    if (typeof body.apiKey === "string" || body.apiKey === null) patch.api_key = body.apiKey;

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

  app.patch("/projects/:id", async (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid project id");
    if (!manager.getProject(id)) return jsonError(c, 404, "not found");
    const body = await c.req.json().catch(() => ({}));
    const patch: { name?: string; meta?: Record<string, unknown> } = {};
    if (typeof body.name === "string") {
      if (!body.name.trim()) return jsonError(c, 400, "name cannot be empty");
      patch.name = body.name.trim();
    }
    if (typeof body.meta === "object" && body.meta !== null) {
      patch.meta = body.meta as Record<string, unknown>;
    }
    if (patch.name === undefined && patch.meta === undefined) {
      return jsonError(c, 400, "name or meta is required");
    }
    try {
      return c.json(manager.updateProject(id, patch));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  app.delete("/projects/:id", (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid project id");
    const project = manager.getProject(id);
    if (!project) return jsonError(c, 404, "not found");
    manager.deleteProject(id);
    return c.json({ ok: true });
  });

  app.post("/projects/:id/git/pull", async (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid project id");
    const project = manager.getProject(id);
    if (!project) return jsonError(c, 404, "not found");
    try {
      return c.json(await gitPull(project.cwd));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  app.post("/projects/:id/git/push", async (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid project id");
    const project = manager.getProject(id);
    if (!project) return jsonError(c, 404, "not found");
    try {
      return c.json(await gitPush(project.cwd));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
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

  app.get("/sessions/:id/recordings/:filename", async (c) => {
    const id = Number(c.req.param("id"));
    const filename = c.req.param("filename");
    if (!Number.isFinite(id) || !/^[A-Za-z0-9._-]+\.webm$/.test(filename)) {
      return jsonError(c, 404, "recording not found");
    }
    const session = manager.get(id);
    if (!session) return jsonError(c, 404, "session not found");
    if (session.projectId == null) return jsonError(c, 404, "session project not found");
    try {
      const content = await readFile(
        join(getSessionDir(session.projectId, session.id), "recordings", filename),
      );
      return new Response(content, {
        headers: { "Content-Type": "video/webm", "Cache-Control": "no-store" },
      });
    } catch {
      return jsonError(c, 404, "recording not found");
    }
  });

  // Assets referenced by message.meta.assets. The session determines which owned roots are visible.
  app.get("/sessions/:id/assets/:scope/*", async (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    const session = manager.get(id);
    if (!session) return jsonError(c, 404, "session not found");

    const scope = c.req.param("scope");
    let root: string | null = null;
    if (scope === "session" && session.projectId != null) {
      root = getSessionDir(session.projectId, session.id);
    } else if (scope === "project" && session.projectId != null) {
      root = getProjectDir(session.projectId);
    } else if (scope === "agent" && session.agentId != null) {
      const agent = manager.getAgent(session.agentId);
      root = agent?.homeDir ?? join(getSupervisorAgentsRoot(), String(session.agentId));
    }
    if (!root) return jsonError(c, 404, "asset scope not found");

    const relativePath = c.req.param("*");
    const content = await readOwnedAsset(root, relativePath);
    if (!content) return jsonError(c, 404, "asset not found");
    return new Response(content, {
      headers: {
        "Content-Type": assetContentType(relativePath),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(relativePath.split("/").at(-1) ?? "asset")}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  app.get("/sessions/:id/tasks", async (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    const session = manager.get(id);
    if (!session || session.projectId == null) return jsonError(c, 404, "session not found");
    const artifacts = await Promise.all(
      activeTaskPaths(session.meta).map((path) =>
        readTaskArtifact(getSessionDir(session.projectId!, session.id), path),
      ),
    );
    return c.json(artifacts.filter((artifact) => artifact !== null));
  });

  app.get("/sessions/:id/todos", (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    const session = manager.get(id);
    if (!session) return jsonError(c, 404, "session not found");
    return c.json(parseSessionTodos(session.meta.todos));
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

  // GET /external-sessions — discover recent Codex and Claude Code conversations.
  app.get("/external-sessions", async (c) => {
    try {
      const rawLimit = Number(c.req.query("limit") ?? 40);
      const limit = Number.isFinite(rawLimit) ? rawLimit : 40;
      return c.json(await manager.listImportableExternalSessions(limit));
    } catch (error: unknown) {
      return jsonError(c, 500, error instanceof Error ? error.message : String(error));
    }
  });

  // POST /external-sessions/import — import history and resume in a new worktree.
  app.post("/external-sessions/import", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (
      !body ||
      (body.backend !== "codex" && body.backend !== "claude") ||
      typeof body.externalSessionId !== "string" ||
      !body.externalSessionId
    ) {
      return jsonError(c, 400, "invalid external session import request");
    }
    try {
      const session = await manager.importExternalSession({
        backend: body.backend,
        externalSessionId: body.externalSessionId,
      });
      return c.json(session, 201);
    } catch (error: unknown) {
      return jsonError(c, 409, error instanceof Error ? error.message : String(error));
    }
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
    if (
      body.meta &&
      typeof body.meta === "object" &&
      hasAgentManagedTaskMeta(body.meta as Record<string, unknown>)
    ) {
      return jsonError(c, 403, "tasks, currentTask, and todos are managed by the Agent");
    }
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
      const images = parsePromptImages(body.images);
      if (images === null) {
        return jsonError(c, 400, "invalid images, expected [{ mimeType, data }]");
      }
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      await manager.steer(id, body.message, images);
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
    const images = parsePromptImages(body.images);
    if (images === null) {
      return jsonError(c, 400, "invalid images, expected [{ mimeType, data }]");
    }
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const disposition = await manager.submitSessionInput(id, {
        message: body.message,
        source,
        images,
      });
      return c.json({ ok: true, disposition });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // GET /sessions/:id/queued-inputs — list inputs waiting for their turn
  app.get("/sessions/:id/queued-inputs", (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      return c.json(manager.listSessionInputs(id));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // Unified execution records and schedules for the Session Job popover.
  app.get("/sessions/:id/jobs", (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    const session = manager.get(id);
    if (!session) return jsonError(c, 404, `Session ${id} not found`);
    const schedules = manager.jobs.listSchedules(id);
    const legacySchedules =
      schedules.length === 0 && Array.isArray(session.meta?.timers)
        ? session.meta.timers.flatMap((value, index) => {
            if (!value || typeof value !== "object") return [];
            const timer = value as Record<string, unknown>;
            if (typeof timer.prompt !== "string" || typeof timer.nextFireAt !== "number") return [];
            const createdAt =
              typeof timer.createdAt === "number" ? timer.createdAt : timer.nextFireAt;
            return [
              {
                id: typeof timer.id === "string" ? timer.id : `legacy-timer-${index}`,
                sessionId: id,
                kind: "timer",
                name: "timer.fire",
                label: timer.prompt.split("\n")[0]!.slice(0, 120),
                prompt: timer.prompt,
                nextRunAt: timer.nextFireAt,
                ...(typeof timer.intervalMs === "number" ? { intervalMs: timer.intervalMs } : {}),
                metadata: { legacy: true },
                createdAt,
                updatedAt: createdAt,
              },
            ];
          })
        : [];
    return c.json({
      jobs: manager.jobs.list(id, { limit: 50 }),
      schedules: schedules.length ? schedules : legacySchedules,
    });
  });

  app.post("/sessions/:id/jobs/:jobId/input", async (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    const job = manager.jobs.get(c.req.param("jobId"));
    if (!job || job.sessionId !== id) return jsonError(c, 404, "Job not found");
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.input !== "string" || !body.input) {
      return jsonError(c, 400, "input is required");
    }
    try {
      await manager.jobs.input(job.id, body.input);
      return c.json({ ok: true });
    } catch (error) {
      return jsonError(c, 409, error instanceof Error ? error.message : String(error));
    }
  });

  app.delete("/sessions/:id/jobs/:jobId", async (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    const job = manager.jobs.get(c.req.param("jobId"));
    if (!job || job.sessionId !== id) return jsonError(c, 404, "Job not found");
    return c.json({ job: await manager.jobs.cancel(job.id) });
  });

  // Compatibility aliases for clients that still use the PersistentBash endpoints.
  app.get("/sessions/:id/bash-sessions", (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    if (!manager.get(id)) return jsonError(c, 404, `Session ${id} not found`);
    const sessions = manager.jobs.list(id, { kind: "shell" }).map((job) => ({
      id: job.id,
      sessionId: job.sessionId,
      command: typeof job.metadata.command === "string" ? job.metadata.command : "",
      label: job.label,
      cwd: typeof job.metadata.cwd === "string" ? job.metadata.cwd : "",
      pid: job.metadata.pid,
      status:
        job.status === "succeeded" ? "exited" : job.status === "cancelled" ? "exited" : job.status,
      startedAt: job.startedAt ?? job.createdAt,
      endedAt: job.finishedAt,
      exitCode: job.metadata.exitCode,
      output: job.output,
    }));
    return c.json({ sessions });
  });

  app.post("/sessions/:id/bash-sessions/:bashId/input", async (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.input !== "string" || !body.input) {
      return jsonError(c, 400, "input is required");
    }
    try {
      await manager.jobs.input(c.req.param("bashId"), body.input);
      return c.json({ ok: true });
    } catch (error) {
      return jsonError(c, 404, error instanceof Error ? error.message : String(error));
    }
  });

  app.delete("/sessions/:id/bash-sessions/:bashId", async (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    try {
      const job = manager.jobs.get(c.req.param("bashId"));
      if (!job || job.sessionId !== id) return jsonError(c, 404, "Bash Job not found");
      await manager.jobs.cancel(job.id);
      return c.json({ ok: true });
    } catch (error) {
      return jsonError(c, 404, error instanceof Error ? error.message : String(error));
    }
  });

  // POST /sessions/:id/abort — abort current work without deleting the runtime
  app.post("/sessions/:id/abort", async (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const body = await c.req.json().catch(() => ({}));
      const result = await manager.abort(id, {
        retractIfNoAssistant: body?.retractIfNoAssistant === true,
      });
      return c.json({ ok: true, ...result });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  // POST /sessions/:id/retry — retry after LLM failure (clears error card and continues)
  app.post("/sessions/:id/retry", async (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      return c.json(await manager.retryAfterLlmError(id));
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
    if (
      !body ||
      typeof body !== "object" ||
      (typeof body.checkpointId !== "string" && typeof body.entryId !== "string")
    ) {
      return jsonError(c, 400, "invalid body, requires { checkpointId } or { entryId }");
    }
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const session =
        typeof body.entryId === "string"
          ? await manager.rewindToEntry(id, body.entryId)
          : await manager.rewindToCheckpoint(id, body.checkpointId);
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

  app.get("/sessions/:id/commits", async (c) => {
    const sessionId = parseIntegerId(c.req.param("id"));
    if (sessionId === null) return jsonError(c, 400, "invalid session id");
    const session = manager.get(sessionId);
    if (!session) return jsonError(c, 404, "session not found");
    return c.json(await listWorktreeCommits(session.cwd));
  });

  app.get("/sessions/:id/members", (c) => {
    const sessionId = parseIntegerId(c.req.param("id"));
    if (sessionId === null) return jsonError(c, 400, "invalid session id");
    return c.json(manager.listMembers(sessionId));
  });

  app.put("/sessions/:id/members", async (c) => {
    const sessionId = parseIntegerId(c.req.param("id"));
    if (sessionId === null) return jsonError(c, 400, "invalid session id");
    const body = await c.req.json().catch(() => null);
    const shadowAgentId = body?.shadowAgentId == null ? null : Number(body.shadowAgentId);
    const spawnedAgentIds = Array.isArray(body?.spawnedAgentIds)
      ? body.spawnedAgentIds.map(Number).filter(Number.isInteger)
      : [];
    if (shadowAgentId !== null && !Number.isInteger(shadowAgentId)) {
      return jsonError(c, 400, "invalid shadowAgentId");
    }
    try {
      return c.json(manager.replaceSessionAgentMembers(sessionId, shadowAgentId, spawnedAgentIds));
    } catch (error) {
      return jsonError(c, 404, error instanceof Error ? error.message : String(error));
    }
  });

  app.get("/sessions/:id/eval-state", async (c) => {
    const sessionId = parseIntegerId(c.req.param("id"));
    if (sessionId === null) return jsonError(c, 400, "invalid session id");
    const session = manager.get(sessionId);
    if (!session?.projectId) return jsonError(c, 404, "session not found");
    try {
      const content = await readFile(
        join(getSessionDir(session.projectId, session.id), "eval", "state.json"),
        "utf8",
      );
      return c.json(JSON.parse(content));
    } catch {
      return c.json({ kernels: [], history: [] });
    }
  });

  // GET /sessions/:id/commands — dynamic slash commands (skills + prompt templates)
  app.get("/sessions/:id/commands", async (c) => {
    try {
      const sessionId = parseIntegerId(c.req.param("id"));
      if (sessionId === null) return jsonError(c, 400, "invalid session id");
      if (!manager.get(sessionId)) return jsonError(c, 404, "not found");
      let commands: ReturnType<SessionManager["listTaskSlashCommands"]> = [];
      try {
        const runtime = await manager.ensureRuntime(sessionId);
        commands = runtime.getSlashCommands();
      } catch {
        // Idle/external/unrestorable sessions still expose builtin task commands.
      }
      return c.json(manager.mergeSessionSlashCommands(commands));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 409, message);
    }
  });

  app.post("/sessions/:id/commands", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.command !== "string" || !body.command.trim()) {
      return jsonError(c, 400, "invalid body, requires { command: string, argument?: string }");
    }
    try {
      const sessionId = parseIntegerId(c.req.param("id"));
      if (sessionId === null) return jsonError(c, 400, "invalid session id");
      if (!manager.get(sessionId)) return jsonError(c, 404, "not found");
      const command = body.command.trim().replace(/^\//, "").toLowerCase();
      const argument = typeof body.argument === "string" ? body.argument.trim() : "";

      let runtimeCommands: ReturnType<SessionManager["listTaskSlashCommands"]> = [];
      let runtime: Awaited<ReturnType<SessionManager["ensureRuntime"]>> | null = null;
      try {
        runtime = await manager.ensureRuntime(sessionId);
        runtimeCommands = runtime.getSlashCommands();
      } catch {
        runtime = null;
      }

      const available = manager
        .mergeSessionSlashCommands(runtimeCommands)
        .find((item) => item.name.toLowerCase() === command);
      if (!available) return jsonError(c, 404, `slash command /${command} not found`);
      if (available.arguments?.type === "text" && available.arguments.required && !argument) {
        return jsonError(c, 400, `slash command /${command} requires an argument`);
      }

      const runtimeHasCommand = runtimeCommands.some(
        (item) => item.name.replace(/^\//, "").toLowerCase() === command,
      );
      if (runtime?.executeSlashCommand && runtimeHasCommand) {
        await runtime.executeSlashCommand(available.name, argument);
        return c.json({ ok: true });
      }
      if (command === "goal" || command === "plan") {
        await manager.executeTaskSlashCommand(sessionId, command, argument);
        return c.json({ ok: true });
      }
      return jsonError(c, 409, "slash commands are not executable");
    } catch (e: unknown) {
      return jsonError(c, 409, e instanceof Error ? e.message : String(e));
    }
  });

  app.get("/sessions/:id/external/codex/models", async (c) => {
    try {
      const sessionId = parseIntegerId(c.req.param("id"));
      if (sessionId === null) return jsonError(c, 400, "invalid session id");
      return c.json(await manager.listCodexModels(sessionId));
    } catch (e: unknown) {
      return jsonError(c, 409, e instanceof Error ? e.message : String(e));
    }
  });

  app.post("/sessions/:id/external/codex/settings", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.model !== "string" || !body.model.trim()) {
      return jsonError(c, 400, "invalid body, requires { model: string, effort?: string }");
    }
    try {
      const sessionId = parseIntegerId(c.req.param("id"));
      if (sessionId === null) return jsonError(c, 400, "invalid session id");
      await manager.updateCodexSettings(sessionId, {
        model: body.model,
        effort: typeof body.effort === "string" ? body.effort : undefined,
      });
      return c.json({ ok: true });
    } catch (e: unknown) {
      return jsonError(c, 409, e instanceof Error ? e.message : String(e));
    }
  });

  app.post("/sessions/:id/external/codex/commands", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.command !== "string" || !body.command.trim()) {
      return jsonError(c, 400, "invalid body, requires { command: string, argument?: string }");
    }
    try {
      const sessionId = parseIntegerId(c.req.param("id"));
      if (sessionId === null) return jsonError(c, 400, "invalid session id");
      return c.json(
        await manager.executeCodexCommand(
          sessionId,
          body.command.trim().toLowerCase(),
          typeof body.argument === "string" && body.argument.trim()
            ? body.argument.trim()
            : undefined,
        ),
      );
    } catch (e: unknown) {
      return jsonError(c, 409, e instanceof Error ? e.message : String(e));
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
    if (hasAgentManagedTaskMeta(body)) {
      return jsonError(c, 403, "tasks, currentTask, and todos are managed by the Agent");
    }
    if (Object.hasOwn(body, "workflow")) {
      return jsonError(c, 403, "workflow is managed by the workflow API");
    }
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      return c.json(manager.updateMeta(id, body));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // POST /sessions/:id/read — mark all messages read and clear unread badge
  app.post("/sessions/:id/read", (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      return c.json(manager.markSessionRead(id));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  // PUT /sessions/:id/meta  — replace meta entirely
  app.put("/sessions/:id/meta", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(c, 400, "invalid body");
    if (hasAgentManagedTaskMeta(body)) {
      return jsonError(c, 403, "tasks, currentTask, and todos are managed by the Agent");
    }
    if (Object.hasOwn(body, "workflow")) {
      return jsonError(c, 403, "workflow is managed by the workflow API");
    }
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    const session = manager.get(id);
    if (!session) return jsonError(c, 404, "session not found");
    const nextMeta = { ...body };
    if (Object.hasOwn(session.meta, "tasks")) nextMeta.tasks = session.meta.tasks;
    if (Object.hasOwn(session.meta, "currentTask")) nextMeta.currentTask = session.meta.currentTask;
    if (Object.hasOwn(session.meta, "todos")) nextMeta.todos = session.meta.todos;
    if (Object.hasOwn(session.meta, "workflow")) nextMeta.workflow = session.meta.workflow;
    manager.setMeta(id, nextMeta);
    return c.json({ ok: true });
  });

  app.get("/sessions/:id/workflow", (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      return c.json({ workflow: manager.getWorkflow(id) });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
  });

  app.patch("/sessions/:id/workflow", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(c, 400, "invalid body");
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      const workflow = await manager.setWorkflow(id, body);
      return c.json({ workflow });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 400, message);
    }
  });

  app.delete("/sessions/:id/workflow", async (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      await manager.clearWorkflow(id);
      return c.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
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

  // POST /sessions/:id/btw - create a hidden child with a frozen parent context
  app.post("/sessions/:id/btw", (c) => {
    try {
      const id = parseIntegerId(c.req.param("id"));
      if (id === null) return jsonError(c, 400, "invalid session id");
      return c.json(manager.createBtw(id), 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 404, message);
    }
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

  // POST /sessions/:id/external-interactions/:interactionId/respond
  app.post("/sessions/:id/external-interactions/:interactionId/respond", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const action = body.action;
    if (!["approve", "approve_session", "deny", "cancel", "answer"].includes(action)) {
      return jsonError(c, 400, "invalid interaction action");
    }
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    const ok = manager.submitExternalInteraction(id, c.req.param("interactionId"), {
      action,
      answers: body.answers,
      optionId: body.optionId,
    });
    if (!ok) return jsonError(c, 404, "No pending external interaction for this id");
    return c.json({ ok: true });
  });

  // Internal callback used by external CLI permission bridges.
  app.post("/sessions/:id/external-interactions/request", async (c) => {
    const id = parseIntegerId(c.req.param("id"));
    if (id === null) return jsonError(c, 400, "invalid session id");
    const body = await c.req.json().catch(() => ({}));
    if (body.kind !== "approval" && body.kind !== "question") {
      return jsonError(c, 400, "invalid interaction kind");
    }
    try {
      const response = await manager.requestExternalInteraction(id, {
        backend: typeof body.backend === "string" ? body.backend : "external",
        kind: body.kind,
        title: typeof body.title === "string" ? body.title : "外部 Agent 请求交互",
        detail: typeof body.detail === "string" ? body.detail : undefined,
        request: body.request,
        questions: Array.isArray(body.questions) ? body.questions : undefined,
        options: Array.isArray(body.options) ? body.options : undefined,
      });
      return c.json(response);
    } catch (error) {
      return jsonError(c, 409, error instanceof Error ? error.message : String(error));
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
      return c.json(resources.filter((item) => item.meta?.builtin !== true));
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

  // PUT /resources/content — create or overwrite prompt/mcp content in the global catalog
  app.put("/resources/content", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const input = parseUpsertResourceContentBody(body as Record<string, unknown>);
      if (input.kind !== "prompt" && input.kind !== "mcp") {
        return jsonError(c, 400, "only prompt and mcp content can be edited in the UI");
      }
      const result = await manager.resources.upsertResourceContent(input);
      return c.json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 400, message);
    }
  });

  // GET /skills/search — proxy skills.sh registry search
  app.get("/skills/search", async (c) => {
    const q = c.req.query("q") ?? "";
    const owner = c.req.query("owner") ?? undefined;
    const limitRaw = c.req.query("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
    try {
      const { searchSkillsSh } = await import("../resources/skills-sh.js");
      const result = await searchSkillsSh(q, {
        owner,
        limit: Number.isFinite(limit) ? limit : 20,
      });
      return c.json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 502, message);
    }
  });

  // GET /agents/:id/resource-bindings — DB bindings for an agent
  app.get("/agents/:id/resource-bindings", (c) => {
    try {
      const agentId = parseIntegerId(c.req.param("id"));
      if (agentId === null) return jsonError(c, 400, "invalid agent id");
      const kind = c.req.query("kind");
      const includeDisabled = c.req.query("includeDisabled") === "1" || c.req.query("all") === "1";
      const bindings = manager.resources.listAgentBindings(
        agentId,
        kind && isResourceKind(kind) ? kind : undefined,
        { enabledOnly: !includeDisabled },
      );
      return c.json(bindings);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  // GET /agents/:id/extensions — builtins + user extensions with enabled flags
  app.get("/agents/:id/extensions", (c) => {
    const agentId = parseIntegerId(c.req.param("id"));
    if (agentId === null) return jsonError(c, 400, "invalid agent id");
    try {
      return c.json(manager.listAgentExtensions(agentId));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, message.includes("not found") ? 404 : 500, message);
    }
  });

  // PATCH /agents/:id/extensions/:resourceId — enable/disable (allowed for built-in agents)
  app.patch("/agents/:id/extensions/:resourceId", async (c) => {
    const agentId = parseIntegerId(c.req.param("id"));
    const resourceId = parseIntegerId(c.req.param("resourceId"));
    if (agentId === null || resourceId === null) {
      return jsonError(c, 400, "invalid agent id or resource id");
    }
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof (body as { enabled?: unknown }).enabled !== "boolean") {
      return jsonError(c, 400, "enabled boolean required");
    }
    try {
      if (!manager.getAgent(agentId)) return jsonError(c, 404, "agent not found");
      const binding = manager.setAgentExtensionEnabled(
        agentId,
        resourceId,
        (body as { enabled: boolean }).enabled,
      );
      return c.json({ ok: true, binding });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 400, message);
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

  // GET /extensions — list extensions from resource catalog (exclude shipped builtins)
  app.get("/extensions", (c) => {
    try {
      const all = manager.resources.listResources("extension");
      return c.json(all.filter((item) => item.meta?.builtin !== true));
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

  // POST /upload/public — upload a file into ~/.pi/supervisor/public (avatars, etc.)
  // GET /public/* — static file serving (Express-style)
  app.get("/public/*", async (c) => {
    const wildcard = c.req.param("*") ?? "";
    if (!wildcard || wildcard.includes("\0") || wildcard.includes("..")) {
      return jsonError(c, 404, "file not found");
    }
    try {
      const root = ensureSupervisorPublicDir();
      const content = await readOwnedAsset(root, wildcard);
      if (!content) return jsonError(c, 404, "file not found");
      return new Response(content, {
        headers: {
          "Content-Type": assetContentType(wildcard),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return jsonError(c, 404, "file not found");
    }
  });

  app.post("/upload/public", async (c) => {
    try {
      const body = await c.req.formData();
      const file = body.get("file") as File | null;
      if (!file) return jsonError(c, 400, "file is required");

      const allowedTypes: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/svg+xml": "svg",
      };
      const ext = allowedTypes[file.type];
      if (!ext) return jsonError(c, 400, "unsupported image type");
      if (file.size > 2 * 1024 * 1024) return jsonError(c, 400, "file must not exceed 2 MB");

      const publicDir = ensureSupervisorPublicDir();
      const filename = `${randomUUID()}.${ext}`;
      const filepath = join(publicDir, filename);
      writeFileSync(filepath, Buffer.from(await file.arrayBuffer()));
      return c.json({ path: `/public/${filename}` });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  // Legacy icon routes — store under public/, still accept /uploaded-icons URLs
  app.get("/uploaded-icons/:filename", async (c) => {
    const filename = c.req.param("filename");
    const match = filename.match(/^[0-9a-f-]+\.(png|jpe?g|webp|gif|svg)$/i);
    if (!match) return jsonError(c, 404, "icon not found");
    try {
      const publicFile = join(ensureSupervisorPublicDir(), filename);
      const legacyFile = join(getSupervisorAgentsRoot(), "icons", filename);
      let content: Buffer;
      try {
        content = await readFile(publicFile);
      } catch {
        content = await readFile(legacyFile);
      }
      const contentTypes: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
        svg: "image/svg+xml",
      };
      return new Response(content, {
        headers: {
          "Content-Type": contentTypes[match[1].toLowerCase()] ?? "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return jsonError(c, 404, "icon not found");
    }
  });

  app.post("/upload/icons", async (c) => {
    try {
      const body = await c.req.formData();
      const file = body.get("file") as File;
      if (!file) {
        return jsonError(c, 400, "file is required");
      }

      const allowedTypes: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/svg+xml": "svg",
      };
      const ext = allowedTypes[file.type];
      if (!ext) return jsonError(c, 400, "unsupported image type");
      if (file.size > 2 * 1024 * 1024) return jsonError(c, 400, "icon must not exceed 2 MB");

      const publicDir = ensureSupervisorPublicDir();
      const filename = `${randomUUID()}.${ext}`;
      const filepath = join(publicDir, filename);

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      writeFileSync(filepath, buffer);

      return c.json({ path: `/public/${filename}` });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(c, 500, message);
    }
  });

  return app;
}
