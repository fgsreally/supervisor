import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): "ios" | "android" | "web" {
  const platform = Capacitor.getPlatform();
  if (platform === "ios") return "ios";
  if (platform === "android") return "android";
  return "web";
}
