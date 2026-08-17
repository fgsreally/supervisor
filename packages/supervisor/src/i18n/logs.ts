import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import pc from "picocolors";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogLocale = "en" | "zh-CN";
export type LogKey = keyof typeof en;
export type LogParams = Record<string, string | number | boolean | null | undefined>;

const locales: Record<LogLocale, Record<string, string>> = { en, "zh-CN": zhCN };

function normalizeLocale(value: string | undefined): LogLocale {
  const locale = value?.trim().toLowerCase();
  return locale === "zh" || locale === "zh-cn" || locale?.startsWith("zh-") ? "zh-CN" : "en";
}

export function getLogLocale(): LogLocale {
  return normalizeLocale(
    process.env.PI_SUPERVISOR_LOCALE ??
      process.env.LC_ALL ??
      process.env.LANG ??
      process.env.LANGUAGE,
  );
}

export function translateLog(key: LogKey, params: LogParams = {}, locale = getLogLocale()): string {
  const template = locales[locale][key] ?? locales.en[key] ?? key;
  return template.replace(/{{\s*([\w.-]+)\s*}}/g, (_, name: string) => {
    const value = params[name];
    return value == null ? "" : String(value);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Translate legacy session log calls that still pass a rendered English message.
 * New call sites should use writeLog with a key directly; this compatibility path
 * keeps older dynamic messages localizable while they are migrated incrementally.
 */
export function translateRawLog(message: string, locale = getLogLocale()): string {
  for (const [key, template] of Object.entries(en) as Array<[LogKey, string]>) {
    const names: string[] = [];
    let pattern = "^";
    let cursor = 0;
    const token = /{{\s*([\w.-]+)\s*}}/g;
    for (const match of template.matchAll(token)) {
      pattern += escapeRegExp(template.slice(cursor, match.index));
      names.push(match[1]);
      pattern += "(.*?)";
      cursor = (match.index ?? 0) + match[0].length;
    }
    pattern += escapeRegExp(template.slice(cursor)) + "$";
    const matched = new RegExp(pattern).exec(message);
    if (!matched) continue;
    const params: LogParams = {};
    names.forEach((name, index) => {
      params[name] = matched[index + 1];
    });
    return translateLog(key, params, locale);
  }
  return message;
}

export function writeLog(
  level: LogLevel,
  key: LogKey,
  params: LogParams = {},
  ...details: unknown[]
): void {
  const message = translateLog(key, params);
  const prefix = `[${level.toUpperCase()}]`;
  const coloredPrefix =
    level === "error"
      ? pc.red(prefix)
      : level === "warn"
        ? pc.yellow(prefix)
        : level === "debug"
          ? pc.cyan(prefix)
          : pc.blue(prefix);
  const output = `${coloredPrefix} ${message}`;
  if (level === "error") console.error(output, ...details);
  else if (level === "warn") console.warn(output, ...details);
  else if (level === "debug") console.debug(output, ...details);
  else console.log(output, ...details);
}
