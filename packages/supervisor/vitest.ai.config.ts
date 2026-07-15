import { defineConfig, mergeConfig } from "vitest/config";
import shared from "./vitest.shared.js";

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ["test/**/*.ai.test.ts"],
      fileParallelism: false,
      testTimeout: Number.parseInt(process.env.AI_TEST_TIMEOUT_MS ?? "180000", 10),
      hookTimeout: Number.parseInt(process.env.AI_TEST_TIMEOUT_MS ?? "180000", 10),
    },
  }),
);
