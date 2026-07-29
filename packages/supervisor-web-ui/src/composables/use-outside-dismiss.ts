import { onBeforeUnmount, onMounted, type Ref } from "vue";

export function useOutsideDismiss(
  target: Ref<HTMLElement | null>,
  dismiss: () => void,
  enabled: () => boolean = () => true,
) {
  function onPointerDown(event: PointerEvent) {
    if (!enabled()) return;
    const element = target.value;
    if (element && !element.contains(event.target as Node)) dismiss();
  }

  onMounted(() => document.addEventListener("pointerdown", onPointerDown));
  onBeforeUnmount(() => document.removeEventListener("pointerdown", onPointerDown));
}
