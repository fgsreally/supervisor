import router from "@/router";

let navigationBound = false;

/** Match the existing native / Notification click contract: `#/chat/{sessionId}`. */
export function navigateToSessionFromNotification(sessionId: string): void {
  if (!sessionId || typeof window === "undefined") return;
  window.location.hash = `#/chat/${sessionId}`;
}

export function consumeNotificationChatHash(): void {
  if (typeof window === "undefined") return;
  const match = window.location.hash.match(/^#\/chat\/([^/?#]+)/);
  if (!match?.[1]) return;
  const sessionId = decodeURIComponent(match[1]);
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", `${pathname}${search}`);
  void router.push(`/chat/${sessionId}`);
}

export function bindNotificationNavigation(): void {
  if (navigationBound || typeof window === "undefined") return;
  navigationBound = true;
  consumeNotificationChatHash();
  window.addEventListener("hashchange", consumeNotificationChatHash);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
      const sessionId = event.data?.sessionId;
      if (event.data?.type === "notificationclick" && sessionId) {
        navigateToSessionFromNotification(String(sessionId));
      }
    });
  }
}

export function isSessionRouteOpen(sessionId: string): boolean {
  const path = router.currentRoute.value.path;
  return path === `/chat/${sessionId}`;
}

export function isDocumentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/** Currently open chat and the page is visible (desktop tab / in-app WebView). */
export function isCurrentlyOpenVisibleSession(sessionId: string): boolean {
  return isDocumentVisible() && isSessionRouteOpen(sessionId);
}
