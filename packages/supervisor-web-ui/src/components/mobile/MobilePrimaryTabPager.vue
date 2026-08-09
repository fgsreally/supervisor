<template>
  <div
    ref="stageRef"
    class="mobile-primary-tab-stage"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchCancel"
  >
    <div
      ref="trackRef"
      class="mobile-primary-tab-track"
      :class="{
        'mobile-primary-tab-track--dragging': dragAxis === 'horizontal',
        'mobile-primary-tab-track--animated': trackAnimated,
      }"
      :style="trackStyle"
      @transitionend="onTrackTransitionEnd"
    >
      <div class="mobile-primary-tab-page">
        <slot name="chat" />
      </div>
      <div class="mobile-primary-tab-page">
        <slot name="work" />
      </div>
      <div class="mobile-primary-tab-page">
        <slot name="agents" />
      </div>
      <div class="mobile-primary-tab-page">
        <slot name="me" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

export type MobilePrimaryTabKey = "chat" | "work" | "agents" | "me";

const TAB_ORDER: MobilePrimaryTabKey[] = ["chat", "work", "agents", "me"];
const SWIPE_THRESHOLD_PX = 48;
const SWIPE_LOCK_PX = 12;
const TRACK_TRANSITION_MS = 280;

const props = defineProps<{ activeTab: MobilePrimaryTabKey }>();

const emit = defineEmits<{
  navigate: [tab: MobilePrimaryTabKey, direction: "forward" | "back"];
}>();

const stageRef = ref<HTMLElement | null>(null);
const trackRef = ref<HTMLElement | null>(null);
const activeIndex = computed(() => TAB_ORDER.indexOf(props.activeTab));
const visualIndex = ref(activeIndex.value);
const trackTranslatePx = ref(0);
const dragAxis = ref<"horizontal" | "vertical" | null>(null);
const touchStart = ref<{ x: number; y: number } | null>(null);
const trackAnimated = ref(false);
const swipeCommitting = ref(false);
let gestureStageWidth = 0;
let commitFinishTimer: ReturnType<typeof setTimeout> | null = null;
let pendingNavigate: { tab: MobilePrimaryTabKey; direction: "forward" | "back" } | null = null;
let suppressTransitionEnd = false;

const trackStyle = computed(() => ({
  transform: `translate3d(${trackTranslatePx.value}px, 0, 0)`,
}));

function getStageWidth() {
  const width = stageRef.value?.getBoundingClientRect().width ?? 0;
  return width > 0 ? width : window.innerWidth;
}

function settledTranslate(index: number, width = gestureStageWidth || getStageWidth()) {
  return -index * width;
}

function syncFromParent(tab: MobilePrimaryTabKey = props.activeTab) {
  pendingNavigate = null;
  visualIndex.value = TAB_ORDER.indexOf(tab);
  gestureStageWidth = getStageWidth();
  trackTranslatePx.value = settledTranslate(visualIndex.value, gestureStageWidth);
  dragAxis.value = null;
  touchStart.value = null;
  trackAnimated.value = false;
  swipeCommitting.value = false;
  suppressTransitionEnd = false;
  clearCommitFinishTimer();
}

function clearCommitFinishTimer() {
  if (commitFinishTimer == null) return;
  clearTimeout(commitFinishTimer);
  commitFinishTimer = null;
}

function finishSwipeCommit() {
  clearCommitFinishTimer();
  const pending = pendingNavigate;
  pendingNavigate = null;
  swipeCommitting.value = false;
  suppressTransitionEnd = false;
  trackAnimated.value = false;

  if (pending) {
    visualIndex.value = TAB_ORDER.indexOf(pending.tab);
    gestureStageWidth = getStageWidth();
    trackTranslatePx.value = settledTranslate(visualIndex.value, gestureStageWidth);
    emit("navigate", pending.tab, pending.direction);
    return;
  }

  visualIndex.value = activeIndex.value;
  gestureStageWidth = getStageWidth();
  trackTranslatePx.value = settledTranslate(visualIndex.value, gestureStageWidth);
}

function scheduleCommitFinishFallback() {
  clearCommitFinishTimer();
  commitFinishTimer = setTimeout(finishSwipeCommit, TRACK_TRANSITION_MS + 40);
}

function onTrackTransitionEnd(event: TransitionEvent) {
  if (event.target !== trackRef.value || event.propertyName !== "transform") return;
  if (suppressTransitionEnd || swipeCommitting.value) return;
  trackAnimated.value = false;
}

function animateTranslateTo(targetPx: number, commit = false) {
  suppressTransitionEnd = true;
  trackAnimated.value = false;
  void trackRef.value?.offsetWidth;
  trackAnimated.value = true;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      trackTranslatePx.value = targetPx;
      suppressTransitionEnd = false;
      if (commit) {
        swipeCommitting.value = true;
        scheduleCommitFinishFallback();
      }
    });
  });
}

function isSwipeBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return !!target.closest(
    "input, textarea, select, button, a, [contenteditable='true'], [data-no-tab-swipe]",
  );
}

function onTouchStart(event: TouchEvent) {
  if (swipeCommitting.value) {
    finishSwipeCommit();
  }

  trackAnimated.value = false;
  pendingNavigate = null;
  suppressTransitionEnd = false;

  if (visualIndex.value !== activeIndex.value) {
    syncFromParent();
  }

  gestureStageWidth = getStageWidth();
  trackTranslatePx.value = settledTranslate(visualIndex.value, gestureStageWidth);

  if (isSwipeBlocked(event.target)) {
    touchStart.value = null;
    dragAxis.value = null;
    return;
  }
  const touch = event.touches[0];
  if (!touch) return;
  touchStart.value = { x: touch.clientX, y: touch.clientY };
  dragAxis.value = null;
}

function onTouchMove(event: TouchEvent) {
  const start = touchStart.value;
  const touch = event.touches[0];
  if (!start || !touch) return;

  const dx = touch.clientX - start.x;
  const dy = touch.clientY - start.y;

  if (!dragAxis.value) {
    if (Math.abs(dx) < SWIPE_LOCK_PX && Math.abs(dy) < SWIPE_LOCK_PX) return;
    dragAxis.value = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
  }

  if (dragAxis.value !== "horizontal") return;

  const atFirst = visualIndex.value === 0;
  const atLast = visualIndex.value === TAB_ORDER.length - 1;
  let nextOffset = dx;
  if ((atFirst && nextOffset > 0) || (atLast && nextOffset < 0)) {
    nextOffset *= 0.28;
  }
  trackTranslatePx.value = settledTranslate(visualIndex.value, gestureStageWidth) + nextOffset;
}

function onTouchCancel() {
  touchStart.value = null;
  dragAxis.value = null;
  trackAnimated.value = false;
  pendingNavigate = null;
  suppressTransitionEnd = false;
  trackTranslatePx.value = settledTranslate(visualIndex.value, gestureStageWidth);
}

function commitTabChange(nextIndex: number, offset: number) {
  const nextTab = TAB_ORDER[nextIndex];
  if (!nextTab) return;

  const fromIndex = visualIndex.value;
  const currentTranslate = settledTranslate(fromIndex, gestureStageWidth) + offset;
  const targetTranslate = settledTranslate(nextIndex, gestureStageWidth);

  trackAnimated.value = false;
  trackTranslatePx.value = currentTranslate;
  visualIndex.value = nextIndex;
  pendingNavigate = {
    tab: nextTab,
    direction: nextIndex > fromIndex ? "forward" : "back",
  };
  swipeCommitting.value = false;

  animateTranslateTo(targetTranslate, true);
}

function onTouchEnd(event: TouchEvent) {
  const start = touchStart.value;
  const touch = event.changedTouches[0];
  const axis = dragAxis.value;
  touchStart.value = null;
  dragAxis.value = null;

  if (!start || !touch || axis !== "horizontal") {
    trackTranslatePx.value = settledTranslate(visualIndex.value, gestureStageWidth);
    return;
  }

  const offset = trackTranslatePx.value - settledTranslate(visualIndex.value, gestureStageWidth);

  let nextIndex = visualIndex.value;
  if (Math.abs(offset) >= SWIPE_THRESHOLD_PX) {
    nextIndex += offset < 0 ? 1 : -1;
  }

  nextIndex = Math.max(0, Math.min(TAB_ORDER.length - 1, nextIndex));

  if (nextIndex === visualIndex.value) {
    if (offset !== 0) {
      animateTranslateTo(settledTranslate(visualIndex.value, gestureStageWidth));
    } else {
      trackTranslatePx.value = settledTranslate(visualIndex.value, gestureStageWidth);
    }
    return;
  }

  commitTabChange(nextIndex, offset);
}

onMounted(() => {
  syncFromParent();
});

defineExpose({ syncFromParent });
</script>

<style scoped>
.mobile-primary-tab-stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background: var(--app-list-section-bg);
  touch-action: pan-y;
}

.mobile-primary-tab-track {
  display: flex;
  width: 100%;
  height: 100%;
}

.mobile-primary-tab-track--animated:not(.mobile-primary-tab-track--dragging) {
  transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.mobile-primary-tab-track--dragging {
  transition: none;
}

.mobile-primary-tab-page {
  display: flex;
  width: 100%;
  height: 100%;
  flex: 0 0 100%;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--app-list-section-bg);
}

@media (prefers-reduced-motion: reduce) {
  .mobile-primary-tab-track--animated {
    transition: none;
  }
}
</style>
