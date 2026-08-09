import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { SplashScreen } from "@capacitor/splash-screen";

import { registerPushDevice } from "../api/api";
import {
  getMobileServerPin,
  getMobileServerUrl,
  getOrCreateDeviceId,
  isBackgroundConnectionEnabled,
} from "../utils/mobile-server-config";
import { isNativeApp, nativePlatform } from "../composables/use-native-app";
import { startBackgroundConnection } from "../composables/use-live-status";

let pushInitialized = false;

export async function initNativeShell(): Promise<void> {
  if (!isNativeApp()) return;
  await SplashScreen.hide().catch(() => undefined);
  await initNativePushNotifications();
  setupDeepLinks();
  if (isBackgroundConnectionEnabled()) {
    await startBackgroundConnection("Supervisor", "后台保持连接");
  }
}

export async function initNativePushNotifications(): Promise<void> {
  if (!isNativeApp() || pushInitialized) return;
  if (!Capacitor.isPluginAvailable("PushNotifications")) return;

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return;

  await PushNotifications.register();

  PushNotifications.addListener("registration", (token) => {
    void registerPushDevice({
      deviceId: getOrCreateDeviceId(),
      platform: nativePlatform(),
      pushToken: token.value,
      manufacturer: nativePlatform(),
    }).catch(() => undefined);
  });

  PushNotifications.addListener("registrationError", (error) => {
    console.debug("Push registration error", error);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action.notification.data as { sessionId?: string } | undefined;
    const sessionId = data?.sessionId;
    if (sessionId) {
      window.location.hash = `#/chat/${sessionId}`;
    }
  });

  pushInitialized = true;
}

function setupDeepLinks(): void {
  void App.addListener("appUrlOpen", (event) => {
    const url = event.url;
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "supervisor:") {
        const path = parsed.pathname || parsed.host;
        if (path.startsWith("/session/") || path.startsWith("session/")) {
          const id = path.replace(/^\/?session\//, "");
          if (id) window.location.hash = `#/chat/${id}`;
        }
      }
    } catch {
      // ignore malformed URLs
    }
  });
}

export function isNativeServerConfigured(): boolean {
  return Boolean(getMobileServerUrl() && getMobileServerPin());
}
