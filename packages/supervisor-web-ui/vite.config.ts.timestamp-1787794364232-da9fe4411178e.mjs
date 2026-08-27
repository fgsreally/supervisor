// vite.config.ts
import { defineConfig } from "file:///D:/my-project/supervisor-standalone/node_modules/.pnpm/vite@5.4.21_@types+node@22._b9fc07ff3611ac682d202080ef44d5e3/node_modules/vite/dist/node/index.js";
import vue from "file:///D:/my-project/supervisor-standalone/node_modules/.pnpm/@vitejs+plugin-vue@5.2.4_vi_fb902962c3e724301cce8f293d2fcd4e/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import tailwindcss from "file:///D:/my-project/supervisor-standalone/node_modules/.pnpm/@tailwindcss+vite@4.3.2_vit_cb25b3be06308205ef08f2388c9f3de5/node_modules/@tailwindcss/vite/dist/index.mjs";
import { VitePWA } from "file:///D:/my-project/supervisor-standalone/node_modules/.pnpm/vite-plugin-pwa@1.3.0_vite@_eded7e78d34babaf471e1339f3169d68/node_modules/vite-plugin-pwa/dist/index.js";
import path from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// ../../scripts/dev-https.mjs
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { X509Certificate } from "node:crypto";
import { hostname, networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import selfsigned from "file:///D:/my-project/supervisor-standalone/node_modules/.pnpm/selfsigned@5.5.0/node_modules/selfsigned/index.js";
var __vite_injected_original_import_meta_url = "file:///D:/my-project/supervisor-standalone/scripts/dev-https.mjs";
var root = resolve(dirname(fileURLToPath(__vite_injected_original_import_meta_url)), "..");
var certificateDir = resolve(root, "playground", ".supervisor", "dev-https");
var certificatePath = resolve(certificateDir, "certificate.pem");
var privateKeyPath = resolve(certificateDir, "private-key.pem");
var caCertificatePath = resolve(certificateDir, "development-ca.pem");
var caPrivateKeyPath = resolve(certificateDir, "development-ca-private-key.pem");
var metadataPath = resolve(certificateDir, "hosts.json");
var CERTIFICATE_VERSION = 2;
function devHosts() {
  const dns = /* @__PURE__ */ new Set(["localhost", hostname(), `${hostname()}.local`]);
  const ips = /* @__PURE__ */ new Set(["127.0.0.1", "::1"]);
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (!entry.internal) ips.add(entry.address.split("%")[0]);
    }
  }
  return { dns: [...dns].sort(), ips: [...ips].sort() };
}
async function ensureDevHttpsCertificate() {
  const hosts = devHosts();
  await fs.mkdir(certificateDir, { recursive: true });
  let caCert;
  let caKey;
  try {
    [caCert, caKey] = await Promise.all([
      fs.readFile(caCertificatePath, "utf8"),
      fs.readFile(caPrivateKeyPath, "utf8")
    ]);
    if (Date.parse(new X509Certificate(caCert).validTo) <= Date.now() + 24 * 60 * 60 * 1e3) {
      throw new Error("Development CA is expired");
    }
  } catch {
    const notBeforeDate = new Date(Date.now() - 24 * 60 * 60 * 1e3);
    const notAfterDate = new Date(notBeforeDate);
    notAfterDate.setFullYear(notAfterDate.getFullYear() + 10);
    const ca = await selfsigned.generate(
      [{ name: "commonName", value: "Pi Supervisor Development CA" }],
      {
        algorithm: "sha256",
        keySize: 2048,
        notBeforeDate,
        notAfterDate,
        extensions: [
          { name: "basicConstraints", cA: true, critical: true },
          { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true }
        ]
      }
    );
    caCert = ca.cert;
    caKey = ca.private;
    await Promise.all([
      fs.writeFile(caCertificatePath, caCert, { mode: 384 }),
      fs.writeFile(caPrivateKeyPath, caKey, { mode: 384 })
    ]);
  }
  let cert;
  let key;
  try {
    const [storedCert, storedKey, storedMetadata] = await Promise.all([
      fs.readFile(certificatePath, "utf8"),
      fs.readFile(privateKeyPath, "utf8"),
      fs.readFile(metadataPath, "utf8")
    ]);
    if (storedMetadata === JSON.stringify({ version: CERTIFICATE_VERSION, hosts }) && Date.parse(new X509Certificate(storedCert).validTo) > Date.now() + 24 * 60 * 60 * 1e3) {
      cert = storedCert;
      key = storedKey;
    }
  } catch {
  }
  if (!cert || !key) {
    const notBeforeDate = new Date(Date.now() - 24 * 60 * 60 * 1e3);
    const notAfterDate = new Date(notBeforeDate);
    notAfterDate.setFullYear(notAfterDate.getFullYear() + 1);
    const pems = await selfsigned.generate([{ name: "commonName", value: hostname() }], {
      algorithm: "sha256",
      keySize: 2048,
      notBeforeDate,
      notAfterDate,
      ca: { key: caKey, cert: caCert },
      extensions: [
        { name: "basicConstraints", cA: false, critical: true },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
        { name: "extKeyUsage", serverAuth: true },
        {
          name: "subjectAltName",
          altNames: [
            ...hosts.dns.map((value) => ({ type: 2, value })),
            ...hosts.ips.map((ip) => ({ type: 7, ip }))
          ]
        }
      ]
    });
    cert = pems.cert;
    key = pems.private;
    await Promise.all([
      fs.writeFile(certificatePath, cert, { mode: 384 }),
      fs.writeFile(privateKeyPath, key, { mode: 384 }),
      fs.writeFile(metadataPath, JSON.stringify({ version: CERTIFICATE_VERSION, hosts }), {
        mode: 384
      })
    ]);
  }
  let trusted = process.platform !== "win32";
  if (process.platform === "win32") {
    const rootResult = spawnSync(
      "certutil.exe",
      ["-user", "-f", "-addstore", "Root", caCertificatePath],
      {
        encoding: "utf8",
        windowsHide: true
      }
    );
    trusted = rootResult.status === 0;
  }
  return {
    cert,
    key,
    certificatePath,
    privateKeyPath,
    caCertificatePath,
    hosts,
    trusted
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(__vite_injected_original_import_meta_url)) {
  const certificate = await ensureDevHttpsCertificate();
  console.log(`Development HTTPS certificate: ${certificate.certificatePath}`);
  if (certificate.trusted) {
    console.log(`Trusted development CA: ${certificate.caCertificatePath}`);
  } else if (process.platform === "win32") {
    const cerPath = resolve(certificateDir, "development-ca.cer");
    await fs.copyFile(certificate.caCertificatePath, cerPath);
    const wizard = spawn("rundll32.exe", ["cryptext.dll,CryptExtAddCER", cerPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    wizard.unref();
    console.warn("Confirm the Windows certificate import wizard once to trust local HTTPS.");
  }
}

// vite.unplugins.ts
import VueRouter from "file:///D:/my-project/supervisor-standalone/node_modules/.pnpm/unplugin-vue-router@0.19.2__fe42514ae6142a0e794484b171d395ec/node_modules/unplugin-vue-router/dist/vite.mjs";
import AutoImport from "file:///D:/my-project/supervisor-standalone/node_modules/.pnpm/unplugin-auto-import@21.1.0_af7b92b2925f07b42e25fb95123f197a/node_modules/unplugin-auto-import/dist/vite.mjs";
import Components from "file:///D:/my-project/supervisor-standalone/node_modules/.pnpm/unplugin-vue-components@32._91d518582622b09c46dcc112118b19a5/node_modules/unplugin-vue-components/dist/vite.mjs";
import { VueRouterAutoImports } from "file:///D:/my-project/supervisor-standalone/node_modules/.pnpm/unplugin-vue-router@0.19.2__fe42514ae6142a0e794484b171d395ec/node_modules/unplugin-vue-router/dist/index.mjs";
var vueRouterPlugin = VueRouter({
  routesFolder: "src/pages",
  dts: "src/typed-router.d.ts"
});
var autoImportPlugin = AutoImport({
  imports: [
    "vue",
    "vue-router",
    VueRouterAutoImports,
    "pinia",
    "@vueuse/core",
    { "@/i18n": ["useI18n"] }
  ],
  dts: "src/auto-imports.d.ts",
  vueTemplate: true
});
var componentsPlugin = Components({
  globs: ["src/components/base/*.vue", "src/components/base/*/index.vue"],
  globsExclude: [
    "src/components/base/ResponsiveDialog.vue",
    "src/components/base/ResponsivePopover.vue",
    "src/components/base/ResponsiveSplitSurface.vue"
  ],
  excludeNames: ["Pc", "Mobile", "Frame"],
  dts: "src/components.d.ts"
});

// vite.config.ts
var __vite_injected_original_dirname = "D:\\my-project\\supervisor-standalone\\packages\\supervisor-web-ui";
var __vite_injected_original_import_meta_url2 = "file:///D:/my-project/supervisor-standalone/packages/supervisor-web-ui/vite.config.ts";
var repoRoot = path.resolve(fileURLToPath2(new URL(".", __vite_injected_original_import_meta_url2)), "../..");
var playgroundCwd = path.resolve(repoRoot, "playground");
var backendTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:3042";
var backendWsTarget = backendTarget.replace(/^http/i, "ws");
function spaAwareProxy() {
  return {
    target: backendTarget,
    changeOrigin: true,
    bypass(req) {
      return shouldBypassFrontend(req.url ?? "", req.headers.accept);
    }
  };
}
function shouldBypassFrontend(url, accept) {
  const path2 = url.split("?")[0] ?? url;
  if (accept?.includes("text/html")) return "/index.html";
  if (path2.startsWith("/@") || path2.startsWith("/src/") || path2.startsWith("/pages/") || path2.startsWith("/node_modules/") || path2.startsWith("/assets/")) {
    return url;
  }
  if (/\.(vue|ts|tsx|js|mjs|css|map|svg|png|jpe?g|gif|webp|woff2?|ico)(\?|$)/i.test(path2)) {
    return url;
  }
  return void 0;
}
var vite_config_default = defineConfig(async ({ command }) => {
  const devHttps = command === "serve" ? await ensureDevHttpsCertificate() : void 0;
  return {
    plugins: [
      vueRouterPlugin,
      vue(),
      autoImportPlugin,
      componentsPlugin,
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
              purpose: "any"
            }
          ]
        },
        workbox: {
          globPatterns: [],
          navigateFallback: void 0,
          runtimeCaching: [],
          cleanupOutdatedCaches: true,
          importScripts: ["sw-notifications.js"]
        }
      })
    ],
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "./src"),
        "pi-supervisor-native-bridge": path.resolve(
          __vite_injected_original_dirname,
          "../pi-supervisor-native-bridge/dist/esm/index.js"
        )
      }
    },
    define: {
      "import.meta.env.VITE_WORKSPACE_CWD": JSON.stringify(playgroundCwd)
    },
    server: {
      port: 5163,
      host: "0.0.0.0",
      strictPort: true,
      ...devHttps ? { https: { cert: devHttps.cert, key: devHttps.key } } : {},
      // 允许局域网 IP + 隧道域名；勿只白名单域名（会挡手机扫码）
      allowedHosts: true,
      proxy: {
        "/ws": {
          target: backendWsTarget,
          ws: true
        },
        "^/sessions/[^/]+/preview/": {
          target: backendTarget,
          changeOrigin: true,
          ws: true
        },
        "^/.*": spaAwareProxy()
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAiLi4vLi4vc2NyaXB0cy9kZXYtaHR0cHMubWpzIiwgInZpdGUudW5wbHVnaW5zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiRDpcXFxcbXktcHJvamVjdFxcXFxzdXBlcnZpc29yLXN0YW5kYWxvbmVcXFxccGFja2FnZXNcXFxcc3VwZXJ2aXNvci13ZWItdWlcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXG15LXByb2plY3RcXFxcc3VwZXJ2aXNvci1zdGFuZGFsb25lXFxcXHBhY2thZ2VzXFxcXHN1cGVydmlzb3Itd2ViLXVpXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9teS1wcm9qZWN0L3N1cGVydmlzb3Itc3RhbmRhbG9uZS9wYWNrYWdlcy9zdXBlcnZpc29yLXdlYi11aS92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgdnVlIGZyb20gXCJAdml0ZWpzL3BsdWdpbi12dWVcIjtcbmltcG9ydCB0YWlsd2luZGNzcyBmcm9tIFwiQHRhaWx3aW5kY3NzL3ZpdGVcIjtcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tIFwidml0ZS1wbHVnaW4tcHdhXCI7XG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gXCJ1cmxcIjtcbmltcG9ydCB7IGVuc3VyZURldkh0dHBzQ2VydGlmaWNhdGUgfSBmcm9tIFwiLi4vLi4vc2NyaXB0cy9kZXYtaHR0cHMubWpzXCI7XG5pbXBvcnQgeyBhdXRvSW1wb3J0UGx1Z2luLCBjb21wb25lbnRzUGx1Z2luLCB2dWVSb3V0ZXJQbHVnaW4gfSBmcm9tIFwiLi92aXRlLnVucGx1Z2luc1wiO1xuXG5jb25zdCByZXBvUm9vdCA9IHBhdGgucmVzb2x2ZShmaWxlVVJMVG9QYXRoKG5ldyBVUkwoXCIuXCIsIGltcG9ydC5tZXRhLnVybCkpLCBcIi4uLy4uXCIpO1xuY29uc3QgcGxheWdyb3VuZEN3ZCA9IHBhdGgucmVzb2x2ZShyZXBvUm9vdCwgXCJwbGF5Z3JvdW5kXCIpO1xuY29uc3QgYmFja2VuZFRhcmdldCA9IHByb2Nlc3MuZW52LlZJVEVfQVBJX1BST1hZX1RBUkdFVCB8fCBcImh0dHA6Ly9sb2NhbGhvc3Q6MzA0MlwiO1xuY29uc3QgYmFja2VuZFdzVGFyZ2V0ID0gYmFja2VuZFRhcmdldC5yZXBsYWNlKC9eaHR0cC9pLCBcIndzXCIpO1xuXG5mdW5jdGlvbiBzcGFBd2FyZVByb3h5KCkge1xuICByZXR1cm4ge1xuICAgIHRhcmdldDogYmFja2VuZFRhcmdldCxcbiAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgYnlwYXNzKHJlcTogeyBoZWFkZXJzOiB7IGFjY2VwdD86IHN0cmluZyB9OyB1cmw/OiBzdHJpbmcgfSkge1xuICAgICAgcmV0dXJuIHNob3VsZEJ5cGFzc0Zyb250ZW5kKHJlcS51cmwgPz8gXCJcIiwgcmVxLmhlYWRlcnMuYWNjZXB0KTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiBzaG91bGRCeXBhc3NGcm9udGVuZCh1cmw6IHN0cmluZywgYWNjZXB0Pzogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgcGF0aCA9IHVybC5zcGxpdChcIj9cIilbMF0gPz8gdXJsO1xuICBpZiAoYWNjZXB0Py5pbmNsdWRlcyhcInRleHQvaHRtbFwiKSkgcmV0dXJuIFwiL2luZGV4Lmh0bWxcIjtcbiAgaWYgKFxuICAgIHBhdGguc3RhcnRzV2l0aChcIi9AXCIpIHx8XG4gICAgcGF0aC5zdGFydHNXaXRoKFwiL3NyYy9cIikgfHxcbiAgICBwYXRoLnN0YXJ0c1dpdGgoXCIvcGFnZXMvXCIpIHx8XG4gICAgcGF0aC5zdGFydHNXaXRoKFwiL25vZGVfbW9kdWxlcy9cIikgfHxcbiAgICBwYXRoLnN0YXJ0c1dpdGgoXCIvYXNzZXRzL1wiKVxuICApIHtcbiAgICByZXR1cm4gdXJsO1xuICB9XG4gIGlmICgvXFwuKHZ1ZXx0c3x0c3h8anN8bWpzfGNzc3xtYXB8c3ZnfHBuZ3xqcGU/Z3xnaWZ8d2VicHx3b2ZmMj98aWNvKShcXD98JCkvaS50ZXN0KHBhdGgpKSB7XG4gICAgcmV0dXJuIHVybDtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoYXN5bmMgKHsgY29tbWFuZCB9KSA9PiB7XG4gIGNvbnN0IGRldkh0dHBzID0gY29tbWFuZCA9PT0gXCJzZXJ2ZVwiID8gYXdhaXQgZW5zdXJlRGV2SHR0cHNDZXJ0aWZpY2F0ZSgpIDogdW5kZWZpbmVkO1xuICByZXR1cm4ge1xuICAgIHBsdWdpbnM6IFtcbiAgICAgIHZ1ZVJvdXRlclBsdWdpbixcbiAgICAgIHZ1ZSgpLFxuICAgICAgYXV0b0ltcG9ydFBsdWdpbixcbiAgICAgIGNvbXBvbmVudHNQbHVnaW4sXG4gICAgICB0YWlsd2luZGNzcygpLFxuICAgICAgVml0ZVBXQSh7XG4gICAgICAgIC8vIFx1NEVDNVx1NzUyOFx1NEU4RSBQV0EgXHU1Qjg5XHU4OEM1XHU0RTBFXHU2M0E4XHU5MDAxXHU5MDFBXHU3N0U1XHVGRjBDXHU0RTBEXHU3RjEzXHU1QjU4XHU5NzU5XHU2MDAxXHU4RDQ0XHU2RTkwXG4gICAgICAgIHJlZ2lzdGVyVHlwZTogXCJhdXRvVXBkYXRlXCIsXG4gICAgICAgIGluY2x1ZGVBc3NldHM6IFtcImZhdmljb24uc3ZnXCJdLFxuICAgICAgICBtYW5pZmVzdDoge1xuICAgICAgICAgIG5hbWU6IFwiUGkgU3VwZXJ2aXNvclwiLFxuICAgICAgICAgIHNob3J0X25hbWU6IFwiU3VwZXJ2aXNvclwiLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIlBpIFN1cGVydmlzb3IgV2ViIFVJXCIsXG4gICAgICAgICAgdGhlbWVfY29sb3I6IFwiIzA3YzE2MFwiLFxuICAgICAgICAgIGJhY2tncm91bmRfY29sb3I6IFwiI2Y1ZjVmNVwiLFxuICAgICAgICAgIGRpc3BsYXk6IFwic3RhbmRhbG9uZVwiLFxuICAgICAgICAgIHN0YXJ0X3VybDogXCIvXCIsXG4gICAgICAgICAgaWNvbnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3JjOiBcImZhdmljb24uc3ZnXCIsXG4gICAgICAgICAgICAgIHNpemVzOiBcIjUxMng1MTJcIixcbiAgICAgICAgICAgICAgdHlwZTogXCJpbWFnZS9zdmcreG1sXCIsXG4gICAgICAgICAgICAgIHB1cnBvc2U6IFwiYW55XCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIHdvcmtib3g6IHtcbiAgICAgICAgICBnbG9iUGF0dGVybnM6IFtdLFxuICAgICAgICAgIG5hdmlnYXRlRmFsbGJhY2s6IHVuZGVmaW5lZCxcbiAgICAgICAgICBydW50aW1lQ2FjaGluZzogW10sXG4gICAgICAgICAgY2xlYW51cE91dGRhdGVkQ2FjaGVzOiB0cnVlLFxuICAgICAgICAgIGltcG9ydFNjcmlwdHM6IFtcInN3LW5vdGlmaWNhdGlvbnMuanNcIl0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICBdLFxuICAgIHJlc29sdmU6IHtcbiAgICAgIGFsaWFzOiB7XG4gICAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjXCIpLFxuICAgICAgICBcInBpLXN1cGVydmlzb3ItbmF0aXZlLWJyaWRnZVwiOiBwYXRoLnJlc29sdmUoXG4gICAgICAgICAgX19kaXJuYW1lLFxuICAgICAgICAgIFwiLi4vcGktc3VwZXJ2aXNvci1uYXRpdmUtYnJpZGdlL2Rpc3QvZXNtL2luZGV4LmpzXCIsXG4gICAgICAgICksXG4gICAgICB9LFxuICAgIH0sXG4gICAgZGVmaW5lOiB7XG4gICAgICBcImltcG9ydC5tZXRhLmVudi5WSVRFX1dPUktTUEFDRV9DV0RcIjogSlNPTi5zdHJpbmdpZnkocGxheWdyb3VuZEN3ZCksXG4gICAgfSxcbiAgICBzZXJ2ZXI6IHtcbiAgICAgIHBvcnQ6IDUxNjMsXG4gICAgICBob3N0OiBcIjAuMC4wLjBcIixcbiAgICAgIHN0cmljdFBvcnQ6IHRydWUsXG4gICAgICAuLi4oZGV2SHR0cHMgPyB7IGh0dHBzOiB7IGNlcnQ6IGRldkh0dHBzLmNlcnQsIGtleTogZGV2SHR0cHMua2V5IH0gfSA6IHt9KSxcbiAgICAgIC8vIFx1NTE0MVx1OEJCOFx1NUM0MFx1NTdERlx1N0Y1MSBJUCArIFx1OTZBN1x1OTA1M1x1NTdERlx1NTQwRFx1RkYxQlx1NTJGRlx1NTNFQVx1NzY3RFx1NTQwRFx1NTM1NVx1NTdERlx1NTQwRFx1RkYwOFx1NEYxQVx1NjMyMVx1NjI0Qlx1NjczQVx1NjI2Qlx1NzgwMVx1RkYwOVxuICAgICAgYWxsb3dlZEhvc3RzOiB0cnVlLFxuICAgICAgcHJveHk6IHtcbiAgICAgICAgXCIvd3NcIjoge1xuICAgICAgICAgIHRhcmdldDogYmFja2VuZFdzVGFyZ2V0LFxuICAgICAgICAgIHdzOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBcIl4vc2Vzc2lvbnMvW14vXSsvcHJldmlldy9cIjoge1xuICAgICAgICAgIHRhcmdldDogYmFja2VuZFRhcmdldCxcbiAgICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgICAgd3M6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIFwiXi8uKlwiOiBzcGFBd2FyZVByb3h5KCksXG4gICAgICB9LFxuICAgIH0sXG4gIH07XG59KTtcbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiRDpcXFxcbXktcHJvamVjdFxcXFxzdXBlcnZpc29yLXN0YW5kYWxvbmVcXFxcc2NyaXB0c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRDpcXFxcbXktcHJvamVjdFxcXFxzdXBlcnZpc29yLXN0YW5kYWxvbmVcXFxcc2NyaXB0c1xcXFxkZXYtaHR0cHMubWpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9teS1wcm9qZWN0L3N1cGVydmlzb3Itc3RhbmRhbG9uZS9zY3JpcHRzL2Rldi1odHRwcy5tanNcIjtpbXBvcnQgeyBzcGF3biwgc3Bhd25TeW5jIH0gZnJvbSBcIm5vZGU6Y2hpbGRfcHJvY2Vzc1wiO1xuaW1wb3J0IHsgcHJvbWlzZXMgYXMgZnMgfSBmcm9tIFwibm9kZTpmc1wiO1xuaW1wb3J0IHsgWDUwOUNlcnRpZmljYXRlIH0gZnJvbSBcIm5vZGU6Y3J5cHRvXCI7XG5pbXBvcnQgeyBob3N0bmFtZSwgbmV0d29ya0ludGVyZmFjZXMgfSBmcm9tIFwibm9kZTpvc1wiO1xuaW1wb3J0IHsgZGlybmFtZSwgcmVzb2x2ZSB9IGZyb20gXCJub2RlOnBhdGhcIjtcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tIFwibm9kZTp1cmxcIjtcbmltcG9ydCBzZWxmc2lnbmVkIGZyb20gXCJzZWxmc2lnbmVkXCI7XG5cbmNvbnN0IHJvb3QgPSByZXNvbHZlKGRpcm5hbWUoZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKSwgXCIuLlwiKTtcbmNvbnN0IGNlcnRpZmljYXRlRGlyID0gcmVzb2x2ZShyb290LCBcInBsYXlncm91bmRcIiwgXCIuc3VwZXJ2aXNvclwiLCBcImRldi1odHRwc1wiKTtcbmNvbnN0IGNlcnRpZmljYXRlUGF0aCA9IHJlc29sdmUoY2VydGlmaWNhdGVEaXIsIFwiY2VydGlmaWNhdGUucGVtXCIpO1xuY29uc3QgcHJpdmF0ZUtleVBhdGggPSByZXNvbHZlKGNlcnRpZmljYXRlRGlyLCBcInByaXZhdGUta2V5LnBlbVwiKTtcbmNvbnN0IGNhQ2VydGlmaWNhdGVQYXRoID0gcmVzb2x2ZShjZXJ0aWZpY2F0ZURpciwgXCJkZXZlbG9wbWVudC1jYS5wZW1cIik7XG5jb25zdCBjYVByaXZhdGVLZXlQYXRoID0gcmVzb2x2ZShjZXJ0aWZpY2F0ZURpciwgXCJkZXZlbG9wbWVudC1jYS1wcml2YXRlLWtleS5wZW1cIik7XG5jb25zdCBtZXRhZGF0YVBhdGggPSByZXNvbHZlKGNlcnRpZmljYXRlRGlyLCBcImhvc3RzLmpzb25cIik7XG5jb25zdCBDRVJUSUZJQ0FURV9WRVJTSU9OID0gMjtcblxuZnVuY3Rpb24gZGV2SG9zdHMoKSB7XG4gIGNvbnN0IGRucyA9IG5ldyBTZXQoW1wibG9jYWxob3N0XCIsIGhvc3RuYW1lKCksIGAke2hvc3RuYW1lKCl9LmxvY2FsYF0pO1xuICBjb25zdCBpcHMgPSBuZXcgU2V0KFtcIjEyNy4wLjAuMVwiLCBcIjo6MVwiXSk7XG4gIGZvciAoY29uc3QgZW50cmllcyBvZiBPYmplY3QudmFsdWVzKG5ldHdvcmtJbnRlcmZhY2VzKCkpKSB7XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzID8/IFtdKSB7XG4gICAgICBpZiAoIWVudHJ5LmludGVybmFsKSBpcHMuYWRkKGVudHJ5LmFkZHJlc3Muc3BsaXQoXCIlXCIpWzBdKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHsgZG5zOiBbLi4uZG5zXS5zb3J0KCksIGlwczogWy4uLmlwc10uc29ydCgpIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBlbnN1cmVEZXZIdHRwc0NlcnRpZmljYXRlKCkge1xuICBjb25zdCBob3N0cyA9IGRldkhvc3RzKCk7XG4gIGF3YWl0IGZzLm1rZGlyKGNlcnRpZmljYXRlRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuICBsZXQgY2FDZXJ0O1xuICBsZXQgY2FLZXk7XG4gIHRyeSB7XG4gICAgW2NhQ2VydCwgY2FLZXldID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgZnMucmVhZEZpbGUoY2FDZXJ0aWZpY2F0ZVBhdGgsIFwidXRmOFwiKSxcbiAgICAgIGZzLnJlYWRGaWxlKGNhUHJpdmF0ZUtleVBhdGgsIFwidXRmOFwiKSxcbiAgICBdKTtcbiAgICBpZiAoRGF0ZS5wYXJzZShuZXcgWDUwOUNlcnRpZmljYXRlKGNhQ2VydCkudmFsaWRUbykgPD0gRGF0ZS5ub3coKSArIDI0ICogNjAgKiA2MCAqIDEwMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkRldmVsb3BtZW50IENBIGlzIGV4cGlyZWRcIik7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICBjb25zdCBub3RCZWZvcmVEYXRlID0gbmV3IERhdGUoRGF0ZS5ub3coKSAtIDI0ICogNjAgKiA2MCAqIDEwMDApO1xuICAgIGNvbnN0IG5vdEFmdGVyRGF0ZSA9IG5ldyBEYXRlKG5vdEJlZm9yZURhdGUpO1xuICAgIG5vdEFmdGVyRGF0ZS5zZXRGdWxsWWVhcihub3RBZnRlckRhdGUuZ2V0RnVsbFllYXIoKSArIDEwKTtcbiAgICBjb25zdCBjYSA9IGF3YWl0IHNlbGZzaWduZWQuZ2VuZXJhdGUoXG4gICAgICBbeyBuYW1lOiBcImNvbW1vbk5hbWVcIiwgdmFsdWU6IFwiUGkgU3VwZXJ2aXNvciBEZXZlbG9wbWVudCBDQVwiIH1dLFxuICAgICAge1xuICAgICAgICBhbGdvcml0aG06IFwic2hhMjU2XCIsXG4gICAgICAgIGtleVNpemU6IDIwNDgsXG4gICAgICAgIG5vdEJlZm9yZURhdGUsXG4gICAgICAgIG5vdEFmdGVyRGF0ZSxcbiAgICAgICAgZXh0ZW5zaW9uczogW1xuICAgICAgICAgIHsgbmFtZTogXCJiYXNpY0NvbnN0cmFpbnRzXCIsIGNBOiB0cnVlLCBjcml0aWNhbDogdHJ1ZSB9LFxuICAgICAgICAgIHsgbmFtZTogXCJrZXlVc2FnZVwiLCBrZXlDZXJ0U2lnbjogdHJ1ZSwgY1JMU2lnbjogdHJ1ZSwgY3JpdGljYWw6IHRydWUgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgKTtcbiAgICBjYUNlcnQgPSBjYS5jZXJ0O1xuICAgIGNhS2V5ID0gY2EucHJpdmF0ZTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICBmcy53cml0ZUZpbGUoY2FDZXJ0aWZpY2F0ZVBhdGgsIGNhQ2VydCwgeyBtb2RlOiAwbzYwMCB9KSxcbiAgICAgIGZzLndyaXRlRmlsZShjYVByaXZhdGVLZXlQYXRoLCBjYUtleSwgeyBtb2RlOiAwbzYwMCB9KSxcbiAgICBdKTtcbiAgfVxuXG4gIGxldCBjZXJ0O1xuICBsZXQga2V5O1xuICB0cnkge1xuICAgIGNvbnN0IFtzdG9yZWRDZXJ0LCBzdG9yZWRLZXksIHN0b3JlZE1ldGFkYXRhXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIGZzLnJlYWRGaWxlKGNlcnRpZmljYXRlUGF0aCwgXCJ1dGY4XCIpLFxuICAgICAgZnMucmVhZEZpbGUocHJpdmF0ZUtleVBhdGgsIFwidXRmOFwiKSxcbiAgICAgIGZzLnJlYWRGaWxlKG1ldGFkYXRhUGF0aCwgXCJ1dGY4XCIpLFxuICAgIF0pO1xuICAgIGlmIChcbiAgICAgIHN0b3JlZE1ldGFkYXRhID09PSBKU09OLnN0cmluZ2lmeSh7IHZlcnNpb246IENFUlRJRklDQVRFX1ZFUlNJT04sIGhvc3RzIH0pICYmXG4gICAgICBEYXRlLnBhcnNlKG5ldyBYNTA5Q2VydGlmaWNhdGUoc3RvcmVkQ2VydCkudmFsaWRUbykgPiBEYXRlLm5vdygpICsgMjQgKiA2MCAqIDYwICogMTAwMFxuICAgICkge1xuICAgICAgY2VydCA9IHN0b3JlZENlcnQ7XG4gICAgICBrZXkgPSBzdG9yZWRLZXk7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICAvLyBHZW5lcmF0ZSBiZWxvdyB3aGVuIHRoZSBjZXJ0aWZpY2F0ZSBpcyBtaXNzaW5nIG9yIGl0cyBuZXR3b3JrIG5hbWVzIGNoYW5nZWQuXG4gIH1cblxuICBpZiAoIWNlcnQgfHwgIWtleSkge1xuICAgIGNvbnN0IG5vdEJlZm9yZURhdGUgPSBuZXcgRGF0ZShEYXRlLm5vdygpIC0gMjQgKiA2MCAqIDYwICogMTAwMCk7XG4gICAgY29uc3Qgbm90QWZ0ZXJEYXRlID0gbmV3IERhdGUobm90QmVmb3JlRGF0ZSk7XG4gICAgbm90QWZ0ZXJEYXRlLnNldEZ1bGxZZWFyKG5vdEFmdGVyRGF0ZS5nZXRGdWxsWWVhcigpICsgMSk7XG4gICAgY29uc3QgcGVtcyA9IGF3YWl0IHNlbGZzaWduZWQuZ2VuZXJhdGUoW3sgbmFtZTogXCJjb21tb25OYW1lXCIsIHZhbHVlOiBob3N0bmFtZSgpIH1dLCB7XG4gICAgICBhbGdvcml0aG06IFwic2hhMjU2XCIsXG4gICAgICBrZXlTaXplOiAyMDQ4LFxuICAgICAgbm90QmVmb3JlRGF0ZSxcbiAgICAgIG5vdEFmdGVyRGF0ZSxcbiAgICAgIGNhOiB7IGtleTogY2FLZXksIGNlcnQ6IGNhQ2VydCB9LFxuICAgICAgZXh0ZW5zaW9uczogW1xuICAgICAgICB7IG5hbWU6IFwiYmFzaWNDb25zdHJhaW50c1wiLCBjQTogZmFsc2UsIGNyaXRpY2FsOiB0cnVlIH0sXG4gICAgICAgIHsgbmFtZTogXCJrZXlVc2FnZVwiLCBkaWdpdGFsU2lnbmF0dXJlOiB0cnVlLCBrZXlFbmNpcGhlcm1lbnQ6IHRydWUsIGNyaXRpY2FsOiB0cnVlIH0sXG4gICAgICAgIHsgbmFtZTogXCJleHRLZXlVc2FnZVwiLCBzZXJ2ZXJBdXRoOiB0cnVlIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiBcInN1YmplY3RBbHROYW1lXCIsXG4gICAgICAgICAgYWx0TmFtZXM6IFtcbiAgICAgICAgICAgIC4uLmhvc3RzLmRucy5tYXAoKHZhbHVlKSA9PiAoeyB0eXBlOiAyLCB2YWx1ZSB9KSksXG4gICAgICAgICAgICAuLi5ob3N0cy5pcHMubWFwKChpcCkgPT4gKHsgdHlwZTogNywgaXAgfSkpLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuICAgIGNlcnQgPSBwZW1zLmNlcnQ7XG4gICAga2V5ID0gcGVtcy5wcml2YXRlO1xuXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgZnMud3JpdGVGaWxlKGNlcnRpZmljYXRlUGF0aCwgY2VydCwgeyBtb2RlOiAwbzYwMCB9KSxcbiAgICAgIGZzLndyaXRlRmlsZShwcml2YXRlS2V5UGF0aCwga2V5LCB7IG1vZGU6IDBvNjAwIH0pLFxuICAgICAgZnMud3JpdGVGaWxlKG1ldGFkYXRhUGF0aCwgSlNPTi5zdHJpbmdpZnkoeyB2ZXJzaW9uOiBDRVJUSUZJQ0FURV9WRVJTSU9OLCBob3N0cyB9KSwge1xuICAgICAgICBtb2RlOiAwbzYwMCxcbiAgICAgIH0pLFxuICAgIF0pO1xuICB9XG5cbiAgbGV0IHRydXN0ZWQgPSBwcm9jZXNzLnBsYXRmb3JtICE9PSBcIndpbjMyXCI7XG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSBcIndpbjMyXCIpIHtcbiAgICBjb25zdCByb290UmVzdWx0ID0gc3Bhd25TeW5jKFxuICAgICAgXCJjZXJ0dXRpbC5leGVcIixcbiAgICAgIFtcIi11c2VyXCIsIFwiLWZcIiwgXCItYWRkc3RvcmVcIiwgXCJSb290XCIsIGNhQ2VydGlmaWNhdGVQYXRoXSxcbiAgICAgIHtcbiAgICAgICAgZW5jb2Rpbmc6IFwidXRmOFwiLFxuICAgICAgICB3aW5kb3dzSGlkZTogdHJ1ZSxcbiAgICAgIH0sXG4gICAgKTtcbiAgICB0cnVzdGVkID0gcm9vdFJlc3VsdC5zdGF0dXMgPT09IDA7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNlcnQsXG4gICAga2V5LFxuICAgIGNlcnRpZmljYXRlUGF0aCxcbiAgICBwcml2YXRlS2V5UGF0aCxcbiAgICBjYUNlcnRpZmljYXRlUGF0aCxcbiAgICBob3N0cyxcbiAgICB0cnVzdGVkLFxuICB9O1xufVxuXG5pZiAocHJvY2Vzcy5hcmd2WzFdICYmIHJlc29sdmUocHJvY2Vzcy5hcmd2WzFdKSA9PT0gZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKSB7XG4gIGNvbnN0IGNlcnRpZmljYXRlID0gYXdhaXQgZW5zdXJlRGV2SHR0cHNDZXJ0aWZpY2F0ZSgpO1xuICBjb25zb2xlLmxvZyhgRGV2ZWxvcG1lbnQgSFRUUFMgY2VydGlmaWNhdGU6ICR7Y2VydGlmaWNhdGUuY2VydGlmaWNhdGVQYXRofWApO1xuICBpZiAoY2VydGlmaWNhdGUudHJ1c3RlZCkge1xuICAgIGNvbnNvbGUubG9nKGBUcnVzdGVkIGRldmVsb3BtZW50IENBOiAke2NlcnRpZmljYXRlLmNhQ2VydGlmaWNhdGVQYXRofWApO1xuICB9IGVsc2UgaWYgKHByb2Nlc3MucGxhdGZvcm0gPT09IFwid2luMzJcIikge1xuICAgIGNvbnN0IGNlclBhdGggPSByZXNvbHZlKGNlcnRpZmljYXRlRGlyLCBcImRldmVsb3BtZW50LWNhLmNlclwiKTtcbiAgICBhd2FpdCBmcy5jb3B5RmlsZShjZXJ0aWZpY2F0ZS5jYUNlcnRpZmljYXRlUGF0aCwgY2VyUGF0aCk7XG4gICAgY29uc3Qgd2l6YXJkID0gc3Bhd24oXCJydW5kbGwzMi5leGVcIiwgW1wiY3J5cHRleHQuZGxsLENyeXB0RXh0QWRkQ0VSXCIsIGNlclBhdGhdLCB7XG4gICAgICBkZXRhY2hlZDogdHJ1ZSxcbiAgICAgIHN0ZGlvOiBcImlnbm9yZVwiLFxuICAgICAgd2luZG93c0hpZGU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHdpemFyZC51bnJlZigpO1xuICAgIGNvbnNvbGUud2FybihcIkNvbmZpcm0gdGhlIFdpbmRvd3MgY2VydGlmaWNhdGUgaW1wb3J0IHdpemFyZCBvbmNlIHRvIHRydXN0IGxvY2FsIEhUVFBTLlwiKTtcbiAgfVxufVxuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxteS1wcm9qZWN0XFxcXHN1cGVydmlzb3Itc3RhbmRhbG9uZVxcXFxwYWNrYWdlc1xcXFxzdXBlcnZpc29yLXdlYi11aVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRDpcXFxcbXktcHJvamVjdFxcXFxzdXBlcnZpc29yLXN0YW5kYWxvbmVcXFxccGFja2FnZXNcXFxcc3VwZXJ2aXNvci13ZWItdWlcXFxcdml0ZS51bnBsdWdpbnMudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L215LXByb2plY3Qvc3VwZXJ2aXNvci1zdGFuZGFsb25lL3BhY2thZ2VzL3N1cGVydmlzb3Itd2ViLXVpL3ZpdGUudW5wbHVnaW5zLnRzXCI7aW1wb3J0IFZ1ZVJvdXRlciBmcm9tIFwidW5wbHVnaW4tdnVlLXJvdXRlci92aXRlXCI7XG5pbXBvcnQgQXV0b0ltcG9ydCBmcm9tIFwidW5wbHVnaW4tYXV0by1pbXBvcnQvdml0ZVwiO1xuaW1wb3J0IENvbXBvbmVudHMgZnJvbSBcInVucGx1Z2luLXZ1ZS1jb21wb25lbnRzL3ZpdGVcIjtcbmltcG9ydCB7IFZ1ZVJvdXRlckF1dG9JbXBvcnRzIH0gZnJvbSBcInVucGx1Z2luLXZ1ZS1yb3V0ZXJcIjtcblxuZXhwb3J0IGNvbnN0IHZ1ZVJvdXRlclBsdWdpbiA9IFZ1ZVJvdXRlcih7XG4gIHJvdXRlc0ZvbGRlcjogXCJzcmMvcGFnZXNcIixcbiAgZHRzOiBcInNyYy90eXBlZC1yb3V0ZXIuZC50c1wiLFxufSk7XG5cbmV4cG9ydCBjb25zdCBhdXRvSW1wb3J0UGx1Z2luID0gQXV0b0ltcG9ydCh7XG4gIGltcG9ydHM6IFtcbiAgICBcInZ1ZVwiLFxuICAgIFwidnVlLXJvdXRlclwiLFxuICAgIFZ1ZVJvdXRlckF1dG9JbXBvcnRzLFxuICAgIFwicGluaWFcIixcbiAgICBcIkB2dWV1c2UvY29yZVwiLFxuICAgIHsgXCJAL2kxOG5cIjogW1widXNlSTE4blwiXSB9LFxuICBdLFxuICBkdHM6IFwic3JjL2F1dG8taW1wb3J0cy5kLnRzXCIsXG4gIHZ1ZVRlbXBsYXRlOiB0cnVlLFxufSk7XG5cbmV4cG9ydCBjb25zdCBjb21wb25lbnRzUGx1Z2luID0gQ29tcG9uZW50cyh7XG4gIGdsb2JzOiBbXCJzcmMvY29tcG9uZW50cy9iYXNlLyoudnVlXCIsIFwic3JjL2NvbXBvbmVudHMvYmFzZS8qL2luZGV4LnZ1ZVwiXSxcbiAgZ2xvYnNFeGNsdWRlOiBbXG4gICAgXCJzcmMvY29tcG9uZW50cy9iYXNlL1Jlc3BvbnNpdmVEaWFsb2cudnVlXCIsXG4gICAgXCJzcmMvY29tcG9uZW50cy9iYXNlL1Jlc3BvbnNpdmVQb3BvdmVyLnZ1ZVwiLFxuICAgIFwic3JjL2NvbXBvbmVudHMvYmFzZS9SZXNwb25zaXZlU3BsaXRTdXJmYWNlLnZ1ZVwiLFxuICBdLFxuICBleGNsdWRlTmFtZXM6IFtcIlBjXCIsIFwiTW9iaWxlXCIsIFwiRnJhbWVcIl0sXG4gIGR0czogXCJzcmMvY29tcG9uZW50cy5kLnRzXCIsXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBc1gsU0FBUyxvQkFBb0I7QUFDblosT0FBTyxTQUFTO0FBQ2hCLE9BQU8saUJBQWlCO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixPQUFPLFVBQVU7QUFDakIsU0FBUyxpQkFBQUEsc0JBQXFCOzs7QUNMMlIsU0FBUyxPQUFPLGlCQUFpQjtBQUMxVixTQUFTLFlBQVksVUFBVTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFVBQVUseUJBQXlCO0FBQzVDLFNBQVMsU0FBUyxlQUFlO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLE9BQU8sZ0JBQWdCO0FBTjZLLElBQU0sMkNBQTJDO0FBUXJQLElBQU0sT0FBTyxRQUFRLFFBQVEsY0FBYyx3Q0FBZSxDQUFDLEdBQUcsSUFBSTtBQUNsRSxJQUFNLGlCQUFpQixRQUFRLE1BQU0sY0FBYyxlQUFlLFdBQVc7QUFDN0UsSUFBTSxrQkFBa0IsUUFBUSxnQkFBZ0IsaUJBQWlCO0FBQ2pFLElBQU0saUJBQWlCLFFBQVEsZ0JBQWdCLGlCQUFpQjtBQUNoRSxJQUFNLG9CQUFvQixRQUFRLGdCQUFnQixvQkFBb0I7QUFDdEUsSUFBTSxtQkFBbUIsUUFBUSxnQkFBZ0IsZ0NBQWdDO0FBQ2pGLElBQU0sZUFBZSxRQUFRLGdCQUFnQixZQUFZO0FBQ3pELElBQU0sc0JBQXNCO0FBRTVCLFNBQVMsV0FBVztBQUNsQixRQUFNLE1BQU0sb0JBQUksSUFBSSxDQUFDLGFBQWEsU0FBUyxHQUFHLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQztBQUNwRSxR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QyxLQUFLLFVBQVUsYUFBYTtBQUFBLElBQ3BFO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixZQUFZO0FBQUEsTUFDWixHQUFJLFdBQVcsRUFBRSxPQUFPLEVBQUUsTUFBTSxTQUFTLE1BQU0sS0FBSyxTQUFTLElBQUksRUFBRSxJQUFJLENBQUM7QUFBQTtBQUFBLE1BRXhFLGNBQWM7QUFBQSxNQUNkLE9BQU87QUFBQSxRQUNMLE9BQU87QUFBQSxVQUNMLFFBQVE7QUFBQSxVQUNSLElBQUk7QUFBQSxRQUNOO0FBQUEsUUFDQSw2QkFBNkI7QUFBQSxVQUMzQixRQUFRO0FBQUEsVUFDUixjQUFjO0FBQUEsVUFDZCxJQUFJO0FBQUEsUUFDTjtBQUFBLFFBQ0EsUUFBUSxjQUFjO0FBQUEsTUFDeEI7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImZpbGVVUkxUb1BhdGgiLCAiX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCIsICJmaWxlVVJMVG9QYXRoIiwgInBhdGgiXQp9Cg==
