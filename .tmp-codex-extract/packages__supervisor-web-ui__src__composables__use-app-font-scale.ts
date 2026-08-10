import { readonly, ref } from "vue";

export type AppFontScale = "compact" | "standard" | "large";

export const APP_FONT_SCALE_STORAGE_KEY = "pi-supervisor-ui-font-scale";
const fontScale = ref<AppFontScale>("standard");

export function parseAppFontScale(value: unknown): AppFontScale {
  if (value === "compact" || value === "large") return value;
  return "standard";
}

export function setAppFontScale(next: AppFontScale): void {
  fontScale.value = next;
  if (typeof document !== "undefined") document.documentElement.dataset.fontScale = next;
  if (typeof localStorage !== "undefined") localStorage.setItem(APP_FONT_SCALE_STORAGE_KEY, next);
}

export function initAppFontScale(): void {
  const initial =
    typeof localStorage === "undefined"
      ? "standard"
      : parseAppFontScale(localStorage.getItem(APP_FONT_SCALE_STORAGE_KEY));
  setAppFontScale(initial);
}

export function useAppFontScale() {
  return { fontScale: readonly(fontScale), setFontScale: setAppFontScale };
}
