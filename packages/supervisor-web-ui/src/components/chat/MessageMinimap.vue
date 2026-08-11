<template>
  <aside
    class="message-minimap"
    aria-label="历史消息导航"
    @pointerleave="onPointerLeave"
  >
    <canvas
      ref="canvasRef"
      class="message-minimap__canvas"
      @pointermove="onPointerMove"
      @pointerdown="onPointerDown"
    />
    <div
      v-if="hover"
      class="message-minimap__tooltip"
      :style="{ top: `${hover.y}px` }"
    >
      <div class="message-minimap__tooltip-summary">{{ hover.summary }}</div>
    </div>
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
const hover = ref<{ y: number; summary: string; turnId: string } | null>(null);

const sortedTurns = computed(() =>
  [...props.turns].sort((a, b) => a.createdAt - b.createdAt || a.turnId.localeCompare(b.turnId)),
);

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
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

  const turns = sortedTurns.value;
  if (!turns.length) return;

  const muted = cssVar("--app-text-muted", "#9ca3af");
  const accent = cssVar("--app-accent", "#07a65a");
  const track = cssVar("--app-border-subtle", "#e5e7eb");

  ctx.fillStyle = track;
  ctx.fillRect(rect.width / 2 - 0.5, 6, 1, Math.max(0, rect.height - 12));

  const usable = Math.max(1, rect.height - 16);
  const count = turns.length;
  for (let i = 0; i < count; i++) {
    const turn = turns[i]!;
    const y = 8 + (count === 1 ? usable / 2 : (i / (count - 1)) * usable);
    const isActive = turn.turnId === props.activeTurnId;
    const isHover = turn.turnId === hover.value?.turnId;
    ctx.fillStyle = isActive || isHover ? accent : muted;
    const tickW = isActive || isHover ? 12 : 8;
    const tickH = isActive || isHover ? 2.5 : 1.5;
    ctx.fillRect(rect.width / 2 - tickW / 2, y - tickH / 2, tickW, tickH);
  }
}

function indexFromY(clientY: number): number | null {
  const canvas = canvasRef.value;
  const turns = sortedTurns.value;
  if (!canvas || !turns.length) return null;
  const rect = canvas.getBoundingClientRect();
  const y = clientY - rect.top;
  const usable = Math.max(1, rect.height - 16);
  const clamped = Math.min(Math.max(y - 8, 0), usable);
  if (turns.length === 1) return 0;
  const ratio = clamped / usable;
  return Math.round(ratio * (turns.length - 1));
}

function onPointerMove(event: PointerEvent) {
  const index = indexFromY(event.clientY);
  const canvas = canvasRef.value;
  if (index == null || !canvas) {
    hover.value = null;
    draw();
    return;
  }
  const turn = sortedTurns.value[index];
  if (!turn) {
    hover.value = null;
    draw();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const usable = Math.max(1, rect.height - 16);
  const y =
    sortedTurns.value.length === 1
      ? rect.height / 2
      : 8 + (index / (sortedTurns.value.length - 1)) * usable;
  hover.value = { y, summary: turn.summary, turnId: turn.turnId };
  draw();
}

function onPointerDown(event: PointerEvent) {
  const index = indexFromY(event.clientY);
  if (index == null) return;
  const turn = sortedTurns.value[index];
  if (!turn) return;
  emit("select", turn.userEntryId);
}

function onPointerLeave() {
  hover.value = null;
  draw();
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  draw();
  if (canvasRef.value) {
    resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvasRef.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

watch(
  () => [props.turns, props.activeTurnId] as const,
  () => draw(),
  { deep: true },
);
</script>

<style scoped>
.message-minimap {
  position: relative;
  flex: none;
  width: 18px;
  height: 100%;
  min-height: 0;
  cursor: pointer;
  user-select: none;
}

.message-minimap__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.message-minimap__tooltip {
  position: absolute;
  left: 22px;
  z-index: 20;
  max-width: 240px;
  padding: 6px 8px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 6px;
  background: var(--app-popup-bg, var(--app-settings-bg));
  box-shadow: 0 6px 18px rgb(0 0 0 / 12%);
  transform: translateY(-50%);
  pointer-events: none;
}

.message-minimap__tooltip-summary {
  color: var(--app-text-primary);
  font-size: 12px;
  line-height: 1.35;
  word-break: break-word;
}

@media (max-width: 767px) {
  .message-minimap {
    display: none;
  }
}
</style>
