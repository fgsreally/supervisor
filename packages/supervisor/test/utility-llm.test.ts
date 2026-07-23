import { describe, expect, it } from "vitest";
import type { SupervisorSettings } from "../src/utils/supervisor-settings.js";
import { getFeatureModelRef, resolveFeatureModelRef } from "../src/utils/utility-llm.js";

describe("supervisor: utility-llm feature models", () => {
  it("getFeatureModelRef returns null when unset", () => {
    expect(getFeatureModelRef("daily-work", {})).toBeNull();
    expect(getFeatureModelRef("daily-work", { featureModels: {} })).toBeNull();
  });

  it("resolveFeatureModelRef does not fall back across features", () => {
    const settings: SupervisorSettings = {
      featureModels: {
        summary: { providerId: 1, modelId: "gpt-4o-mini" },
      },
    };
    expect(resolveFeatureModelRef("summary", settings)).toEqual({
      providerId: 1,
      modelId: "gpt-4o-mini",
    });
    expect(resolveFeatureModelRef("daily-work", settings)).toBeNull();
    expect(resolveFeatureModelRef("commit-message", settings)).toBeNull();
  });

  it("resolveFeatureModelRef returns the feature-specific binding", () => {
    const settings: SupervisorSettings = {
      featureModels: {
        "daily-work": { providerId: 2, modelId: "claude-haiku" },
      },
    };
    expect(resolveFeatureModelRef("daily-work", settings)).toEqual({
      providerId: 2,
      modelId: "claude-haiku",
    });
  });
});
