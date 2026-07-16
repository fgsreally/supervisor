/** Browser push notifications when assistant replies complete (PWA-friendly). */

export interface MessageCompleteNotifyOptions {
  sessionId: string;
  sessionName: string;
  muted?: boolean;
  preview?: string;
}

let permissionRequested = false;

export async function requestNotificationPermission(): Promise<NotificationPermission> {
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
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (options.muted) return;
  if (!document.hidden) return;
  showNotification(options.sessionName, {
    body: truncatePreview(options.preview, "新消息已完成"),
    tag: `pi-supervisor-${options.sessionId}`,
  });
}

export interface AskUserInputNotifyOptions {
  sessionId: string;
  sessionName: string;
  prompt?: string;
  muted?: boolean;
}

/** Notify user to answer a pending ask tool (always, if permitted). */
export function notifyAskUserInput(options: AskUserInputNotifyOptions): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (options.muted) return;
  const preview = options.prompt
    ? `请选择：${truncatePreview(options.prompt, "请在聊天中选择一项并确认")}`
    : "请在聊天中选择一项并确认";
  showNotification(options.sessionName, {
    body: preview,
    tag: `pi-supervisor-ask-${options.sessionId}`,
  });
}

function truncatePreview(text: string | undefined, fallback: string): string {
  if (!text?.trim()) return fallback;
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function showNotification(title: string, options: { body: string; tag: string }): void {
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
  };
}
