/* Imported by the generated PWA service worker (vite-plugin-pwa generateSW). */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const sessionId = typeof data.sessionId === "string" ? data.sessionId : "";
  const targetUrl = sessionId
    ? new URL(`#/chat/${sessionId}`, self.registration.scope).href
    : self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          const focused = client.focus();
          if (sessionId) {
            client.postMessage({
              type: "notificationclick",
              sessionId,
              hash: `#/chat/${sessionId}`,
            });
          }
          return focused;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
