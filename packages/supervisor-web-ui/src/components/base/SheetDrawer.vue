<template>
  <Teleport to="body">
    <Transition :name="overlayTransition">
      <div v-if="open" class="m-overlay" :class="overlayClass" @click.self="onBackdropClick">
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
            :aria-label="canResize ? t('mobile.resizeHeight') : undefined"
            @pointerdown="onHandlePointerDown"
          >
            <span class="m-drawer__handle" aria-hidden="true" />
          </div>
          <header v-if="showHeader" class="m-drawer__header">
            <slot name="header">
              <div class="m-drawer__heading">
                <span v-if="title" class="m-drawer__title">{{ title }}</span>
                <p v-if="description" class="m-drawer__desc">{{ description }}</p>
              </div>
            </slot>
            <div v-if="$slots['header-actions']" class="m-drawer__header-actions">
              <slot name="header-actions" />
            </div>
            <button
              v-if="showClose"
              type="button"
              class="m-drawer__close"
              :aria-label="t('common.close')"
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
              <UiActionButton variant="secondary" block @click="emit('close')">{{
                resolvedFooterCancelText
              }}</UiActionButton>
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
import { useI18n } from "@/i18n";
import UiActionButton from "./UiActionButton.vue";

export type SheetDrawerSize = "auto" | "tall";
export type SheetDrawerVariant = "sheet" | "modal" | "adaptive";
/** PC modal 宽度档位；移动端 sheet 忽略 */
export type SheetDrawerWidth = "sm" | "md" | "lg" | "xl";

const props = withDefaults(
  defineProps<{
    open: boolean;
    ariaLabel: string;
    title?: string;
    description?: string;
    /** @deprecated 使用 size="tall" */
    flush?: boolean;
    size?: SheetDrawerSize;
    variant?: SheetDrawerVariant;
    width?: SheetDrawerWidth;
    resizable?: boolean;
    showFooter?: boolean;
    showClose?: boolean;
    footerCancelText?: string;
    dismissOnBackdrop?: boolean;
    bodyClass?: string;
    panelClass?: string;
    minHeight?: number;
    maxHeightRatio?: number;
    /** 与 useMobileViewport 对齐，默认 767 */
    modalBreakpoint?: number;
  }>(),
  {
    flush: false,
    size: undefined,
    variant: "sheet",
    width: "md",
    showFooter: false,
    showClose: false,
    dismissOnBackdrop: true,
    minHeight: 240,
    maxHeightRatio: 0.94,
    modalBreakpoint: 767,
  },
);

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

const slots = useSlots();
const panelRef = ref<HTMLElement | null>(null);
const heightPx = ref<number | null>(null);
const sheetMode = ref(true);
let previousFocus: HTMLElement | null = null;
let startY = 0;
let startHeight = 0;

const resolvedSize = computed<SheetDrawerSize>(() => {
  if (props.size) return props.size;
  return props.flush ? "tall" : "auto";
});

const resolvedFooterCancelText = computed(() => props.footerCancelText ?? t("common.cancel"));

const isTall = computed(() => resolvedSize.value === "tall");

const canResize = computed(() => {
  if (!sheetMode.value) return false;
  if (props.resizable != null) return props.resizable;
  return isTall.value;
});

/** Sheet 模式始终展示把手（对齐会话工具菜单）；仅可调整高度时响应拖拽。 */
const showHandle = computed(() => sheetMode.value);

const showHeader = computed(() =>
  Boolean(
    slots.header ||
    slots["header-actions"] ||
    props.title ||
    props.description ||
    (!sheetMode.value && props.showClose),
  ),
);

const overlayClass = computed(() => (sheetMode.value ? "m-overlay--sheet" : "m-overlay--modal"));

const overlayTransition = computed(() => (sheetMode.value ? "m-overlay" : "m-overlay"));

const panelClasses = computed(() => [
  {
    "m-drawer--tall": isTall.value && sheetMode.value,
    "m-drawer--flush": isTall.value && sheetMode.value,
    "m-drawer--auto": !isTall.value && sheetMode.value,
    "m-drawer--modal": !sheetMode.value,
    "m-drawer--modal-tall": isTall.value && !sheetMode.value,
    "m-drawer--modal-auto": !isTall.value && !sheetMode.value,
    [`m-drawer--width-${props.width}`]: !sheetMode.value,
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
