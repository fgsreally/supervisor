import { beforeEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, translate } from "../index";
import en from "../messages/en";
import zhCN from "../messages/zh-CN";

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

  it("keeps locale keys and interpolation parameters aligned", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zhCN).sort());
    for (const key of Object.keys(en)) {
      const enParams = [...en[key].matchAll(/{{\s*([\w.-]+)\s*}}/g)].map((m) => m[1]).sort();
      const zhParams = [...zhCN[key].matchAll(/{{\s*([\w.-]+)\s*}}/g)].map((m) => m[1]).sort();
      expect(zhParams, `placeholder mismatch for ${key}`).toEqual(enParams);
      expect(en[key].trim(), `empty English translation for ${key}`).not.toBe("");
      expect(zhCN[key].trim(), `empty Chinese translation for ${key}`).not.toBe("");
    }
  });
});
