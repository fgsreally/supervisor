import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const playgroundCwd = path.resolve(repoRoot, "playground");
const backendTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:3042";
const backendWsTarget = backendTarget.replace(/^http/i, "ws");

function spaAwareProxy() {
  return {
    target: backendTarget,
    changeOrigin: true,
    bypass(req: { headers: { accept?: string } }) {
      return req.headers.accept?.includes("text/html") ? "/index.html" : undefined;
    },
  };
}

function apiProxy() {
  return { target: backendTarget, changeOrigin: true };
}

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      // 仅用于 PWA 安装与推送通知，不缓存静态资源
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Pi Supervisor",
        short_name: "Supervisor",
        description: "Pi Supervisor Web UI",
        theme_color: "#07c160",
        background_color: "#f5f5f5",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "favicon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: [],
        navigateFallback: undefined,
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        importScripts: ["sw-notifications.js"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "pi-supervisor-native-bridge": path.resolve(
        __dirname,
        "../pi-supervisor-native-bridge/dist/esm/index.js",
      ),
    },
  },
  define: {
    "import.meta.env.VITE_WORKSPACE_CWD": JSON.stringify(playgroundCwd),
  },
  server: {
    port: 5163,
    host: "0.0.0.0",
    strictPort: true,
    // 允许局域网 IP + 隧道域名；勿只白名单域名（会挡手机扫码）
    allowedHosts: true,
    proxy: {
      "/auth": apiProxy(),
      "/sessions": apiProxy(),
      "/external-sessions": apiProxy(),
      "/agents": apiProxy(),
      "/providers": {
        ...spaAwareProxy(),
      },
      "/projects": apiProxy(),
      "/home": {
        ...spaAwareProxy(),
      },
      "/healthz": apiProxy(),
      "/settings": {
        ...spaAwareProxy(),
      },
      "/system": apiProxy(),
      "/ws": {
        target: backendWsTarget,
        ws: true,
      },
      "/messages": apiProxy(),
      "/workspace": apiProxy(),
      "/resources": {
        ...spaAwareProxy(),
      },
      "/extensions": {
        ...spaAwareProxy(),
      },
      "/skills": apiProxy(),
      "/upload": apiProxy(),
      "/uploaded-icons": apiProxy(),
      "/devices": apiProxy(),
      "/public": apiProxy(),
    },
  },
});
