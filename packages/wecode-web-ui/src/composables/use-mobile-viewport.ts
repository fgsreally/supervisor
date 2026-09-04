import { useMediaQuery } from "@vueuse/core";
import type { Ref } from "vue";

const QUERY = "(max-width: 767px)";

/** Reactive mobile viewport flag shared by popover → sheet adaptations. */
export function useMobileViewport(): Ref<boolean> {
  return useMediaQuery(QUERY);
}
