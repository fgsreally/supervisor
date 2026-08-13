import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SupervisorDb } from "../src/db.js";
import {
  ensureAgentBuiltinExtensionBindings,
  ensureBuiltinExtensionResources,
  listEnabledBuiltinExtensionSlugs,
} from "../src/extension/builtin/ensure.js";
import {
  BUILTIN_EXTENSIONS,
  isBuiltinExtensionResource,
} from "../src/extension/builtin/catalog.js";

let db: SupervisorDb;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `builtin-ext-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new SupervisorDb(join(tmpDir, "test.db"));
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

describe("builtin extension catalog bindings", () => {
  it("registers builtin resources and keeps builtin slugs active regardless of enabled flag", () => {
    const modelId = db.listModels()[0]!.id;
    ensureBuiltinExtensionResources(db);
    for (const spec of BUILTIN_EXTENSIONS) {
      const resource = db.getResourceByKindSlug("extension", spec.slug);
      expect(resource).toBeDefined();
      expect(isBuiltinExtensionResource(resource!.meta)).toBe(true);
    }

    const agent = db.insertAgent({
      name: "A",
      provider_id: db.listProviders()[0]!.id,
      model_id: modelId,
      tools_preset: "coding",
    });
    ensureAgentBuiltinExtensionBindings(db, agent.id);
    const admin = db.getResourceByKindSlug("extension", "supervisor-admin")!;
    expect(db.getAgentResourceBinding(agent.id, admin.id)).toBeUndefined();
    const mcp = db.getResourceByKindSlug("extension", "mcp")!;
    db.setAgentResourceEnabled(agent.id, mcp.id, false);

    ensureAgentBuiltinExtensionBindings(db, agent.id);
    expect(db.getAgentResourceBinding(agent.id, mcp.id)?.enabled).toBe(false);

    const enabled = listEnabledBuiltinExtensionSlugs(db, agent.id, { isMainSession: true });
    expect(enabled.has("mcp")).toBe(true);
    expect(enabled.has("skill")).toBe(true);

    const assistant = db.insertAgent({
      name: "Pi 助手",
      provider_id: db.listProviders()[0]!.id,
      model_id: modelId,
      tools_preset: "coding",
      is_builtin: true,
    });
    ensureAgentBuiltinExtensionBindings(db, assistant.id);
    expect(db.getAgentResourceBinding(assistant.id, admin.id)?.enabled).toBe(true);
    expect(
      listEnabledBuiltinExtensionSlugs(db, assistant.id, { isMainSession: true }).has(
        "supervisor-admin",
      ),
    ).toBe(true);

    const router = db.insertAgent({
      name: "Smart Router",
      model_id: modelId,
      tools_preset: "readonly",
      is_builtin: true,
    });
    ensureAgentBuiltinExtensionBindings(db, router.id);
    const routerSlugs = listEnabledBuiltinExtensionSlugs(db, router.id, {
      isMainSession: true,
    });
    expect(routerSlugs.has("smart-router")).toBe(false);
    expect(routerSlugs.has("task-management")).toBe(true);
    expect(routerSlugs.has("subagent")).toBe(true);
  });

  it("binds only git and project-services on packaged external agents", () => {
    const agent = db.insertAgent({
      name: "Codex",
      backend_type: "codex",
      tools_preset: "coding",
      is_builtin: true,
    });
    ensureAgentBuiltinExtensionBindings(db, agent.id);
    const bound = new Set(
      db
        .listAgentResourceBindings(agent.id, { kind: "extension", enabledOnly: false })
        .map((binding) => binding.resource?.slug),
    );
    expect(bound.has("session-git-worktree")).toBe(true);
    expect(bound.has("project-services")).toBe(true);
    expect(bound.has("mcp")).toBe(false);
    expect(bound.has("skill")).toBe(false);
    expect(bound.has("task-management")).toBe(false);

    const enabled = listEnabledBuiltinExtensionSlugs(db, agent.id, { isMainSession: true });
    expect([...enabled].sort()).toEqual(["project-services", "session-git-worktree"]);
  });
});
