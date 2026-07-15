import { defineConfig, mergeConfig } from "vitest/config";
import shared from "./vitest.shared.js";

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ["test/**/*.test.ts"],
      exclude: ["test/**/*.ai.test.ts"],
      testTimeout: 60_000,
    },
  }),
);
