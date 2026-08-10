<template>
  <Teleport to="body">
    <Transition :name="overlayTransition">
      <div v-if="open" class="m-overlay" :class="overlayClass" @mousedown.self="onBackdropClick">
        <section
          ref="panelRef"
          class="m-drawer"
          :class="panelClasses"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          :aria-label="ariaLabel"
          :style="panelStyle"
        >
          <div
            v-if="showHandle"
            class="m-drawer__handle-bar"
            :class="{ 'm-drawer__handle-bar--resizable': canResize }"
            :aria-label="canResize ? '拖动调整高度' : undefined"
            @pointerdown="onHandlePointerDown"
          >
            <span class="m-drawer__handle" aria-hidden="true" />
          </div>
          <header v-if="showHeader" class="m-drawer__header">
            <slot name="header">
              <span v-if="title" class="m-drawer__title">{{ title }}</span>
            </slot>
            <button
              v-if="showClose"
              type="button"
              class="m-drawer__close"
              aria-label="关闭"
              @click="emit('close')"
            >
              <X />
            </button>
          </header>
          <div class="m-drawer__body" :class="bodyClass">
            <slot />
          </div>
          <div v-if="$slots.footer || showFooter" class="m-drawer__footer">
            <slot name="footer">
              <MobileButton block @click="emit('close')">{{ footerCancelText }}</MobileButton>
            </slot>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from "vue";
import MobileButton from "./MobileButton.vue";

export type MobileDrawerSize = "auto" | "tall";
export type MobileDrawerVariant = "sheet" | "modal" | "adaptive";

const props = withDefaults(
  defineProps<{
    open: boolean;
    ariaLabel: string;
    title?: string;
    /** @deprecated 使用 size="tall" */
    flush?: boolean;
    size?: MobileDrawerSize;
    variant?: MobileDrawerVariant;
    resizable?: boolean;
    showFooter?: boolean;
    showClose?: boolean;
    footerCancelText?: string;
    dismissOnBackdrop?: boolean;
    bodyClass?: string;
    panelClass?: string;
    minHeight?: number;
    maxHeightRatio?: number;
    modalBreakpoint?: number;
  }>(),
  {
    flush: false,
    size: undefined,
    variant: "sheet",
    showFooter: false,
    showClose: false,
    footerCancelText: "取消",
    dismissOnBackdrop: true,
    minHeight: 240,
    maxHeightRatio: 0.94,
    modalBreakpoint: 720,
  },
);

const emit = defineEmits<{ close: [] }>();

const slots = useSlots();
const panelRef = ref<HTMLElement | null>(null);
const heightPx = ref<number | null>(null);
const sheetMode = ref(true);
let previousFocus: HTMLElement | null = null;
let startY = 0;
let startHeight = 0;

const resolvedSize = computed<MobileDrawerSize>(() => {
  if (props.size) return props.size;
  return props.flush ? "tall" : "auto";
});

const isTall = computed(() => resolvedSize.value === "tall");

const canResize = computed(() => {
  if (!sheetMode.value) return false;
  if (props.resizable != null) return props.resizable;
  return isTall.value;
});

/** Sheet 模式始终展示把手（对齐会话工具菜单）；仅可调整高度时响应拖拽。 */
const showHandle = computed(() => sheetMode.value);

const showHeader = computed(() =>
  Boolean(slots.header || props.title || (!sheetMode.value && props.showClose)),
);

const overlayClass = computed(() => (sheetMode.value ? "m-overlay--sheet" : "m-overlay--modal"));

const overlayTransition = computed(() => (sheetMode.value ? "m-overlay" : "m-overlay"));

const panelClasses = computed(() => [
  {
    "m-drawer--tall": isTall.value && sheetMode.value,
    "m-drawer--flush": isTall.value && sheetMode.value,
    "m-drawer--auto": !isTall.value && sheetMode.value,
    "m-drawer--modal": !sheetMode.value,
  },
  props.panelClass,
]);

const panelStyle = computed(() => {
  if (heightPx.value == null) return undefined;
  return { height: `${heightPx.value}px` };
});

function syncVariant() {
  if (props.variant === "sheet") {
    sheetMode.value = true;
    return;
  }
  if (props.variant === "modal") {
    sheetMode.value = false;
    return;
  }
  sheetMode.value = window.matchMedia(`(max-width: ${props.modalBreakpoint}px)`).matches;
}

function onBackdropClick() {
  if (props.dismissOnBackdrop) emit("close");
}

function onHandlePointerDown(event: PointerEvent) {
  if (!canResize.value) return;
  startResize(event);
}

function startResize(event: PointerEvent) {
  if (!panelRef.value || !canResize.value) return;
  event.preventDefault();
  startY = event.clientY;
  startHeight = panelRef.value.getBoundingClientRect().height;
  document.addEventListener("pointermove", onResizeMove);
  document.addEventListener("pointerup", stopResize, { once: true });
}

function onResizeMove(event: PointerEvent) {
  const maxHeight = window.innerHeight * props.maxHeightRatio;
  heightPx.value = Math.round(
    Math.min(maxHeight, Math.max(props.minHeight, startHeight + startY - event.clientY)),
  );
}

function stopResize() {
  document.removeEventListener("pointermove", onResizeMove);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

watch(
  () => props.open,
  async (open) => {
    if (open) syncVariant();
    if (open) heightPx.value = null;
    document.body.classList.toggle("m-overlay-open", open);
    if (open) {
      previousFocus = document.activeElement as HTMLElement | null;
      document.addEventListener("keydown", onKeydown);
      await nextTick();
      // Prefer a text field when present; otherwise focus the panel (not the first
      // button) so action sheets don't show a focus ring on「置顶」etc.
      const field = panelRef.value?.querySelector<HTMLElement>(
        "input:not([type='hidden']):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable='true']",
      );
      (field ?? panelRef.value)?.focus({ preventScroll: true });
    } else {
      document.removeEventListener("keydown", onKeydown);
      previousFocus?.focus();
    }
  },
);

if (typeof window !== "undefined") {
  syncVariant();
  window.addEventListener("resize", syncVariant, { passive: true });
}

onBeforeUnmount(() => {
  document.body.classList.remove("m-overlay-open");
  document.removeEventListener("keydown", onKeydown);
  stopResize();
  window.removeEventListener("resize", syncVariant);
});
</script>
