import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@earendil-works/pi-supervisor": path.resolve(
        root,
        "../../packages/supervisor/src/extension-system/index.ts",
      ),
    },
  },
  test: {
    environment: "node",
  },
});
