import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPlugins } from "../src/plugin/index.js";

describe("wecode: plugin loader", () => {
  it("loads explicit plugin paths", async () => {
    const tmp = join(tmpdir(), `sup-ext-loader-${Date.now()}`);
    const customDir = join(tmp, "custom");
    mkdirSync(customDir, { recursive: true });
    const custom = join(customDir, "index.ts");
    writeFileSync(
      custom,
      `import { definePlugin } from "wecode";
export default definePlugin({ name: "custom-test", setup() {} });`,
    );

    const result = await loadPlugins([custom]);

    expect(result.errors).toHaveLength(0);
    expect(result.plugins.map((ext) => ext.definition.name)).toEqual(["custom-test"]);

    rmSync(tmp, { recursive: true, force: true });
  }, 15000);
});
