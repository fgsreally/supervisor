/** Unified notifications: Capacitor local notifications in native App, Notification API on web. */

import {
  bindNotificationNavigation,
  isCurrentlyOpenVisibleSession,
  navigateToSessionFromNotification,
} from "@/utils/notification-navigate";
import { translate as t } from "@/i18n";

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

export interface SessionErrorNotifyOptions {
  sessionId: string;
  sessionName: string;
  muted?: boolean;
  detail?: string;
}

let permissionRequested = false;
let nativeReady = false;
let navigationBound = false;

function ensureNotificationNavigation(): void {
  if (navigationBound) return;
  navigationBound = true;
  bindNotificationNavigation();
}

async function ensureNativeNotifications(): Promise<boolean> {
  if (nativeReady) return true;
  try {
    const { isNativeApp } = await import("./use-native-app");
    if (!isNativeApp()) return false;
    const { initNativeLocalNotifications } = await import("../native/local-notifications");
    nativeReady = await initNativeLocalNotifications();
    return nativeReady;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "prompt"> {
  ensureNotificationNavigation();
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
    body: truncatePreview(options.preview, t("notification.messageComplete")),
    tag: `wecode-${options.sessionId}`,
    sessionId: options.sessionId,
    kind: "message_complete",
    onlyWhenHidden: true,
  });
}

export function notifyAskUserInput(options: AskUserInputNotifyOptions): void {
  if (options.muted) return;
  const preview = options.prompt
    ? t("notification.askUser", { prompt: truncatePreview(options.prompt, t("notification.askFallback")) })
    : t("notification.askFallback");
  void dispatchNotification(options.sessionName, {
    body: preview,
    tag: `wecode-ask-${options.sessionId}`,
    sessionId: options.sessionId,
    kind: "ask_user",
  });
}

export function notifySessionError(options: SessionErrorNotifyOptions): void {
  if (options.muted) return;
  void dispatchNotification(options.sessionName, {
    body: truncatePreview(options.detail, t("notification.errorNeedsAction")),
    tag: `wecode-error-${options.sessionId}`,
    sessionId: options.sessionId,
    kind: "session_error",
  });
}

function truncatePreview(text: string | undefined, fallback: string): string {
  if (!text?.trim()) return fallback;
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

async function showWebNotification(
  title: string,
  options: { body: string; tag: string; sessionId: string; kind: string },
): Promise<void> {
  try {
    const notification = new Notification(title, {
      body: options.body,
      tag: options.tag,
      data: { sessionId: options.sessionId, kind: options.kind },
      renotify: true,
    } as NotificationOptions);
    notification.onclick = () => {
      window.focus();
      notification.close();
      if (options.sessionId) {
        navigateToSessionFromNotification(options.sessionId);
      }
    };
  } catch {
    // Some mobile browsers throw on `new Notification()`.
  }
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
  ensureNotificationNavigation();
  const { isNativeApp } = await import("./use-native-app");
  if (isNativeApp()) {
    const { isNativeAppActive, scheduleNativeLocalNotification } =
      await import("../native/local-notifications");
    const appActive = await isNativeAppActive();
    // Native: only alert when the app is backgrounded or this session is not on screen.
    if (appActive && isCurrentlyOpenVisibleSession(options.sessionId)) return;
    await scheduleNativeLocalNotification({
      title,
      body: options.body,
      tag: options.tag,
      sessionId: options.sessionId,
      kind: options.kind,
    });
    return;
  }
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (options.onlyWhenHidden && isCurrentlyOpenVisibleSession(options.sessionId)) return;
  if (Notification.permission !== "granted") {
    void requestNotificationPermission();
    return;
  }
  await showWebNotification(title, options);
}
