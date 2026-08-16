import { readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../components");

describe("component directory boundaries", () => {
  it("keeps domain components out of the shared component root", () => {
    const rootVueFiles = readdirSync(componentsRoot).filter((name) => {
      const path = resolve(componentsRoot, name);
      return statSync(path).isFile() && name.endsWith(".vue");
    });

    expect(rootVueFiles).toEqual([]);
  });

  it("provides a public index for each domain", () => {
    for (const domain of [
      "agent",
      "base",
      "chat",
      "external-agent",
      "home",
      "layout",
      "onboarding",
      "project",
      "provider",
      "resource",
      "search",
      "session",
      "settings",
      "task",
      "tool",
    ]) {
      expect(statSync(resolve(componentsRoot, domain, "index.ts")).isFile()).toBe(true);
    }
  });

  it("keeps responsive variants behind an index entry", () => {
    for (const component of ["ResponsiveDialog", "ResponsivePopover", "ResponsiveSplitSurface"]) {
      const folder = resolve(componentsRoot, "base", component);
      expect(statSync(resolve(folder, "index.vue")).isFile()).toBe(true);
      expect(statSync(resolve(folder, "pc.vue")).isFile()).toBe(true);
      expect(statSync(resolve(folder, "mobile.vue")).isFile()).toBe(true);
    }
  });
});
