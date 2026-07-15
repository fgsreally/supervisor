import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const directory = fileURLToPath(new URL(".", import.meta.url));
const src = resolve(directory, "src");

export default defineConfig({
  resolve: {
    alias: {
      "@earendil-works/pi-supervisor/test": resolve(src, "testing/ai/index.ts"),
      "../src/db.js": resolve(src, "db/db.ts"),
      "../src/http-server.js": resolve(src, "http/http-server.ts"),
      "../src/session-manager.js": resolve(src, "core/session-manager.ts"),
      "../src/session-storage.js": resolve(src, "core/session-storage.ts"),
      "../src/session-runtime.js": resolve(src, "core/session-runtime.ts"),
      "../src/default-tools.js": resolve(src, "utils/default-tools.ts"),
      "../src/utility-llm.js": resolve(src, "utils/utility-llm.ts"),
      "../src/supervisor-settings.js": resolve(src, "utils/supervisor-settings.ts"),
    },
  },
  test: {
    globals: false,
    environment: "node",
  },
});
