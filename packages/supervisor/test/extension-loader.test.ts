import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadExtensions } from "../src/extension/index.js";

describe("supervisor: extension loader", () => {
  it("loads explicit extension paths", async () => {
    const tmp = join(tmpdir(), `sup-ext-loader-${Date.now()}`);
    const customDir = join(tmp, "custom");
    mkdirSync(customDir, { recursive: true });
    const custom = join(customDir, "index.ts");
    writeFileSync(
      custom,
      `import { defineExtension } from "pi-supervisor";
export default defineExtension({ name: "custom-test", setup() {} });`,
    );

    const result = await loadExtensions([custom]);

    expect(result.errors).toHaveLength(0);
    expect(result.extensions.map((ext) => ext.definition.name)).toEqual(["custom-test"]);

    rmSync(tmp, { recursive: true, force: true });
  }, 15000);
});
