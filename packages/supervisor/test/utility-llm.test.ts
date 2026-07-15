import { describe, expect, it } from "vitest";
import type { SupervisorSettings } from "../src/supervisor-settings.js";
import { resolveUtilityModelConfig } from "../src/utility-llm.js";

describe("supervisor: utility-llm", () => {
  it("resolveUtilityModelConfig returns null when unset", () => {
    expect(resolveUtilityModelConfig({})).toBeNull();
    expect(resolveUtilityModelConfig({ utilityProvider: "openai" })).toBeNull();
  });

  it("resolveUtilityModelConfig returns provider and model when both set", () => {
    const settings: SupervisorSettings = {
      utilityProvider: "openai",
      utilityModelId: "gpt-4o-mini",
    };
    expect(resolveUtilityModelConfig(settings)).toEqual({
      provider: "openai",
      modelId: "gpt-4o-mini",
    });
  });
});
