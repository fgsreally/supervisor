import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/types.ts", "src/cli.ts", "src/index.ts", "src/testing/ai/index.ts"],
  format: "esm",
  deps: { neverBundle: [/^bun:/] },
  dts: { transformer: "oxc" },
  clean: true,
  outDir: "dist",
});
