import { readonly, ref } from "vue";
import wechatStyleUrl from "../styles/mobile/themes/wechat.css?url";
import clarityStyleUrl from "../styles/mobile/themes/clarity.css?url";

export type MobileStyle = "wechat" | "clarity";

const STYLE_QUERY_KEY = "mobileStyle";
const LINK_ID = "mobile-style-theme";
const style = ref<MobileStyle>("wechat");
const styleReady = ref(false);

const styleUrls: Record<MobileStyle, string> = {
  wechat: wechatStyleUrl,
  clarity: clarityStyleUrl,
};

export function parseMobileStyle(value: unknown): MobileStyle {
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized === "clarity" ? "clarity" : "wechat";
}

export function mobileStyleFromSearch(search: string): MobileStyle {
  return parseMobileStyle(new URLSearchParams(search).get(STYLE_QUERY_KEY));
}

export async function setMobileStyle(next: MobileStyle): Promise<void> {
  if (typeof document === "undefined") {
    style.value = next;
    styleReady.value = true;
    return;
  }

  const url = styleUrls[next];
  const current = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (current?.dataset.style === next) {
    style.value = next;
    document.documentElement.dataset.mobileStyle = next;
    styleReady.value = true;
    return;
  }

  styleReady.value = false;
  const link = document.createElement("link");
  link.id = `${LINK_ID}-pending`;
  link.rel = "stylesheet";
  link.href = url;
  link.dataset.style = next;

  await new Promise<void>((resolve, reject) => {
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => reject(new Error(`Failed to load ${next} mobile style`)), {
      once: true,
    });
    document.head.append(link);
  }).catch(async () => {
    link.remove();
    if (next !== "wechat") await setMobileStyle("wechat");
  });

  if (!link.isConnected) return;
  current?.remove();
  link.id = LINK_ID;
  style.value = next;
  document.documentElement.dataset.mobileStyle = next;
  styleReady.value = true;
}

export async function initMobileStyle(): Promise<void> {
  const initial =
    typeof window === "undefined" ? "wechat" : mobileStyleFromSearch(window.location.search);
  await setMobileStyle(initial);
}

export function useMobileStyle() {
  return {
    style: readonly(style),
    styleReady: readonly(styleReady),
    setStyle: setMobileStyle,
  };
}
