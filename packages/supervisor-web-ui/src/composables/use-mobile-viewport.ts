import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

const QUERY = "(max-width: 767px)";

/** Reactive mobile viewport flag shared by popover → sheet adaptations. */
function readIsMobile(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

export function useMobileViewport(): Ref<boolean> {
  const isMobile = ref(readIsMobile());

  let media: MediaQueryList | null = null;
  const onChange = () => {
    if (media) isMobile.value = media.matches;
  };

  onMounted(() => {
    if (typeof window.matchMedia !== "function") return;
    media = window.matchMedia(QUERY);
    isMobile.value = media.matches;
    media.addEventListener("change", onChange);
  });

  onBeforeUnmount(() => {
    media?.removeEventListener("change", onChange);
  });

  return isMobile;
}
