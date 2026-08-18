import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/types.ts", "src/cli.ts", "src/index.ts", "src/testing/ai/index.ts"],
  format: "esm",
  bundle: true,
  splitting: false,
  sourcemap: true,
  dts: true,
  clean: true,
  outDir: "dist",
  loader: { ".md": "text" },
  outExtension: () => ({ js: ".mjs" }),
});
