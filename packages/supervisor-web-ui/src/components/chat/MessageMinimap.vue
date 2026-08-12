<template>
  <aside
    class="message-minimap"
    aria-label="历史消息导航"
    title="滚轮查看更早消息"
    @pointerleave="onPointerLeave"
    @wheel.prevent="onWheel"
  >
    <canvas
      ref="canvasRef"
      class="message-minimap__canvas"
      @pointermove="onPointerMove"
      @pointerdown="onPointerDown"
      @pointerleave="onPointerLeave"
    />
    <Teleport to="body">
      <div
        v-if="hover"
        class="message-minimap__tooltip"
        :style="{ top: `${hover.top}px`, left: `${hover.left}px` }"
      >
        {{ hover.summary }}
      </div>
    </Teleport>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { TurnIndex } from "@/utils/message-storage";

const props = defineProps<{
  turns: TurnIndex[];
  /** Currently focused / visible turn id (optional highlight). */
  activeTurnId?: string | null;
}>();

const emit = defineEmits<{
  select: [userEntryId: string];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const hover = ref<{
  top: number;
  left: number;
  summary: string;
  turnId: string;
  /** Cursor Y in canvas local coords — drives fisheye lengths. */
  cursorY: number;
} | null>(null);

/** Index of the first visible turn in the window (older → smaller). */
const windowStart = ref(0);
/** Last measured canvas height for window sizing. */
const canvasHeight = ref(0);

const sortedTurns = computed(() =>
  [...props.turns].sort((a, b) => a.createdAt - b.createdAt || a.turnId.localeCompare(b.turnId)),
);

const effectiveActiveId = computed(() => {
  if (props.activeTurnId) return props.activeTurnId;
  const last = sortedTurns.value[sortedTurns.value.length - 1];
  return last?.turnId ?? null;
});

/** Prefer denser packing: ~5px center-to-center keeps ticks readable without filling the rail. */
const MIN_GAP = 5;
const PAD_Y = 10;

function maxVisibleForHeight(height: number): number {
  const usable = Math.max(1, height - PAD_Y * 2);
  return Math.max(1, Math.floor(usable / MIN_GAP) + 1);
}

function windowSize(): number {
  const total = sortedTurns.value.length;
  if (total <= 0) return 0;
  const maxVis = maxVisibleForHeight(canvasHeight.value || 240);
  return Math.min(total, maxVis);
}

function clampWindowStart(start: number): number {
  const total = sortedTurns.value.length;
  const size = windowSize();
  if (total <= size) return 0;
  return Math.min(Math.max(0, start), total - size);
}

function visibleSlice(): { turns: TurnIndex[]; start: number; size: number } {
  const turns = sortedTurns.value;
  const size = windowSize();
  const start = clampWindowStart(windowStart.value);
  return { turns: turns.slice(start, start + size), start, size };
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function truncateSummary(text: string, max = 72): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function tickY(indexInWindow: number, height: number, count: number): number {
  const usable = Math.max(1, height - PAD_Y * 2);
  if (count <= 1) return height / 2;
  return PAD_Y + (indexInWindow / (count - 1)) * usable;
}

/** Fisheye: longest under cursor, neighbors taper off. */
function tickWidth(tickCenterY: number, hoverY: number | null, isActive: boolean): number {
  const base = isActive ? 8 : 5;
  const peak = 16;
  if (hoverY == null) return base;
  const dist = Math.abs(tickCenterY - hoverY);
  const sigma = 18;
  const t = Math.exp(-(dist * dist) / (2 * sigma * sigma));
  return base + (peak - base) * t;
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvasHeight.value = rect.height;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const total = sortedTurns.value.length;
  if (!total) return;

  const { turns: visible, start, size } = visibleSlice();
  if (!visible.length) return;

  const muted = cssVar("--app-text-muted", "#9ca3af");
  const accent = cssVar("--app-accent", "#07a65a");
  const track = cssVar("--app-border-subtle", "#e5e7eb");
  const midX = rect.width / 2;
  const hoverY = hover.value?.cursorY ?? null;

  // Main track (window rail)
  ctx.fillStyle = track;
  ctx.fillRect(midX - 0.5, PAD_Y, 1, Math.max(0, rect.height - PAD_Y * 2));

  // Scroll position hint when history is longer than the window
  if (total > size) {
    const railH = Math.max(0, rect.height - PAD_Y * 2);
    const thumbH = Math.max(10, (size / total) * railH);
    const thumbY = PAD_Y + (start / (total - size)) * (railH - thumbH);
    ctx.fillStyle = cssVar("--app-text-muted", "#9ca3af");
    ctx.globalAlpha = 0.35;
    ctx.fillRect(midX - 1.5, thumbY, 3, thumbH);
    ctx.globalAlpha = 1;
  }

  for (let i = 0; i < visible.length; i++) {
    const turn = visible[i]!;
    const y = tickY(i, rect.height, visible.length);
    const isActive = turn.turnId === effectiveActiveId.value;
    const w = tickWidth(y, hoverY, isActive);
    const h = isActive ? 2.25 : hoverY != null && Math.abs(y - hoverY) < 10 ? 2 : 1.5;
    ctx.fillStyle = isActive ? accent : muted;
    ctx.fillRect(midX - w / 2, y - h / 2, w, h);
  }
}

function indexFromY(clientY: number): number | null {
  const canvas = canvasRef.value;
  const { turns: visible } = visibleSlice();
  if (!canvas || !visible.length) return null;
  const rect = canvas.getBoundingClientRect();
  const y = clientY - rect.top;
  const usable = Math.max(1, rect.height - PAD_Y * 2);
  const clamped = Math.min(Math.max(y - PAD_Y, 0), usable);
  if (visible.length === 1) return 0;
  return Math.round((clamped / usable) * (visible.length - 1));
}

function onPointerMove(event: PointerEvent) {
  const index = indexFromY(event.clientY);
  const canvas = canvasRef.value;
  const { turns: visible } = visibleSlice();
  if (index == null || !canvas) {
    hover.value = null;
    draw();
    return;
  }
  const turn = visible[index];
  if (!turn) {
    hover.value = null;
    draw();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const tickCenter = tickY(index, rect.height, visible.length);
  const cursorY = event.clientY - rect.top;
  hover.value = {
    top: rect.top + tickCenter,
    left: rect.right + 8,
    summary: truncateSummary(turn.summary || "（无摘要）"),
    turnId: turn.turnId,
    cursorY,
  };
  draw();
}

function onPointerDown(event: PointerEvent) {
  const index = indexFromY(event.clientY);
  if (index == null) return;
  const turn = visibleSlice().turns[index];
  if (!turn) return;
  emit("select", turn.userEntryId);
}

function onPointerLeave() {
  hover.value = null;
  draw();
}

function onWheel(event: WheelEvent) {
  const total = sortedTurns.value.length;
  const size = windowSize();
  if (total <= size) return;
  // Wheel up → older (smaller start); wheel down → newer
  const step = Math.max(1, Math.round(size * 0.15));
  const delta = event.deltaY > 0 ? step : -step;
  windowStart.value = clampWindowStart(windowStart.value + delta);
  hover.value = null;
  draw();
}

/** Keep the active / newest turn in view when the list grows. */
function ensureActiveInWindow() {
  const turns = sortedTurns.value;
  const size = windowSize();
  if (turns.length <= size) {
    windowStart.value = 0;
    return;
  }
  const activeId = effectiveActiveId.value;
  const activeIndex = activeId ? turns.findIndex((t) => t.turnId === activeId) : turns.length - 1;
  if (activeIndex < 0) {
    windowStart.value = clampWindowStart(turns.length - size);
    return;
  }
  const start = windowStart.value;
  if (activeIndex < start) {
    windowStart.value = activeIndex;
  } else if (activeIndex >= start + size) {
    windowStart.value = clampWindowStart(activeIndex - size + 1);
  }
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  draw();
  ensureActiveInWindow();
  draw();
  if (canvasRef.value) {
    resizeObserver = new ResizeObserver(() => {
      draw();
      ensureActiveInWindow();
      draw();
    });
    resizeObserver.observe(canvasRef.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

watch(
  () => [props.turns, props.activeTurnId] as const,
  () => {
    // Stick to the newest end when turns append (typical chat growth).
    const total = sortedTurns.value.length;
    const size = windowSize();
    const wasNearEnd = total <= size || windowStart.value >= Math.max(0, total - size - 2);
    if (wasNearEnd) {
      windowStart.value = clampWindowStart(total - size);
    } else {
      ensureActiveInWindow();
    }
    draw();
  },
  { deep: true },
);
</script>

<style scoped>
.message-minimap {
  position: relative;
  z-index: 2;
  flex: none;
  /* Only a slice of the chat column — not full height. */
  align-self: center;
  width: 18px;
  height: min(42%, 280px);
  max-height: 42%;
  min-height: 96px;
  margin-right: 4px;
  cursor: pointer;
  user-select: none;
}

.message-minimap__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

@media (max-width: 767px) {
  .message-minimap {
    display: none;
  }
}
</style>

<style>
/* Teleported tooltip — unscoped */
.message-minimap__tooltip {
  position: fixed;
  z-index: 80;
  box-sizing: border-box;
  width: max-content;
  max-width: min(240px, calc(100vw - 24px));
  padding: 6px 10px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 8px;
  background: var(--app-popup-bg, var(--app-settings-bg));
  color: var(--app-text-primary);
  font-size: 12px;
  line-height: 1.4;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  box-shadow: 0 8px 20px rgb(0 0 0 / 16%);
  transform: translateY(-50%);
  pointer-events: none;
}
</style>
