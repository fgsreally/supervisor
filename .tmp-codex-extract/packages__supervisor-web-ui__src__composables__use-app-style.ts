import { readonly, ref } from "vue";
import wechatStyleUrl from "../styles/mobile/themes/wechat.css?url";
import clarityStyleUrl from "../styles/mobile/themes/clarity.css?url";

export type AppStyle = "wechat" | "clarity";

export const APP_STYLE_STORAGE_KEY = "pi-supervisor-ui-style";
const LINK_ID = "app-style-theme";
const style = ref<AppStyle>("wechat");
const styleReady = ref(false);

const styleUrls: Record<AppStyle, string> = {
  wechat: wechatStyleUrl,
  clarity: clarityStyleUrl,
};

export function parseAppStyle(value: unknown): AppStyle {
  return value === "clarity" ? "clarity" : "wechat";
}

export function storedAppStyle(storage: Pick<Storage, "getItem">): AppStyle {
  return parseAppStyle(storage.getItem(APP_STYLE_STORAGE_KEY));
}

export async function setAppStyle(next: AppStyle): Promise<void> {
  if (typeof document === "undefined") {
    style.value = next;
    styleReady.value = true;
    return;
  }

  const current = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (current?.dataset.style === next) {
    style.value = next;
    document.documentElement.dataset.appStyle = next;
    localStorage.setItem(APP_STYLE_STORAGE_KEY, next);
    styleReady.value = true;
    return;
  }

  styleReady.value = false;
  const link = document.createElement("link");
  link.id = `${LINK_ID}-pending`;
  link.rel = "stylesheet";
  link.href = styleUrls[next];
  link.dataset.style = next;

  try {
    await new Promise<void>((resolve, reject) => {
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener("error", () => reject(new Error(`Failed to load ${next} app style`)), {
        once: true,
      });
      document.head.append(link);
    });
  } catch {
    link.remove();
    if (next !== "wechat") await setAppStyle("wechat");
    return;
  }

  current?.remove();
  link.id = LINK_ID;
  style.value = next;
  document.documentElement.dataset.appStyle = next;
  localStorage.setItem(APP_STYLE_STORAGE_KEY, next);
  styleReady.value = true;
}

export async function initAppStyle(): Promise<void> {
  const initial = typeof localStorage === "undefined" ? "wechat" : storedAppStyle(localStorage);
  await setAppStyle(initial);
}

export function useAppStyle() {
  return {
    style: readonly(style),
    styleReady: readonly(styleReady),
    setStyle: setAppStyle,
  };
}
