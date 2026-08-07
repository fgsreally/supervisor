import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const playgroundCwd = path.resolve(repoRoot, "playground");
const backendTarget = "http://localhost:3030";

function spaAwareProxy() {
  return {
    target: backendTarget,
    changeOrigin: true,
    bypass(req: { headers: { accept?: string } }) {
      return req.headers.accept?.includes("text/html") ? "/index.html" : undefined;
    },
  };
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
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
      "/auth": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
      "/sessions": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
      "/external-sessions": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
      "/agents": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
      "/providers": {
        ...spaAwareProxy(),
      },
      "/projects": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
      "/home": {
        ...spaAwareProxy(),
      },
      "/healthz": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
      "/settings": {
        ...spaAwareProxy(),
      },
      "/ws": {
        target: "ws://localhost:3030",
        ws: true,
      },
      "/messages": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
      "/workspace": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
      "/resources": {
        ...spaAwareProxy(),
      },
      "/extensions": {
        ...spaAwareProxy(),
      },
      "/skills": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
      "/upload": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
      "/uploaded-icons": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
      "/public": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
    },
  },
});
