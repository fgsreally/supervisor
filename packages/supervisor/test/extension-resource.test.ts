import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createExtensionResourceHandler } from "../src/extension/resource.js";

const created: string[] = [];

afterEach(() => {
  for (const path of created.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("extension resource discovery", () => {
  it("discovers repository extensions supplied by playground mode", () => {
    const root = join(tmpdir(), `supervisor-repository-extensions-${Date.now()}`);
    const extensionDir = join(root, "strict-sdd");
    created.push(root);
    mkdirSync(extensionDir, { recursive: true });
    writeFileSync(join(extensionDir, "index.js"), "export default { name: 'strict-sdd' };\n");
    writeFileSync(
      join(extensionDir, "package.json"),
      JSON.stringify({
        name: "supervisor-strict-sdd",
        version: "0.1.0",
        description: "Strict staged SDD workflow extension",
        main: "./index.js",
      }),
    );

    const handler = createExtensionResourceHandler({
      db: {} as never,
      registry: {} as never,
      discoveryDirectories: [root],
    });

    expect(handler.discover()).toContainEqual(
      expect.objectContaining({
        slug: "strict-sdd",
        name: "supervisor-strict-sdd",
        sourcePath: extensionDir,
      }),
    );
  });
});
