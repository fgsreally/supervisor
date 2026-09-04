import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WecodeDb } from "../src/db.js";
import {
  ensureAgentBuiltinPluginBindings,
  ensureBuiltinPluginResources,
  listEnabledBuiltinPluginSlugs,
} from "../src/plugin/builtin/ensure.js";
import {
  BUILTIN_PLUGINS,
  isBuiltinPluginResource,
} from "../src/plugin/builtin/catalog.js";

let db: WecodeDb;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `builtin-ext-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new WecodeDb(join(tmpDir, "test.db"));
  const providerId = db.insertProvider({
    slug: "test",
    name: "Test",
    protocol: "anthropic-messages",
  });
  db.insertModel({ provider_id: providerId, model_id: "m1", name: "M1" });
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("builtin plugin catalog bindings", () => {
  it("registers builtin resources and keeps builtin slugs active regardless of enabled flag", () => {
    const modelId = db.listModels()[0]!.id;
    ensureBuiltinPluginResources(db);
    for (const spec of BUILTIN_PLUGINS) {
      const resource = db.getResourceByKindSlug("plugin", spec.slug);
      expect(resource).toBeDefined();
      expect(isBuiltinPluginResource(resource!.meta)).toBe(true);
    }

    const agent = db.insertAgent({
      name: "A",
      provider_id: db.listProviders()[0]!.id,
      model_id: modelId,
      tools_preset: "coding",
    });
    ensureAgentBuiltinPluginBindings(db, agent.id);
    const admin = db.getResourceByKindSlug("plugin", "wecode-admin")!;
    expect(db.getAgentResourceBinding(agent.id, admin.id)).toBeUndefined();
    const mcp = db.getResourceByKindSlug("plugin", "mcp")!;
    db.setAgentResourceEnabled(agent.id, mcp.id, false);

    ensureAgentBuiltinPluginBindings(db, agent.id);
    expect(db.getAgentResourceBinding(agent.id, mcp.id)?.enabled).toBe(false);

    const enabled = listEnabledBuiltinPluginSlugs(db, agent.id, { isMainSession: true });
    expect(enabled.has("mcp")).toBe(true);
    expect(enabled.has("skill")).toBe(true);

    const assistant = db.insertAgent({
      name: "WeCode 助手",
      provider_id: db.listProviders()[0]!.id,
      model_id: modelId,
      tools_preset: "coding",
      is_builtin: true,
    });
    ensureAgentBuiltinPluginBindings(db, assistant.id);
    expect(db.getAgentResourceBinding(assistant.id, admin.id)?.enabled).toBe(true);
    expect(
      listEnabledBuiltinPluginSlugs(db, assistant.id, { isMainSession: true }).has(
        "wecode-admin",
      ),
    ).toBe(true);

    const router = db.insertAgent({
      name: "Smart Router",
      model_id: modelId,
      tools_preset: "readonly",
      is_builtin: true,
    });
    ensureAgentBuiltinPluginBindings(db, router.id);
    const routerSlugs = listEnabledBuiltinPluginSlugs(db, router.id, {
      isMainSession: true,
    });
    expect(routerSlugs.has("smart-router")).toBe(false);
    expect(routerSlugs.has("task-management")).toBe(true);
    expect(routerSlugs.has("subagent")).toBe(true);
  });

  it("binds git and service on packaged external agents", () => {
    const agent = db.insertAgent({
      name: "Codex",
      backend_type: "codex",
      tools_preset: "coding",
      is_builtin: true,
    });
    ensureAgentBuiltinPluginBindings(db, agent.id);
    const bound = new Set(
      db
        .listAgentResourceBindings(agent.id, { kind: "plugin", enabledOnly: false })
        .map((binding) => binding.resource?.slug),
    );
    expect(bound.has("git")).toBe(true);
    expect(bound.has("service")).toBe(true);
    expect(bound.has("mcp")).toBe(false);
    expect(bound.has("skill")).toBe(false);
    expect(bound.has("task-management")).toBe(false);

    const enabled = listEnabledBuiltinPluginSlugs(db, agent.id, { isMainSession: true });
    expect([...enabled].sort()).toEqual(["git", "service"]);
  });
});
