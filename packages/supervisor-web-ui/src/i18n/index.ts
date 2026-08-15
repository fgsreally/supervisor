import { computed, ref } from "vue";
import en from "./messages/en";
import zhCN from "./messages/zh-CN";
import type { AppLocale, TranslationMessages, TranslationParams } from "./types";

export type { AppLocale } from "./types";

const STORAGE_KEY = "supervisor.ui.locale";
const messages: Record<AppLocale, TranslationMessages> = { en, "zh-CN": zhCN };
const locale = ref<AppLocale>(loadInitialLocale());

function normalizeLocale(value: string | null | undefined): AppLocale | null {
  if (!value) return null;
  return value.toLowerCase().startsWith("zh")
    ? "zh-CN"
    : value.toLowerCase().startsWith("en")
      ? "en"
      : null;
}

function loadInitialLocale(): AppLocale {
  if (typeof window !== "undefined") {
    const saved = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
    const browser = normalizeLocale(window.navigator.language);
    if (browser) return browser;
  }
  return "zh-CN";
}

export function getLocale(): AppLocale {
  return locale.value;
}

export function setLocale(next: AppLocale): void {
  locale.value = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
}

export function translate(key: string, params: TranslationParams = {}): string {
  const template = messages[locale.value][key] ?? messages.en[key] ?? key;
  return template.replace(/{{\s*([\w.-]+)\s*}}/g, (_, name: string) => {
    const value = params[name];
    return value == null ? "" : String(value);
  });
}

export function useI18n() {
  return {
    locale: computed(() => locale.value),
    t: translate,
    setLocale,
  };
}

if (typeof document !== "undefined") document.documentElement.lang = locale.value;
