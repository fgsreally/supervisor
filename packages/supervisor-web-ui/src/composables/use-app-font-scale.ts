import { readonly, ref } from "vue";

export type AppFontScale = "small" | "standard" | "large";

export const APP_FONT_SCALE_STORAGE_KEY = "pi-supervisor-ui-font-scale-v2";
const LEGACY_FONT_SCALE_STORAGE_KEY = "pi-supervisor-ui-font-scale";

const fontScale = ref<AppFontScale>("standard");

export function parseAppFontScale(value: unknown): AppFontScale {
  if (value === "small" || value === "large") return value;
  return "standard";
}

/** Map pre-v2 storage values: compact→small, standard→small, large→standard. */
function migrateLegacyFontScale(value: string | null): AppFontScale | null {
  if (value === "compact" || value === "standard") return "small";
  if (value === "large") return "standard";
  return null;
}

export function setAppFontScale(next: AppFontScale): void {
  fontScale.value = next;
  if (typeof document !== "undefined") document.documentElement.dataset.fontScale = next;
  if (typeof localStorage !== "undefined") localStorage.setItem(APP_FONT_SCALE_STORAGE_KEY, next);
}

export function initAppFontScale(): void {
  let initial: AppFontScale = "standard";
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(APP_FONT_SCALE_STORAGE_KEY);
    if (stored !== null) {
      initial = parseAppFontScale(stored);
    } else {
      const migrated = migrateLegacyFontScale(localStorage.getItem(LEGACY_FONT_SCALE_STORAGE_KEY));
      if (migrated) initial = migrated;
    }
  }
  setAppFontScale(initial);
}

export function useAppFontScale() {
  return { fontScale: readonly(fontScale), setFontScale: setAppFontScale };
}
