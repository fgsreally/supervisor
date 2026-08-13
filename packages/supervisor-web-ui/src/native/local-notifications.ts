import { Capacitor } from "@capacitor/core";

import { navigateToSessionFromNotification } from "@/utils/notification-navigate";

const CHANNEL_ID = "session-events";
let initialized = false;
let listenerBound = false;

function notificationIdForTag(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) {
    hash = (Math.imul(31, hash) + tag.charCodeAt(i)) | 0;
  }
  const id = Math.abs(hash) || 1;
  return id % 2147483647;
}

async function plugin() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!Capacitor.isPluginAvailable("LocalNotifications")) return null;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return LocalNotifications;
}

async function ensureChannel(
  local: NonNullable<Awaited<ReturnType<typeof plugin>>>,
): Promise<void> {
  try {
    await local.createChannel({
      id: CHANNEL_ID,
      name: "会话提醒",
      description: "会话完成、等待确认或出错时提醒",
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  } catch {
    // Channel may already exist.
  }
}

export async function initNativeLocalNotifications(): Promise<boolean> {
  const local = await plugin();
  if (!local) return false;

  try {
    const current = await local.checkPermissions();
    const permission = current.display === "granted" ? current : await local.requestPermissions();
    if (permission.display !== "granted") return false;
    await ensureChannel(local);
    await bindLocalNotificationClicks();
    initialized = true;
    return true;
  } catch (error) {
    console.debug("Local notifications unavailable", error);
    return false;
  }
}

export async function bindLocalNotificationClicks(): Promise<void> {
  if (listenerBound) return;
  const local = await plugin();
  if (!local) return;
  listenerBound = true;
  await local.addListener("localNotificationActionPerformed", (action) => {
    const extra = action.notification.extra as { sessionId?: string } | undefined;
    const sessionId = extra?.sessionId;
    if (sessionId) navigateToSessionFromNotification(sessionId);
  });
}

export async function isNativeAppActive(): Promise<boolean> {
  try {
    if (!Capacitor.isPluginAvailable("App")) {
      return typeof document === "undefined" || document.visibilityState === "visible";
    }
    const { App } = await import("@capacitor/app");
    const state = await App.getState();
    return state.isActive;
  } catch {
    return typeof document === "undefined" || document.visibilityState === "visible";
  }
}

export async function scheduleNativeLocalNotification(options: {
  title: string;
  body: string;
  tag: string;
  sessionId: string;
  kind: string;
}): Promise<void> {
  const local = await plugin();
  if (!local) return;
  if (!initialized) {
    const ok = await initNativeLocalNotifications();
    if (!ok) return;
  }
  try {
    await local.schedule({
      notifications: [
        {
          id: notificationIdForTag(options.tag),
          title: options.title,
          body: options.body,
          channelId: CHANNEL_ID,
          extra: { sessionId: options.sessionId, kind: options.kind },
          group: CHANNEL_ID,
        },
      ],
    });
  } catch (error) {
    console.debug("Failed to schedule local notification", error);
  }
}
