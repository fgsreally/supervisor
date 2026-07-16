import { registerSW } from "virtual:pwa-register";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./style.css";
import { initAppTheme } from "./composables/use-app-theme";
import { requestNotificationPermission } from "./composables/use-push-notifications";

initAppTheme();

registerSW({ immediate: true });

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");

window.addEventListener(
  "click",
  () => {
    void requestNotificationPermission();
  },
  { once: true },
);
