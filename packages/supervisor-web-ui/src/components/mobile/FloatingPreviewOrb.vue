<template>
  <button
    v-if="visible"
    type="button"
    class="floating-preview-orb"
    :class="{
      'floating-preview-orb--dragging': dragging,
      'floating-preview-orb--active': active,
      'floating-preview-orb--open': open,
    }"
    :style="{ left: `${pointX}px`, top: `${pointY}px` }"
    :title="open ? closeTitle : openTitle"
    :aria-label="open ? closeTitle : openAriaLabel"
    @pointerdown="onPointerDown"
    @click="onClick"
  >
    <span class="floating-preview-orb__pulse" aria-hidden="true" />
    <span class="floating-preview-orb__icon" aria-hidden="true">
      <span class="floating-preview-orb__dot" />
      <span class="floating-preview-orb__dot" />
    </span>
    <span v-if="count > 0" class="floating-preview-orb__badge">{{ countLabel }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, unref, watch, type Ref } from "vue";
import { useDraggablePoint } from "@/composables/use-draggable-point";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    active?: boolean;
    open?: boolean;
    count?: number;
    containerRef?: HTMLElement | null | Ref<HTMLElement | null>;
    storageKey?: string;
    /** Prefer docking to the right edge on first show (mobile bash orb). */
    defaultSide?: "left" | "right";
    /** Override default preview copy (e.g. 后台终端). */
    label?: string;
  }>(),
  {
    active: false,
    open: false,
    count: 0,
    defaultSide: "left",
    label: "应用预览",
  },
);

const emit = defineEmits<{
  toggle: [];
}>();

const containerEl = ref<HTMLElement | null>(null);
const countLabel = computed(() => (props.count > 99 ? "99+" : String(props.count)));
const closeTitle = computed(() => `关闭${props.label}`);
const openTitle = computed(() => `打开${props.label}（${props.count}）`);
const openAriaLabel = computed(() => `打开${props.label}，${props.count} 个`);

const { pointX, pointY, dragging, startDrag, consumeClick, clampToContainer } = useDraggablePoint({
  containerRef: containerEl,
  storageKey: props.storageKey,
  defaultX: props.defaultSide === "right" ? 9999 : 16,
  defaultY: 72,
});

watch(
  () => unref(props.containerRef),
  (value) => {
    containerEl.value = value ?? null;
    clampToContainer();
  },
  { immediate: true },
);

onMounted(() => {
  clampToContainer();
});

function onPointerDown(event: PointerEvent) {
  startDrag(event);
}

function onClick() {
  if (!consumeClick()) return;
  emit("toggle");
}
</script>

<style scoped>
.floating-preview-orb {
  position: absolute;
  z-index: 40;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--app-border-subtle);
  background: color-mix(in srgb, var(--app-popup-bg) 94%, transparent);
  box-shadow: 0 8px 24px rgb(0 0 0 / 14%);
  touch-action: none;
  cursor: grab;
}

.floating-preview-orb--dragging {
  cursor: grabbing;
}

.floating-preview-orb--open {
  border-color: var(--app-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-accent) 25%, transparent);
}

.floating-preview-orb__pulse {
  position: absolute;
  inset: -2px;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--app-status-running, #07c160) 55%, transparent);
  opacity: 0;
  pointer-events: none;
}

.floating-preview-orb--active .floating-preview-orb__pulse {
  animation: preview-orb-pulse 1.8s ease-out infinite;
}

.floating-preview-orb--active {
  animation: preview-orb-breathe 2.2s ease-in-out infinite;
}

.floating-preview-orb__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.floating-preview-orb__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--app-text-muted);
}

.floating-preview-orb--active .floating-preview-orb__dot {
  background: var(--app-status-running, #07c160);
}

.floating-preview-orb__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--app-accent, #07c160);
  color: #fff;
  font-size: 10px;
  font-weight: 650;
  line-height: 1;
  box-shadow: 0 2px 6px rgb(0 0 0 / 18%);
}

@keyframes preview-orb-pulse {
  0% {
    opacity: 0.7;
    transform: scale(0.92);
  }
  70% {
    opacity: 0;
    transform: scale(1.28);
  }
  100% {
    opacity: 0;
    transform: scale(1.28);
  }
}

@keyframes preview-orb-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.04);
  }
}

@media (prefers-reduced-motion: reduce) {
  .floating-preview-orb--active,
  .floating-preview-orb--active .floating-preview-orb__pulse {
    animation: none;
  }
}
</style>
