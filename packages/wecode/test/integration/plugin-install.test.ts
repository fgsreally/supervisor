/**
 * Test for plugin installation and discovery.
 *
 * This test does NOT require a database or real model provider.
 * It verifies global catalog installation, discovery, update, and removal.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MODULE_BASE = "../../src";

describe("plugin installation and discovery", () => {
  let tmpHome: string;
  let originalHome: string | undefined;

  beforeAll(() => {
    originalHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), "wecode-ext-test-"));
    process.env.HOME = tmpHome;
    // On Windows, also override USERPROFILE just in case.
    (process.env as Record<string, string | undefined>).USERPROFILE = tmpHome;
  });

  afterAll(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("installs a local plugin into global catalog and discovers it", async () => {
    const { installPluginToGlobal, uninstallGlobalPlugin } = await import(
      `${MODULE_BASE}/plugin/installer.js`
    );
    const { listPluginInfosInDirectories } = await import(`${MODULE_BASE}/plugin/loader.js`);
    const { getGlobalPluginsDirectory } = await import(`${MODULE_BASE}/plugin/resource.js`);

    const srcRoot = mkdtempSync(join(tmpdir(), "wecode-ext-src-"));
    writeFileSync(
      join(srcRoot, "package.json"),
      JSON.stringify({
        name: "wecode-ext-sample",
        version: "1.2.3",
        description: "A sample plugin for testing",
        main: "./index.ts",
      }),
      "utf8",
    );
    mkdirSync(join(srcRoot, "node_modules"));
    writeFileSync(
      join(srcRoot, "index.ts"),
      `import { definePlugin } from "wecode";\nexport default definePlugin({ name: "test-ext", setup() {} });\n`,
      "utf8",
    );

    const result = installPluginToGlobal(srcRoot);
    expect(result.id).toBeTruthy();
    expect(existsSync(result.rootDir)).toBe(true);
    expect(existsSync(result.entryPath)).toBe(true);

    const globalPluginDir = getGlobalPluginsDirectory();
    const infos = listPluginInfosInDirectories([globalPluginDir]);
    expect(infos.length).toBeGreaterThanOrEqual(1);

    const found = infos.find((i) => i.id === result.id);
    expect(found, "expected to find the installed plugin").toBeDefined();
    expect(found!.name).toBe("wecode-ext-sample");
    expect(found!.version).toBe("1.2.3");
    expect(found!.description).toBe("A sample plugin for testing");
    expect(found!.fileName).toBe("index.ts");

    uninstallGlobalPlugin(result.id);
    expect(existsSync(result.rootDir)).toBe(false);

    rmSync(srcRoot, { recursive: true, force: true });
  }, 30_000);

  it("update requires package.json repository field", async () => {
    const { installPluginToGlobal, uninstallGlobalPlugin, updateGlobalPlugin } =
      await import(`${MODULE_BASE}/plugin/installer.js`);

    const srcRoot = mkdtempSync(join(tmpdir(), "wecode-ext-src-"));
    writeFileSync(
      join(srcRoot, "package.json"),
      JSON.stringify({
        name: "wecode-ext-no-repo",
        version: "0.0.1",
        main: "./index.ts",
      }),
      "utf8",
    );
    writeFileSync(
      join(srcRoot, "index.ts"),
      `import { definePlugin } from "wecode";\nexport default definePlugin({ name: "no-repo", setup() {} });\n`,
      "utf8",
    );
    mkdirSync(join(srcRoot, "node_modules"));

    const result = installPluginToGlobal(srcRoot);
    expect(() => updateGlobalPlugin(result.id)).toThrow(/repository field/i);

    uninstallGlobalPlugin(result.id);
    rmSync(srcRoot, { recursive: true, force: true });
  }, 30_000);
});
