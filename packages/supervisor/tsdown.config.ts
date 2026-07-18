import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/types.ts",
    "src/cli.ts",
    "src/index.ts",
    "src/testing/ai/index.ts",
    "src/core/external/claude-permission-bridge.ts",
  ],
  format: "esm",
  dts: { transformer: "oxc" },
  clean: false,
  outDir: "dist",
});
