import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SupervisorDb } from "../src/db.js";
import { ExtensionModuleRegistry } from "../src/extension/registry.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("extension external agents", () => {
  it("registers a declared ACP agent once", async () => {
    const root = join(tmpdir(), `external-agent-extension-${Date.now()}`);
    roots.push(root);
    const extensionDir = join(root, "demo-agent");
    mkdirSync(extensionDir, { recursive: true });
    writeFileSync(
      join(extensionDir, "index.js"),
      `export default {
        name: "Demo agent",
        externalAgents: [{ id: "demo", name: "Demo", command: "demo", args: ["acp"] }],
        setup() {}
      };`,
    );
    const db = new SupervisorDb(join(root, "test.db"));
    db.upsertResource({
      kind: "extension",
      slug: "demo-agent",
      source_path: extensionDir,
    });
    const registry = new ExtensionModuleRegistry();

    await registry.refresh(db);
    await registry.refresh(db);

    const agents = db.listAgents().filter((agent) => agent.name === "Demo");
    expect(agents).toHaveLength(1);
    expect(agents[0]).toEqual(
      expect.objectContaining({
        backendType: "acp",
        isBuiltin: false,
        externalConfig: expect.objectContaining({ command: "demo", args: ["acp"] }),
      }),
    );
    db.close();
  });

  it("registers newly declared agents when an extension reloads", async () => {
    const root = join(tmpdir(), `external-agent-extension-reload-${Date.now()}`);
    roots.push(root);
    const extensionDir = join(root, "demo-agent");
    mkdirSync(extensionDir, { recursive: true });
    const entryPath = join(extensionDir, "index.js");
    writeFileSync(entryPath, `export default { name: "Demo agent", setup() {} };`);
    const db = new SupervisorDb(join(root, "test.db"));
    db.upsertResource({ kind: "extension", slug: "demo-agent", source_path: extensionDir });
    const registry = new ExtensionModuleRegistry();

    await registry.refresh(db);
    writeFileSync(
      entryPath,
      `export default {
        name: "Demo agent",
        externalAgents: [{ id: "demo", name: "Demo", command: "demo", args: ["acp"] }],
        setup() {}
      };`,
    );
    await registry.reload(db, "demo-agent");

    expect(db.listAgents().filter((agent) => agent.name === "Demo")).toHaveLength(1);
    db.close();
  });
});
