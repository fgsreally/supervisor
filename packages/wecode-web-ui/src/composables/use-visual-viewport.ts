/** Keep layout height in sync with the visual viewport (soft keyboard). */

let initialized = false;

function syncVisualViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const root = document.documentElement;
  const vv = window.visualViewport;
  const height = Math.round(vv?.height ?? window.innerHeight);
  const offsetTop = Math.round(vv?.offsetTop ?? 0);
  const keyboardInset = Math.max(0, window.innerHeight - height - offsetTop);

  root.style.setProperty("--app-vv-height", `${height}px`);
  root.style.setProperty("--app-vv-offset-top", `${offsetTop}px`);
  root.style.setProperty("--app-keyboard-inset", `${keyboardInset}px`);
  root.classList.toggle("vv-keyboard-open", keyboardInset > 80);
}

export function initVisualViewport() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  syncVisualViewport();
  window.addEventListener("resize", syncVisualViewport);
  window.visualViewport?.addEventListener("resize", syncVisualViewport);
  window.visualViewport?.addEventListener("scroll", syncVisualViewport);
}
