import { afterEach, describe, expect, it } from "vitest";
import { getLogLocale, translateLog, translateRawLog } from "../src/i18n/logs.js";

const originalLocale = process.env.PI_SUPERVISOR_LOCALE;

afterEach(() => {
  if (originalLocale === undefined) delete process.env.PI_SUPERVISOR_LOCALE;
  else process.env.PI_SUPERVISOR_LOCALE = originalLocale;
});

describe("console log i18n", () => {
  it("selects Chinese from the explicit locale", () => {
    process.env.PI_SUPERVISOR_LOCALE = "zh-CN";
    expect(getLogLocale()).toBe("zh-CN");
    expect(translateLog("cli.providers.added", { id: "demo" })).toBe("已添加提供商：demo");
  });

  it("falls back to English for unsupported locales", () => {
    process.env.PI_SUPERVISOR_LOCALE = "fr-FR";
    expect(getLogLocale()).toBe("en");
    expect(translateLog("cli.providers.added", { id: "demo" })).toBe("Added provider: demo");
  });

  it("replaces dynamic values without requiring a translated string", () => {
    process.env.PI_SUPERVISOR_LOCALE = "zh";
    expect(translateLog("runtime.sessionRuntimeStartFailed", { id: 7, error: "boom" })).toBe(
      "Session 运行时启动失败 [7]：boom",
    );
  });

  it("translates legacy rendered session log messages", () => {
    process.env.PI_SUPERVISOR_LOCALE = "zh-CN";
    expect(translateRawLog("Session ready (status=running)")).toBe(
      "Session 已就绪（状态=running）",
    );
    expect(translateRawLog("Starting api: pnpm dev")).toBe("正在启动 api：pnpm dev");
  });
});
