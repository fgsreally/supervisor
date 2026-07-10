import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const src = resolve(__dirname, "src");

export default defineConfig({
  resolve: {
    alias: {
      "../src/db.js": resolve(src, "db/db.ts"),
      "../src/http-server.js": resolve(src, "http/http-server.ts"),
      "../src/git-worktree.js": resolve(src, "git/git-worktree.ts"),
      "../src/session-git-hooks.js": resolve(src, "core/session-git-hooks.ts"),
      "../src/session-manager.js": resolve(src, "core/session-manager.ts"),
      "../src/session-storage.js": resolve(src, "core/session-storage.ts"),
      "../src/session-runtime.js": resolve(src, "core/session-runtime.ts"),
      "../src/session-checkpoint.js": resolve(src, "core/session-checkpoint.ts"),
      "../src/session-branch.js": resolve(src, "core/session-branch.ts"),
      "../src/turn-file-tracker.js": resolve(src, "git/turn-file-tracker.ts"),
      "../src/default-tools.js": resolve(src, "utils/default-tools.ts"),
      "../src/utility-llm.js": resolve(src, "utils/utility-llm.ts"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.itest.ts"],
  },
});
