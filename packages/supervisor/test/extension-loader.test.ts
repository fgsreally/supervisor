import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverAndLoadExtensions,
  getPackagedExtensionPath,
} from "../src/extension-system/loader.js";

describe("supervisor: extension loader", () => {
  it("does not load packaged agent tools unless selected", async () => {
    const tmp = join(tmpdir(), `sup-ext-loader-empty-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });

    const result = await discoverAndLoadExtensions({
      agentHomeDir: tmp,
      cwd: tmp,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.extensions).toHaveLength(0);

    rmSync(tmp, { recursive: true, force: true });
  });

  it("loads selected extensions from directories and explicit paths", async () => {
    const tmp = join(tmpdir(), `sup-ext-loader-${Date.now()}`);
    mkdirSync(join(tmp, "extensions"), { recursive: true });
    const customDir = join(tmp, "extensions", "custom");
    mkdirSync(customDir, { recursive: true });
    const custom = join(customDir, "index.ts");
    writeFileSync(
      custom,
      `import { defineExtension } from "@earendil-works/pi-supervisor";
export default defineExtension({ name: "custom-test", setup() {} });`,
    );

    const result = await discoverAndLoadExtensions({
      agentHomeDir: tmp,
      cwd: tmp,
      additionalPaths: [getPackagedExtensionPath("read")],
    });

    expect(result.errors).toHaveLength(0);
    expect(result.extensions.map((ext) => ext.definition.name)).toContain("custom-test");
    expect(result.extensions.map((ext) => ext.definition.name)).toContain("supervisor-read");

    rmSync(tmp, { recursive: true, force: true });
  }, 15000);
});
