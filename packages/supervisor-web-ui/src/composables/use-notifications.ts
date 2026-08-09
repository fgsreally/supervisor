/** Unified notifications: native push in Capacitor shell, browser Notification API on web/PWA. */

export interface MessageCompleteNotifyOptions {
  sessionId: string;
  sessionName: string;
  muted?: boolean;
  preview?: string;
}

export interface AskUserInputNotifyOptions {
  sessionId: string;
  sessionName: string;
  prompt?: string;
  muted?: boolean;
}

let permissionRequested = false;
let nativeReady = false;

async function ensureNativeNotifications(): Promise<boolean> {
  if (nativeReady) return true;
  try {
    const { isNativeApp } = await import("./use-native-app");
    if (!isNativeApp()) return false;
    const { initNativePushNotifications } = await import("../native/bootstrap");
    await initNativePushNotifications();
    nativeReady = true;
    return true;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "prompt"> {
  if (await ensureNativeNotifications()) {
    return "granted";
  }
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  if (permissionRequested) return Notification.permission;
  permissionRequested = true;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function notifyMessageComplete(options: MessageCompleteNotifyOptions): void {
  if (options.muted) return;
  void dispatchNotification(options.sessionName, {
    body: truncatePreview(options.preview, "新消息已完成"),
    tag: `pi-supervisor-${options.sessionId}`,
    sessionId: options.sessionId,
    kind: "message_complete",
    onlyWhenHidden: true,
  });
}

export function notifyAskUserInput(options: AskUserInputNotifyOptions): void {
  if (options.muted) return;
  const preview = options.prompt
    ? `请选择：${truncatePreview(options.prompt, "请在聊天中选择一项并确认")}`
    : "请在聊天中选择一项并确认";
  void dispatchNotification(options.sessionName, {
    body: preview,
    tag: `pi-supervisor-ask-${options.sessionId}`,
    sessionId: options.sessionId,
    kind: "ask_user",
  });
}

function truncatePreview(text: string | undefined, fallback: string): string {
  if (!text?.trim()) return fallback;
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

async function dispatchNotification(
  title: string,
  options: {
    body: string;
    tag: string;
    sessionId: string;
    kind: string;
    onlyWhenHidden?: boolean;
  },
): Promise<void> {
  const { isNativeApp } = await import("./use-native-app");
  if (isNativeApp()) {
    return;
  }
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (options.onlyWhenHidden && !document.hidden) return;
  if (Notification.permission !== "granted") {
    void requestNotificationPermission();
    return;
  }
  const notification = new Notification(title, {
    body: options.body,
    tag: options.tag,
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
    if (options.sessionId) {
      window.location.hash = `#/chat/${options.sessionId}`;
    }
  };
}

/** Re-export legacy implementations for tests. */
export { requestNotificationPermission as requestBrowserNotificationPermission } from "./use-push-notifications";
