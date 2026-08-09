import { registerSW } from "virtual:pwa-register";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./style.css";
import { initAppTheme } from "./composables/use-app-theme";
import { initAppStyle } from "./composables/use-app-style";
import { initAppFontScale } from "./composables/use-app-font-scale";
import { requestNotificationPermission } from "./composables/use-notifications";
import { initNativeShell } from "./native/bootstrap";

initAppTheme();
void initAppStyle();
initAppFontScale();

if (import.meta.env.DEV) {
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      );
  }
  if ("caches" in window) {
    void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
  }
} else {
  registerSW({ immediate: true });
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");

void initNativeShell();

window.addEventListener(
  "click",
  () => {
    void requestNotificationPermission();
  },
  { once: true },
);
