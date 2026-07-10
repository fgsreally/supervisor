import { describe, expect, it } from "vitest";
import { getPackagedExtensionPath } from "../src/extension-system/loader.js";
import { loadExtensionModule } from "../src/extension-system/loader.js";

describe("packaged web and browser extensions", () => {
  it("loads supervisor-web extension", async () => {
    const result = await loadExtensionModule(getPackagedExtensionPath("web"));
    expect(result.error).toBeUndefined();
    expect(result.definition?.name).toBe("supervisor-web");
  });

  it("loads supervisor-browser extension", async () => {
    const result = await loadExtensionModule(getPackagedExtensionPath("browser"));
    expect(result.error).toBeUndefined();
    expect(result.definition?.name).toBe("supervisor-browser");
  });
});
