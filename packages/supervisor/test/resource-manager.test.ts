import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promptResourceHandler } from "../src/agent/prompt-resource.js";
import { SupervisorDb } from "../src/db.js";
import { indexResourceHandlers } from "../src/resources/handler.js";
import { ResourceManager } from "../src/resources/resource-manager.js";

let db: SupervisorDb;
let manager: ResourceManager;
let tmpDir: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;

beforeEach(() => {
  tmpDir = join(tmpdir(), `supervisor-resource-svc-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpDir;
  process.env.USERPROFILE = tmpDir;
  db = new SupervisorDb(join(tmpDir, "test.db"));
  manager = new ResourceManager({
    db,
    handlers: indexResourceHandlers([promptResourceHandler]),
    ensureCatalog: async () => {},
  });
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
});

describe("ResourceManager", () => {
  it("installs prompt, binds to agent, and uninstalls when unbound", async () => {
    const providerId = db.insertProvider({
      slug: "test",
      name: "Test",
      api_type: "openai",
    });
    const agent = db.insertAgent({
      name: "A",
      provider_id: providerId,
      model_id: "m",
    });

    const promptSrc = join(tmpDir, "hello.md");
    writeFileSync(promptSrc, "# Hello\n", "utf8");

    const installed = await manager.installResource({ kind: "prompt", source: promptSrc });
    expect(installed.resource.kind).toBe("prompt");
    expect(installed.resource.slug).toBe("hello");
    expect(existsSync(installed.resource.sourcePath!)).toBe(true);

    const binding = manager.bindResource({
      agentId: agent.id,
      kind: "prompt",
      slug: "hello",
    });
    expect(binding.agentId).toBe(agent.id);
    expect(binding.resourceId).toBe(installed.resource.id);

    const bindings = manager.listAgentBindings(agent.id, "prompt");
    expect(bindings).toHaveLength(1);

    await manager.unbindResource({ agentId: agent.id, resourceId: installed.resource.id });
    await manager.uninstallResource("prompt", "hello");
    expect(db.getResourceByKindSlug("prompt", "hello")).toBeUndefined();
  });

  it("refuses uninstall when resource is still bound", async () => {
    const providerId = db.insertProvider({
      slug: "test2",
      name: "Test",
      api_type: "openai",
    });
    const agent = db.insertAgent({
      name: "B",
      provider_id: providerId,
      model_id: "m",
    });
    const promptSrc = join(tmpDir, "bound.md");
    writeFileSync(promptSrc, "# Bound\n", "utf8");
    const installed = await manager.installResource({ kind: "prompt", source: promptSrc });
    manager.bindResource({ agentId: agent.id, resourceId: installed.resource.id });
    await expect(manager.uninstallResource("prompt", "bound")).rejects.toThrow(/still bound/);
  });

  it("deactivates an extension after it is unbound from an agent", async () => {
    const providerId = db.insertProvider({
      slug: "extension-test",
      name: "Extension Test",
      api_type: "openai",
    });
    const agent = db.insertAgent({ name: "Agent", provider_id: providerId });
    const extension = db.upsertResource({
      kind: "extension",
      slug: "test-extension",
      source_path: null,
    });
    const deactivated: Array<[number, string]> = [];
    const extensionManager = new ResourceManager({
      db,
      handlers: indexResourceHandlers([
        {
          kind: "extension",
          discover: () => [],
          onUnbind: async (agentId, slug) => {
            deactivated.push([agentId, slug]);
          },
        },
      ]),
      ensureCatalog: async () => {},
    });
    extensionManager.bindResource({ agentId: agent.id, resourceId: extension.id });

    await extensionManager.unbindResource({ agentId: agent.id, resourceId: extension.id });

    expect(deactivated).toEqual([[agent.id, "test-extension"]]);
  });
});
