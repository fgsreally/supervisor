import { ref, onBeforeUnmount } from "vue";

export function useResizableWidth(options: {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  storageKey?: string;
}) {
  const stored =
    options.storageKey && typeof localStorage !== "undefined"
      ? Number.parseInt(localStorage.getItem(options.storageKey) ?? "", 10)
      : Number.NaN;

  const width = ref(
    Number.isFinite(stored)
      ? Math.min(options.maxWidth, Math.max(options.minWidth, stored))
      : options.defaultWidth,
  );

  let startX = 0;
  let startWidth = 0;

  function persist() {
    if (options.storageKey) {
      localStorage.setItem(options.storageKey, String(Math.round(width.value)));
    }
  }

  function onPointerMove(e: PointerEvent) {
    const next = startWidth + (e.clientX - startX);
    width.value = Math.min(options.maxWidth, Math.max(options.minWidth, next));
  }

  function onPointerUp() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    persist();
  }

  function startResize(e: PointerEvent) {
    e.preventDefault();
    startX = e.clientX;
    startWidth = width.value;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  onBeforeUnmount(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  });

  return { width, startResize };
}
