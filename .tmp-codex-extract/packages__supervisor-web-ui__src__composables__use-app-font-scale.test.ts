import { beforeEach, describe, expect, it } from "vitest";
import {
  APP_FONT_SCALE_STORAGE_KEY,
  parseAppFontScale,
  setAppFontScale,
} from "./use-app-font-scale";

describe("app font scale preference", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.fontScale;
  });

  it("defaults invalid values to standard", () => {
    expect(parseAppFontScale(undefined)).toBe("standard");
    expect(parseAppFontScale("unknown")).toBe("standard");
    expect(parseAppFontScale("compact")).toBe("compact");
    expect(parseAppFontScale("large")).toBe("large");
  });

  it("persists and applies the selected scale", () => {
    setAppFontScale("large");
    expect(localStorage.getItem(APP_FONT_SCALE_STORAGE_KEY)).toBe("large");
    expect(document.documentElement.dataset.fontScale).toBe("large");
  });
});
