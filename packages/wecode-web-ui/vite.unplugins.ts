import VueRouter from "unplugin-vue-router/vite";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { VueRouterAutoImports } from "unplugin-vue-router";

export const vueRouterPlugin = VueRouter({
  routesFolder: "src/pages",
  dts: "src/typed-router.d.ts",
});

export const autoImportPlugin = AutoImport({
  imports: [
    "vue",
    "vue-router",
    VueRouterAutoImports,
    "pinia",
    "@vueuse/core",
    { "@/i18n": ["useI18n"] },
  ],
  dts: "src/auto-imports.d.ts",
  vueTemplate: true,
});

export const componentsPlugin = Components({
  globs: ["src/components/base/*.vue", "src/components/base/*/index.vue"],
  globsExclude: [
    "src/components/base/ResponsiveDialog.vue",
    "src/components/base/ResponsivePopover.vue",
    "src/components/base/ResponsiveSplitSurface.vue",
  ],
  excludeNames: ["Pc", "Mobile", "Frame"],
  dts: "src/components.d.ts",
});
