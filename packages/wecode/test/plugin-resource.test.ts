import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPluginResourceHandler } from "../src/plugin/resource.js";

const created: string[] = [];

afterEach(() => {
  for (const path of created.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("plugin resource discovery", () => {
  it("discovers repository plugins supplied by playground mode", () => {
    const root = join(tmpdir(), `wecode-repository-plugins-${Date.now()}`);
    const pluginDir = join(root, "strict-sdd");
    created.push(root);
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, "index.js"), "export default { name: 'strict-sdd' };\n");
    writeFileSync(
      join(pluginDir, "package.json"),
      JSON.stringify({
        name: "wecode-strict-sdd",
        version: "0.1.0",
        description: "Strict staged SDD workflow plugin",
        main: "./index.js",
      }),
    );

    const handler = createPluginResourceHandler({
      db: {} as never,
      registry: {} as never,
      discoveryDirectories: [root],
    });

    expect(handler.discover()).toContainEqual(
      expect.objectContaining({
        slug: "strict-sdd",
        name: "wecode-strict-sdd",
        sourcePath: pluginDir,
      }),
    );
  });
});
