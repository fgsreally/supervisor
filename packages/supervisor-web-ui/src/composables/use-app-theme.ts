import { computed, ref } from "vue";

const STORAGE_KEY = "pi-example-theme";

const isDark = ref(false);
let initialized = false;

function readInitialDark(): boolean {
  if (typeof localStorage === "undefined") return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark") return true;
  if (stored === "light") return false;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return true;
  }
  return false;
}

function applyTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = isDark.value ? "dark" : "light";
}

export function initAppTheme() {
  if (initialized) return;
  initialized = true;
  isDark.value = readInitialDark();
  applyTheme();
}

export function useAppTheme() {
  if (!initialized) initAppTheme();

  const theme = computed(() => (isDark.value ? "dark" : "light"));

  function commitDark(value: boolean) {
    isDark.value = value;
    localStorage.setItem(STORAGE_KEY, value ? "dark" : "light");
    applyTheme();
  }

  function setDark(value: boolean, origin?: { x: number; y: number }) {
    if (typeof document === "undefined" || value === isDark.value) return;
    const viewTransitions = document as Document & {
      startViewTransition?: (update: () => void) => { ready: Promise<void> };
    };
    if (typeof viewTransitions.startViewTransition !== "function") {
      commitDark(value);
      return;
    }
    const transition = viewTransitions.startViewTransition(() => commitDark(value));
    void transition.ready.then(() => {
      const x = origin?.x ?? window.innerWidth / 2;
      const y = origin?.y ?? window.innerHeight / 2;
      const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );
      document.documentElement.animate(
        { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 420,
          easing: "linear",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });
  }

  function toggleDark(event?: MouseEvent) {
    setDark(!isDark.value, event ? { x: event.clientX, y: event.clientY } : undefined);
  }

  return { isDark, theme, setDark, toggleDark };
}
