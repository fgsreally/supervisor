import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";
import { autoImportPlugin, componentsPlugin, vueRouterPlugin } from "./vite.unplugins";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const playgroundCwd = path.resolve(repoRoot, "playground");
const backendTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:3042";
const backendWsTarget = backendTarget.replace(/^http/i, "ws");

function spaAwareProxy() {
  return {
    target: backendTarget,
    changeOrigin: true,
    bypass(req: { headers: { accept?: string }; url?: string }) {
      return shouldBypassFrontend(req.url ?? "", req.headers.accept);
    },
  };
}

function shouldBypassFrontend(url: string, accept?: string): string | undefined {
  const path = url.split("?")[0] ?? url;
  if (accept?.includes("text/html")) return "/index.html";
  if (
    path.startsWith("/@") ||
    path.startsWith("/src/") ||
    path.startsWith("/pages/") ||
    path.startsWith("/node_modules/") ||
    path.startsWith("/assets/")
  ) {
    return url;
  }
  if (/\.(vue|ts|tsx|js|mjs|css|map|svg|png|jpe?g|gif|webp|woff2?|ico)(\?|$)/i.test(path)) {
    return url;
  }
  return undefined;
}

export default defineConfig({
  plugins: [vueRouterPlugin, vue(), autoImportPlugin, componentsPlugin, tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "wecode-native-bridge": path.resolve(__dirname, "../wecode-native-bridge/dist/esm/index.js"),
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
      "/ws": {
        target: backendWsTarget,
        ws: true,
      },
      "^/sessions/[^/]+/preview/": {
        target: backendTarget,
        changeOrigin: true,
        ws: true,
      },
      "^/.*": spaAwareProxy(),
    },
  },
});
