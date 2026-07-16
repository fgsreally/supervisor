<template>
  <div
    class="cursor-pointer relative transition-colors"
    :class="rowClass"
    :style="rowStyle"
    @click="onRowClick"
    @contextmenu.prevent="onContextMenu"
    @touchstart.passive="onTouchStart"
    @touchend="onTouchEnd"
    @touchmove="onTouchCancel"
    @touchcancel="onTouchCancel"
  >
    <div
      v-for="ancestorDepth in ancestorOpenDepths"
      :key="`ancestor-${ancestorDepth}`"
      class="absolute top-0 bottom-0 w-px session-tree-line"
      :style="ancestorTrunkStyle(ancestorDepth)"
    />
    <div
      v-if="isChild"
      class="absolute top-0 h-1/2 w-px session-tree-line"
      :style="treeLineStyle"
    />
    <div
      v-if="isChild && !isLastChild"
      class="absolute top-1/2 bottom-0 w-px session-tree-line"
      :style="treeLineStyle"
    />
    <div v-if="isChild" class="absolute top-1/2 h-px session-tree-line" :style="treeBranchStyle" />
    <div
      v-if="isChild"
      class="absolute top-[calc(50%-3px)] w-1.5 h-1.5 rounded-full"
      :style="treeDotStyle"
    />

    <div class="flex items-center gap-3 relative">
      <div class="relative shrink-0">
        <div
          class="rounded-md flex items-center justify-center text-white font-medium shadow-sm"
          :class="avatarClass"
          :style="avatarStyle"
        >
          {{ initial }}
        </div>
        <div
          class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 session-status-ring"
          :class="statusDotClass"
        />
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-[13px] font-medium truncate session-name">
            {{ session.meta.name }}
          </span>
          <span class="text-[10px] shrink-0 session-time">{{
            formatListTime(session.lastActiveAt)
          }}</span>
        </div>
        <div class="flex items-center justify-between gap-2 mt-0.5">
          <span class="text-[11px] truncate session-preview">{{ preview }}</span>
          <span
            v-if="session.unread && session.unread > 0"
            class="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#fa5151] text-white text-[11px] font-medium flex items-center justify-center"
          >
            {{ session.unread > 99 ? "99+" : session.unread }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import type { MockSession } from "../mock/app-data";
import { branchDotColor } from "../utils/session-branch";
import { formatListTime } from "../utils/format-time";

const props = defineProps<{
  session: MockSession;
  active?: boolean;
  depth?: number;
  isLastChild?: boolean;
  ancestorOpenDepths?: number[];
  mode?: "chat" | "contacts";
}>();

const emit = defineEmits<{
  select: [id: string];
  "context-menu": [payload: { x: number; y: number }];
}>();

const LONG_PRESS_MS = 500;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let suppressClick = false;

function onContextMenu(event: MouseEvent) {
  emitContextMenu(event.clientX, event.clientY);
}

function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch) return;
  longPressTimer = setTimeout(() => {
    suppressClick = true;
    emitContextMenu(touch.clientX, touch.clientY);
  }, LONG_PRESS_MS);
}

function onTouchEnd() {
  onTouchCancel();
}

function onTouchCancel() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function emitContextMenu(x: number, y: number) {
  emit("context-menu", { x, y });
}

function onRowClick() {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  emit("select", props.session.id);
}

onBeforeUnmount(() => {
  onTouchCancel();
});

const TREE_ROOT_PX = 16;
const TREE_STEP_PX = 18;
const AVATAR_PX = 40;
const ROW_PAD_Y_PX = 12;

const initial = computed(() => props.session.meta.name.substring(0, 1).toUpperCase());

const depth = computed(() => props.depth ?? 0);
const isChild = computed(() => depth.value > 0);
const ancestorOpenDepths = computed(() => props.ancestorOpenDepths ?? []);

const treeLineLeftPx = computed(() => TREE_ROOT_PX + (depth.value - 1) * TREE_STEP_PX);
const treeLineStyle = computed(() => ({ left: `${treeLineLeftPx.value}px` }));
const treeDotStyle = computed(() => ({
  left: `${treeLineLeftPx.value - 1.5}px`,
  backgroundColor: branchDotColor(props.session.branchType),
}));
const treeBranchStyle = computed(() => ({
  left: `${treeLineLeftPx.value}px`,
  width: `${TREE_STEP_PX}px`,
}));
const ancestorTrunkStyle = (ancestorDepth: number) => ({
  left: `${TREE_ROOT_PX + (ancestorDepth - 1) * TREE_STEP_PX}px`,
});

const rowClass = computed(() => {
  if (props.active) return "session-row session-row--active";
  return isChild.value ? "session-row session-row--child" : "session-row";
});

const rowStyle = computed(() => {
  const base = {
    paddingRight: "16px",
    paddingTop: `${ROW_PAD_Y_PX}px`,
    paddingBottom: `${ROW_PAD_Y_PX}px`,
  };
  if (isChild.value) {
    return {
      ...base,
      paddingLeft: `${TREE_ROOT_PX + depth.value * TREE_STEP_PX}px`,
    };
  }
  return { ...base, paddingLeft: "16px" };
});

const preview = computed(() =>
  props.mode === "contacts"
    ? (props.session.meta.description ?? props.session.id)
    : props.session.lastMessagePreview,
);

const avatarStyle = computed(() => ({
  width: `${AVATAR_PX}px`,
  height: `${AVATAR_PX}px`,
  fontSize: "16px",
}));

const avatarClass = computed(() => {
  const colors = ["bg-blue-500", "bg-indigo-500", "bg-teal-500", "bg-violet-500", "bg-amber-600"];
  const idx = props.session.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return colors[idx];
});

const statusDotClass = computed(() => {
  switch (props.session.status) {
    case "starting":
      return "session-status-dot session-status-dot--starting";
    case "running":
      return "session-status-dot session-status-dot--running";
    case "idle":
      return "session-status-dot session-status-dot--idle";
    case "error":
      return "session-status-dot session-status-dot--error";
    case "stopped":
      return "session-status-dot session-status-dot--stopped";
    default:
      return "session-status-dot session-status-dot--stopped";
  }
});
</script>

<style scoped>
.session-tree-line {
  background: var(--app-list-tree-line);
}

.session-status-ring {
  border-color: var(--app-list-status-ring);
}

.session-status-dot--starting {
  background: var(--app-status-starting);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.session-status-dot--running {
  background: var(--app-status-running);
}

.session-status-dot--idle {
  background: var(--app-status-idle);
}

.session-status-dot--error {
  background: var(--app-status-error);
}

.session-status-dot--stopped {
  background: var(--app-status-stopped);
}

.session-row {
  color: var(--app-text-primary);
}

.session-row:hover:not(.session-row--active) {
  background: var(--app-list-item-hover);
}

.session-row--child:hover:not(.session-row--active) {
  background: var(--app-list-item-child-hover);
}

.session-row--active {
  background: var(--app-list-item-active);
  color: var(--app-list-item-active-text);
}

.session-row--active .session-tree-line {
  background: var(--app-list-tree-line-active, var(--app-list-tree-line));
}

.session-row--active .session-name {
  color: var(--app-list-item-active-text);
}

.session-row--active .session-preview {
  color: #b7e9d3;
}

.session-row--active .session-time {
  color: #d7f5e8;
}

.session-name {
  color: var(--app-text-primary);
}

.session-preview {
  color: var(--app-text-secondary);
}

.session-time {
  color: var(--app-text-muted);
}
</style>
