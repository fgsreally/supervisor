import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { autoImportPlugin, componentsPlugin, vueRouterPlugin } from "./vite.unplugins";

export default defineConfig({
  plugins: [vueRouterPlugin, vue(), autoImportPlugin, componentsPlugin],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test-setup.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
