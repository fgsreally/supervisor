import { computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useMobileViewport } from "./use-mobile-viewport";

const isFoldableViewport = useMediaQuery(
  "(min-width: 768px) and (max-width: 1199px), (horizontal-viewport-segments: 2)",
);

export function useAppLayoutMode() {
  const isMobile = useMobileViewport();
  const isFoldable = computed(() => !isMobile.value && isFoldableViewport.value);
  const isPc = computed(() => !isMobile.value && !isFoldable.value);
  const mode = computed<"mobile" | "foldable" | "pc">(() => {
    if (isMobile.value) return "mobile";
    return isFoldable.value ? "foldable" : "pc";
  });

  return { isMobile, isFoldable, isPc, mode };
}
