import { onBeforeUnmount, ref, type Ref } from "vue";

export function useDraggablePoint(options: {
  containerRef: Ref<HTMLElement | null | undefined>;
  storageKey?: string;
  defaultX?: number;
  defaultY?: number;
  margin?: number;
}) {
  const margin = options.margin ?? 12;
  const pointX = ref(options.defaultX ?? margin);
  const pointY = ref(options.defaultY ?? margin);
  const dragging = ref(false);

  if (options.storageKey && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(options.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { x?: number; y?: number };
        if (typeof parsed.x === "number") pointX.value = parsed.x;
        if (typeof parsed.y === "number") pointY.value = parsed.y;
      }
    } catch {
      // ignore corrupt storage
    }
  }

  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let moved = false;

  function persist() {
    if (!options.storageKey) return;
    localStorage.setItem(
      options.storageKey,
      JSON.stringify({ x: Math.round(pointX.value), y: Math.round(pointY.value) }),
    );
  }

  function clampToContainer() {
    const container = options.containerRef.value;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const size = 44;
    pointX.value = Math.min(
      Math.max(margin, pointX.value),
      Math.max(margin, rect.width - size - margin),
    );
    pointY.value = Math.min(
      Math.max(margin, pointY.value),
      Math.max(margin, rect.height - size - margin),
    );
  }

  function onPointerMove(event: PointerEvent) {
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    pointX.value = originX + dx;
    pointY.value = originY + dy;
    clampToContainer();
  }

  function onPointerUp() {
    dragging.value = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    document.body.style.userSelect = "";
    persist();
  }

  function startDrag(event: PointerEvent) {
    event.preventDefault();
    moved = false;
    dragging.value = true;
    startX = event.clientX;
    startY = event.clientY;
    originX = pointX.value;
    originY = pointY.value;
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function consumeClick(): boolean {
    if (moved) {
      moved = false;
      return false;
    }
    return true;
  }

  onBeforeUnmount(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  });

  return {
    pointX,
    pointY,
    dragging,
    startDrag,
    consumeClick,
    clampToContainer,
  };
}
