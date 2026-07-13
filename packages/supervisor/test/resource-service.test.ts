import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SupervisorDb } from "../src/db.js";
import { ExtensionModuleRegistry } from "../src/resources/extension-registry.js";
import { ResourceService } from "../src/resources/resource-service.js";
import { ensureGlobalResourceDirs } from "../src/agent/agent-paths.js";

let db: SupervisorDb;
let service: ResourceService;
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
  ensureGlobalResourceDirs();
  db = new SupervisorDb(join(tmpDir, "test.db"));
  const registry = new ExtensionModuleRegistry();
  service = new ResourceService({
    db,
    extensionRegistry: registry,
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

describe("ResourceService", () => {
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

    const installed = await service.installResource({ kind: "prompt", source: promptSrc });
    expect(installed.resource.kind).toBe("prompt");
    expect(installed.resource.slug).toBe("hello");
    expect(existsSync(installed.resource.sourcePath!)).toBe(true);

    const binding = service.bindResource({
      agentId: agent.id,
      kind: "prompt",
      slug: "hello",
    });
    expect(binding.agentId).toBe(agent.id);
    expect(binding.resourceId).toBe(installed.resource.id);

    const bindings = service.listAgentBindings(agent.id, "prompt");
    expect(bindings).toHaveLength(1);

    service.unbindResource({ agentId: agent.id, resourceId: installed.resource.id });
    await service.uninstallResource("prompt", "hello");
    expect(db.getResourceByKindSlug("prompt", "hello")).toBeUndefined();
  });

  it("registerTool creates DB-only resource", () => {
    const tool = service.registerTool("read", { name: "Read" });
    expect(tool.kind).toBe("tool");
    expect(tool.slug).toBe("read");
    expect(tool.sourcePath).toBeNull();
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
    const installed = await service.installResource({ kind: "prompt", source: promptSrc });
    service.bindResource({ agentId: agent.id, resourceId: installed.resource.id });
    await expect(service.uninstallResource("prompt", "bound")).rejects.toThrow(/still linked/);
  });
});
