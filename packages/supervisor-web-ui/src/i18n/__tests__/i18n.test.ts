import { beforeEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, translate } from "../index";

describe("web UI i18n", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setLocale("zh-CN");
  });

  it("translates messages and switches locale", () => {
    expect(translate("settings.language")).toBe("界面语言");
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(translate("settings.language")).toBe("Language");
    expect(document.documentElement.lang).toBe("en");
  });

  it("persists the selected locale", () => {
    setLocale("en");
    expect(window.localStorage.getItem("supervisor.ui.locale")).toBe("en");
  });

  it("falls back to the key for missing translations", () => {
    expect(translate("missing.key")).toBe("missing.key");
  });
});
