import type { RendererElement } from "vue";
import { computed, nextTick } from "vue";
import {
  canUseDustEffect,
  collapseDustElement,
  dustAssemble,
  dustVanish,
} from "@/utils/dust-effect";
import { viewPreferences } from "@/utils/view-preferences";

export function isAdvancedAnimationEnabled(): boolean {
  return viewPreferences.advancedAnimations && canUseDustEffect();
}

function waitForLayout(): Promise<void> {
  return nextTick().then(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
}

/** Basic leave: slide left + fade, then collapse height so the slot frees cleanly. */
function slideLeaveElement(el: HTMLElement, duration = 280): Promise<void> {
  const height = el.getBoundingClientRect().height;
  const styles = getComputedStyle(el);
  const marginTop = Number.parseFloat(styles.marginTop) || 0;
  const marginBottom = Number.parseFloat(styles.marginBottom) || 0;
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;

  el.style.overflow = "hidden";
  el.style.pointerEvents = "none";
  el.style.boxSizing = "border-box";
  el.style.flexGrow = "0";
  el.style.flexShrink = "0";

  if (height < 1) {
    el.style.height = "0px";
    el.style.minHeight = "0px";
    el.style.opacity = "0";
    return Promise.resolve();
  }

  return el
    .animate(
      [
        {
          opacity: 1,
          transform: "translateX(0)",
          height: `${height}px`,
          marginTop: `${marginTop}px`,
          marginBottom: `${marginBottom}px`,
          paddingTop: `${paddingTop}px`,
          paddingBottom: `${paddingBottom}px`,
        },
        {
          opacity: 0,
          transform: "translateX(-32px)",
          height: `${height}px`,
          marginTop: `${marginTop}px`,
          marginBottom: `${marginBottom}px`,
          paddingTop: `${paddingTop}px`,
          paddingBottom: `${paddingBottom}px`,
          offset: 0.7,
        },
        {
          opacity: 0,
          transform: "translateX(-32px)",
          height: "0px",
          marginTop: "0px",
          marginBottom: "0px",
          paddingTop: "0px",
          paddingBottom: "0px",
        },
      ],
      {
        duration,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      },
    )
    .finished.then(() => {
      el.style.height = "0px";
      el.style.minHeight = "0px";
      el.style.opacity = "0";
      el.style.marginTop = "0px";
      el.style.marginBottom = "0px";
      el.style.paddingTop = "0px";
      el.style.paddingBottom = "0px";
    })
    .catch(() => {
      el.style.height = "0px";
      el.style.minHeight = "0px";
      el.style.opacity = "0";
    });
}

function forceCollapsed(el: HTMLElement) {
  el.style.height = "0px";
  el.style.minHeight = "0px";
  el.style.overflow = "hidden";
  el.style.margin = "0";
  el.style.padding = "0";
  el.style.opacity = "0";
  el.style.borderWidth = "0";
}

/** JS hooks for Vue `<Transition>` / `<TransitionGroup>` when advanced animations are on. */
export function useDustTransitionHooks(options?: { duration?: number; step?: number }) {
  const advanced = computed(() => isAdvancedAnimationEnabled());

  function onLeave(el: RendererElement, done: () => void) {
    if (!(el instanceof HTMLElement)) {
      done();
      return;
    }

    // Already animated by withDustRemove — must call done() or the node stays in the
    // TransitionGroup forever (that was the blank "站着位置" hole).
    if (el.dataset.dustLeaveDone === "1") {
      forceCollapsed(el);
      done();
      return;
    }

    // CSS mode still needs a fallback: grid parents can swallow transitionend
    // and leave an invisible full-height row.
    if (!advanced.value) {
      const safetyTimer = window.setTimeout(() => {
        forceCollapsed(el);
        done();
      }, 400);
      el.addEventListener(
        "animationend",
        () => {
          window.clearTimeout(safetyTimer);
          forceCollapsed(el);
          done();
        },
        { once: true },
      );
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(safetyTimer);
      done();
    };
    const safetyTimer = window.setTimeout(finish, 700);

    void dustVanish(el, {
      duration: options?.duration,
      step: options?.step,
      collapse: true,
      collapseAt: 0,
      onCollapsed: finish,
    })
      .catch(() => undefined)
      .finally(finish);
  }

  function onEnter(el: RendererElement, done: () => void) {
    if (!advanced.value) return;
    if (!(el instanceof HTMLElement)) {
      done();
      return;
    }
    void (async () => {
      try {
        await waitForLayout();
        await dustAssemble(el, {
          duration: options?.duration,
          step: options?.step,
          collapse: true,
        });
      } catch {
        el.style.visibility = "";
      } finally {
        done();
      }
    })();
  }

  return {
    advanced,
    /** When true, keep CSS name transitions; when false, dust JS hooks own the animation. */
    useCss: computed(() => !advanced.value),
    onLeave,
    onEnter,
  };
}

/**
 * Imperative remove for delete:
 * 1) play leave animation while the row is still mounted
 * 2) mark dustLeaveDone so TransitionGroup leave only calls done() (no second anim, no hole)
 * 3) run action (store delete)
 */
export async function withDustRemove(
  el: HTMLElement | null | undefined,
  action: () => void | Promise<void>,
): Promise<void> {
  if (!el) {
    await action();
    return;
  }
  el.dataset.dustLeaveDone = "1";
  if (isAdvancedAnimationEnabled()) {
    try {
      await dustVanish(el, { collapse: true, collapseAt: 0 });
    } catch {
      await collapseDustElement(el, 160).catch(() => undefined);
    }
  } else {
    await slideLeaveElement(el, 280);
  }
  await action();
}

/** Imperative restore/enter after the element is in the DOM. */
export async function withDustRestore(el: HTMLElement | null | undefined): Promise<void> {
  if (!el || !isAdvancedAnimationEnabled()) return;
  try {
    await waitForLayout();
    await dustAssemble(el, { collapse: true });
  } catch {
    el.style.visibility = "";
  }
}

export function queryDustTarget(selector: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(selector);
}
