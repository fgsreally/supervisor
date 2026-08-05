<template>
  <Teleport to="body">
    <Transition :name="transitionName">
      <div
        v-if="open"
        class="responsive-dialog-overlay"
        :class="{ 'responsive-dialog-overlay--sheet': sheet }"
        @mousedown.self="emit('close')"
      >
        <section
          ref="panel"
          class="responsive-dialog"
          :class="{ 'responsive-dialog--sheet': sheet }"
          :style="sheetHeight ? { height: `${sheetHeight}px` } : undefined"
          role="dialog"
          aria-modal="true"
          :aria-label="title || 'Dialog'"
        >
          <div
            v-if="sheet"
            class="responsive-dialog__handle-zone"
            aria-label="拖动调整弹窗高度"
            @pointerdown="startResize"
          >
            <div class="responsive-dialog__handle" />
          </div>
          <header v-if="title || $slots.header" class="responsive-dialog__header">
            <slot name="header">
              <h2>{{ title }}</h2>
            </slot>
            <button
              class="responsive-dialog__close"
              type="button"
              aria-label="关闭"
              @click="emit('close')"
            >
              <X />
            </button>
          </header>
          <div class="responsive-dialog__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="responsive-dialog__footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { X } from "lucide-vue-next";

const props = defineProps<{ open: boolean; title?: string }>();
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
const sheet = ref(false);
const sheetHeight = ref<number | null>(null);
let previousFocus: HTMLElement | null = null;
let resizeStartY = 0;
let resizeStartHeight = 0;

const transitionName = computed(() => (sheet.value ? "responsive-sheet" : "responsive-modal"));

function syncMode() {
  sheet.value = window.matchMedia("(max-width: 720px)").matches;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

function startResize(event: PointerEvent) {
  if (!sheet.value || !panel.value) return;
  event.preventDefault();
  resizeStartY = event.clientY;
  resizeStartHeight = panel.value.getBoundingClientRect().height;
  document.addEventListener("pointermove", resizeSheet);
  document.addEventListener("pointerup", stopResize, { once: true });
}

function resizeSheet(event: PointerEvent) {
  const min = Math.min(280, window.innerHeight * 0.45);
  const max = window.innerHeight * 0.92;
  sheetHeight.value = Math.round(
    Math.min(max, Math.max(min, resizeStartHeight + resizeStartY - event.clientY)),
  );
}

function stopResize() {
  document.removeEventListener("pointermove", resizeSheet);
}

watch(
  () => props.open,
  async (open) => {
    if (open) syncMode();
    document.body.classList.toggle("m-overlay-open", open);
    if (open) {
      sheetHeight.value = null;
      previousFocus = document.activeElement as HTMLElement | null;
      document.addEventListener("keydown", onKeydown);
      await nextTick();
      panel.value
        ?.querySelector<HTMLElement>("button, input, textarea, select, [tabindex]")
        ?.focus();
    } else {
      document.removeEventListener("keydown", onKeydown);
      previousFocus?.focus();
    }
  },
);

if (typeof window !== "undefined") {
  syncMode();
  window.addEventListener("resize", syncMode, { passive: true });
}

onBeforeUnmount(() => {
  document.body.classList.remove("m-overlay-open");
  document.removeEventListener("keydown", onKeydown);
  stopResize();
  window.removeEventListener("resize", syncMode);
});
</script>

<style scoped>
.responsive-dialog-overlay {
  position: fixed;
  z-index: 190;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 48%);
}

.responsive-dialog-overlay--sheet {
  align-items: end;
  padding: 0;
  background: rgb(0 0 0 / 38%);
}

.responsive-dialog {
  position: relative;
  display: flex;
  width: min(720px, calc(100vw - 24px));
  max-height: min(86dvh, 760px);
  flex-direction: column;
  overflow: hidden;
  border-radius: 13px;
  color: var(--app-text-primary);
  background: var(--app-settings-card);
  box-shadow: 0 18px 55px rgb(0 0 0 / 22%);
}

.responsive-dialog--sheet {
  width: 100%;
  max-height: min(82dvh, 720px);
  border-radius: 16px 16px 0 0;
  background: var(--m-surface, var(--app-settings-card));
  box-shadow: 0 -8px 32px rgb(0 0 0 / 18%);
}

.responsive-dialog__handle-zone {
  display: grid;
  min-height: 24px;
  flex: none;
  place-items: center;
  cursor: ns-resize;
  touch-action: none;
}

.responsive-dialog__handle {
  width: 36px;
  height: 4px;
  flex: none;
  margin: 0 auto;
  border-radius: 999px;
  background: var(--app-border);
}

.responsive-dialog__header {
  display: flex;
  min-height: 52px;
  align-items: center;
  gap: 12px;
  padding: 14px 20px 8px;
}

.responsive-dialog__header h2 {
  min-width: 0;
  flex: 1;
  font-size: 16px;
  font-weight: 650;
}

.responsive-dialog--sheet .responsive-dialog__header {
  padding-top: 8px;
}

.responsive-dialog__close {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 999px;
  color: var(--app-text-secondary);
}

.responsive-dialog__close:active {
  background: var(--m-pressed, var(--app-hover));
}

.responsive-dialog__close svg {
  width: 18px;
  height: 18px;
}

.responsive-dialog__body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 0 20px 18px;
}

.responsive-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex: none;
  padding: 12px 20px;
  border-top: 1px solid var(--app-border-subtle);
}

.responsive-dialog--sheet .responsive-dialog__footer {
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}

.responsive-modal-enter-active,
.responsive-modal-leave-active,
.responsive-sheet-enter-active,
.responsive-sheet-leave-active {
  transition: opacity 180ms ease;
}

.responsive-modal-enter-active .responsive-dialog,
.responsive-modal-leave-active .responsive-dialog {
  transition:
    transform 180ms ease,
    opacity 180ms ease;
}

.responsive-sheet-enter-active .responsive-dialog,
.responsive-sheet-leave-active .responsive-dialog {
  transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.responsive-modal-enter-from,
.responsive-modal-leave-to,
.responsive-sheet-enter-from,
.responsive-sheet-leave-to {
  opacity: 0;
}

.responsive-modal-enter-from .responsive-dialog,
.responsive-modal-leave-to .responsive-dialog {
  opacity: 0;
  transform: scale(0.96);
}

.responsive-sheet-enter-from .responsive-dialog,
.responsive-sheet-leave-to .responsive-dialog {
  transform: translateY(100%);
}

@media (prefers-reduced-motion: reduce) {
  .responsive-modal-enter-active,
  .responsive-modal-leave-active,
  .responsive-sheet-enter-active,
  .responsive-sheet-leave-active,
  .responsive-modal-enter-active .responsive-dialog,
  .responsive-modal-leave-active .responsive-dialog,
  .responsive-sheet-enter-active .responsive-dialog,
  .responsive-sheet-leave-active .responsive-dialog {
    transition: none;
  }
}
</style>
