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
    :title="open ? '关闭预览分屏' : '打开预览分屏'"
    @pointerdown="onPointerDown"
    @click="onClick"
  >
    <span class="floating-preview-orb__dot" />
    <span class="floating-preview-orb__dot" />
  </button>
</template>

<script setup lang="ts">
import { onMounted, ref, unref, watch, type Ref } from "vue";
import { useDraggablePoint } from "@/composables/use-draggable-point";

const props = defineProps<{
  visible: boolean;
  active?: boolean;
  open?: boolean;
  containerRef?: HTMLElement | null | Ref<HTMLElement | null>;
  storageKey?: string;
}>();

const emit = defineEmits<{
  toggle: [];
}>();

const containerEl = ref<HTMLElement | null>(null);

const { pointX, pointY, dragging, startDrag, consumeClick, clampToContainer } = useDraggablePoint({
  containerRef: containerEl,
  storageKey: props.storageKey,
  defaultX: 16,
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
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--app-border-subtle);
  background: color-mix(in srgb, var(--app-popup-bg) 92%, transparent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  touch-action: none;
  cursor: grab;
}

.floating-preview-orb--dragging {
  cursor: grabbing;
}

.floating-preview-orb--active .floating-preview-orb__dot {
  background: var(--app-status-running);
}

.floating-preview-orb--open {
  border-color: var(--app-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-accent) 25%, transparent);
}

.floating-preview-orb__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--app-text-muted);
}
</style>
