/**
 * Test for extension installation and discovery.
 *
 * This test does NOT require a database or real model provider.
 * It verifies global catalog installation, discovery, update, and removal.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MODULE_BASE = "../../src";

describe("extension installation and discovery", () => {
  let tmpHome: string;
  let originalHome: string | undefined;

  beforeAll(() => {
    originalHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), "pi-ext-test-"));
    process.env.HOME = tmpHome;
    // On Windows, also override USERPROFILE just in case.
    (process.env as Record<string, string | undefined>).USERPROFILE = tmpHome;
  });

  afterAll(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("installs a local extension into global catalog and discovers it", async () => {
    const { installExtensionToGlobal, uninstallGlobalExtension } = await import(
      `${MODULE_BASE}/extension-system/extension-installer.js`
    );
    const { listExtensionInfosInDirectories } = await import(
      `${MODULE_BASE}/extension-system/loader.js`
    );
    const { getGlobalResourceDirs } = await import(`${MODULE_BASE}/resources/resource-paths.js`);

    const srcRoot = mkdtempSync(join(tmpdir(), "pi-ext-src-"));
    writeFileSync(
      join(srcRoot, "package.json"),
      JSON.stringify({
        name: "pi-ext-sample",
        version: "1.2.3",
        description: "A sample extension for testing",
        main: "./index.ts",
        dependencies: { lodash: "^4.17.21" },
      }),
      "utf8",
    );
    writeFileSync(
      join(srcRoot, "index.ts"),
      `import { defineExtension } from "@earendil-works/pi-supervisor";\nexport default defineExtension({ name: "test-ext", setup() {} });\n`,
      "utf8",
    );

    const result = installExtensionToGlobal(srcRoot);
    expect(result.id).toBeTruthy();
    expect(existsSync(result.rootDir)).toBe(true);
    expect(existsSync(result.entryPath)).toBe(true);

    const globalExtDir = getGlobalResourceDirs().extensions;
    const infos = listExtensionInfosInDirectories([globalExtDir]);
    expect(infos.length).toBeGreaterThanOrEqual(1);

    const found = infos.find((i) => i.id === result.id);
    expect(found, "expected to find the installed extension").toBeDefined();
    expect(found!.name).toBe("pi-ext-sample");
    expect(found!.version).toBe("1.2.3");
    expect(found!.description).toBe("A sample extension for testing");
    expect(found!.fileName).toBe("index.ts");
    expect(found!.isFlatFile).toBe(false);

    uninstallGlobalExtension(result.id);
    expect(existsSync(result.rootDir)).toBe(false);

    rmSync(srcRoot, { recursive: true, force: true });
  }, 30_000);

  it("update requires package.json repository field", async () => {
    const { installExtensionToGlobal, uninstallGlobalExtension, updateGlobalExtension } =
      await import(`${MODULE_BASE}/extension-system/extension-installer.js`);

    const srcRoot = mkdtempSync(join(tmpdir(), "pi-ext-src-"));
    writeFileSync(
      join(srcRoot, "package.json"),
      JSON.stringify({
        name: "pi-ext-no-repo",
        version: "0.0.1",
        main: "./index.ts",
      }),
      "utf8",
    );
    writeFileSync(
      join(srcRoot, "index.ts"),
      `import { defineExtension } from "@earendil-works/pi-supervisor";\nexport default defineExtension({ name: "no-repo", setup() {} });\n`,
      "utf8",
    );

    const result = installExtensionToGlobal(srcRoot);
    expect(() => updateGlobalExtension(result.id)).toThrow(/repository field/i);

    uninstallGlobalExtension(result.id);
    rmSync(srcRoot, { recursive: true, force: true });
  }, 30_000);
});
