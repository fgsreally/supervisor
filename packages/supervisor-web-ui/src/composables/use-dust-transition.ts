import type { RendererElement } from "vue";
import { computed } from "vue";
import { canUseDustEffect, dustAssemble, dustVanish } from "@/utils/dust-effect";
import { viewPreferences } from "@/utils/view-preferences";

export function isAdvancedAnimationEnabled(): boolean {
  return viewPreferences.advancedAnimations && canUseDustEffect();
}

/** JS hooks for Vue `<Transition>` / `<TransitionGroup>` when advanced animations are on. */
export function useDustTransitionHooks(options?: { duration?: number; step?: number }) {
  const advanced = computed(() => isAdvancedAnimationEnabled());

  function onLeave(el: RendererElement, done: () => void) {
    if (!advanced.value || !(el instanceof HTMLElement)) {
      done();
      return;
    }
    void dustVanish(el, {
      duration: options?.duration,
      step: options?.step,
      collapse: true,
    })
      .catch(() => undefined)
      .finally(done);
  }

  function onEnter(el: RendererElement, done: () => void) {
    if (!advanced.value || !(el instanceof HTMLElement)) {
      done();
      return;
    }
    void dustAssemble(el, {
      duration: options?.duration,
      step: options?.step,
      collapse: true,
    })
      .catch(() => {
        el.style.visibility = "";
      })
      .finally(done);
  }

  return {
    advanced,
    /** When true, keep CSS name transitions; when false, dust JS hooks own the animation. */
    useCss: computed(() => !advanced.value),
    onLeave,
    onEnter,
  };
}

/** Imperative remove: play dust (if enabled) then run `action`. */
export async function withDustRemove(
  el: HTMLElement | null | undefined,
  action: () => void | Promise<void>,
): Promise<void> {
  if (!el || !isAdvancedAnimationEnabled()) {
    await action();
    return;
  }
  try {
    await dustVanish(el, { collapse: true });
  } catch {
    // fall through to action
  }
  await action();
}

/** Imperative restore/enter after the element is in the DOM. */
export async function withDustRestore(el: HTMLElement | null | undefined): Promise<void> {
  if (!el || !isAdvancedAnimationEnabled()) return;
  try {
    await dustAssemble(el, { collapse: true });
  } catch {
    el.style.visibility = "";
  }
}

export function queryDustTarget(selector: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(selector);
}
