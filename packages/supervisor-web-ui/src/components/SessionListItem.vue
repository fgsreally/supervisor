<template>
  <div
    class="relative transition-colors"
    :class="[rowClass, isAchieved ? 'cursor-default' : 'cursor-pointer']"
    :style="rowStyle"
    :aria-disabled="isAchieved ? 'true' : undefined"
    @click="onRowClick"
    @contextmenu.prevent="onContextMenu"
    @selectstart.prevent
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
    @touchmove="onTouchCancel"
    @touchcancel="onTouchCancel"
    @mouseenter="emit('hover-change', true)"
    @mouseleave="emit('hover-change', false)"
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

    <div class="flex min-w-0 items-center gap-3 relative overflow-hidden">
      <div class="relative shrink-0">
        <SessionAvatar
          :session-id="session.id"
          :name="session.title"
          :agent-id="session.agentId"
          :avatar="session.avatar"
          :agent-icon="agentIcon"
          :size="AVATAR_PX"
        />
        <div
          class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 session-status-ring"
          :class="statusDotClass"
        />
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex min-w-0 items-center justify-between gap-2 overflow-hidden">
          <div class="session-heading flex items-center gap-1.5 min-w-0">
            <span
              class="text-[13px] truncate session-name"
              :class="{ 'session-name--achieved': isAchieved }"
            >
              {{ session.title }}
            </span>
            <WorkflowStageTag v-if="stage" :stage="stage" compact />
          </div>
          <span class="text-[10px] shrink-0 session-time">{{
            formatListTime(session.lastActiveAt)
          }}</span>
        </div>
        <div class="flex min-w-0 items-center justify-between gap-2 mt-0.5 overflow-hidden">
          <span class="min-w-0 flex-1 text-[11px] truncate session-preview">{{ preview }}</span>
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
import type { UISession } from "@/types/ui";
import { branchDotColor } from "../utils/session-branch";
import { formatListTime } from "../utils/format-time";
import { parseSessionStage } from "../utils/workflow";
import { parseSessionServicesFromMeta, sessionHasProjectServices } from "../utils/session-services";
import WorkflowStageTag from "./WorkflowStageTag.vue";
import SessionAvatar from "./SessionAvatar.vue";
import { useAgentStore } from "@/store";

const props = defineProps<{
  session: UISession;
  active?: boolean;
  depth?: number;
  isLastChild?: boolean;
  ancestorOpenDepths?: number[];
  mode?: "chat" | "contacts";
}>();

const emit = defineEmits<{
  select: [id: string];
  "context-menu": [payload: { x: number; y: number }];
  "hover-change": [hovered: boolean];
}>();

const agentStore = useAgentStore();
const agentIcon = computed(() => {
  const id = props.session.agentId;
  if (!id) return null;
  return agentStore.getAgentById(id)?.avatar ?? null;
});

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
    window.getSelection()?.removeAllRanges();
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

const stage = computed(() => parseSessionStage(props.session));

const depth = computed(() => props.depth ?? 0);
const isChild = computed(() => depth.value > 0);
const ancestorOpenDepths = computed(() => props.ancestorOpenDepths ?? []);

const treeLineLeftPx = computed(() => TREE_ROOT_PX + (depth.value - 1) * TREE_STEP_PX);
const treeLineStyle = computed(() => ({ left: `${treeLineLeftPx.value}px` }));
const treeDotStyle = computed(() => ({
  left: `${treeLineLeftPx.value - 1.5}px`,
  backgroundColor: branchDotColor(props.session.spawnType),
}));
const treeBranchStyle = computed(() => ({
  left: `${treeLineLeftPx.value}px`,
  width: `${TREE_STEP_PX}px`,
}));
const ancestorTrunkStyle = (ancestorDepth: number) => ({
  left: `${TREE_ROOT_PX + (ancestorDepth - 1) * TREE_STEP_PX}px`,
});

const isAchieved = computed(
  () => props.session.status === "finish" || props.session.status === "finished",
);

const rowClass = computed(() => {
  const classes = ["session-row"];
  if (isChild.value) classes.push("session-row--child");
  if (props.active) classes.push("session-row--active");
  if (isAchieved.value) classes.push("session-row--achieved");
  return classes.join(" ");
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
  return { ...base, paddingLeft: "12px" };
});

const preview = computed(() =>
  props.mode === "contacts"
    ? (props.session.meta.description ?? props.session.id)
    : props.session.lastMessagePreview,
);

const statusDotClass = computed(() => {
  const services = parseSessionServicesFromMeta(props.session.meta);
  const agentRunning = props.session.status === "running";
  const agentBlocked = props.session.status === "blocked";
  const agentInitializing = props.session.status === "initializing";

  if (sessionHasProjectServices(props.session.meta) && services) {
    let serviceClass = "session-status-dot session-status-dot--stopped";
    if (services.status === "running" || services.status === "active")
      serviceClass = "session-status-dot session-status-dot--idle";
    else if (services.status === "starting")
      serviceClass = "session-status-dot session-status-dot--initializing";
    else if (services.status === "error")
      serviceClass = "session-status-dot session-status-dot--error";
    if (agentRunning) return `${serviceClass} session-status-dot--agent-running`;
    if (agentBlocked) return `${serviceClass} session-status-dot--agent-blocked`;
    if (agentInitializing) return `${serviceClass} session-status-dot--agent-initializing`;
    return serviceClass;
  }

  switch (props.session.status) {
    case "initializing":
      return "session-status-dot session-status-dot--initializing";
    case "running":
      return "session-status-dot session-status-dot--running";
    case "blocked":
      return "session-status-dot session-status-dot--waiting-user";
    case "idle":
      return "session-status-dot session-status-dot--idle";
    case "error":
      return "session-status-dot session-status-dot--error";
    case "finish":
    case "finished":
      return "session-status-dot session-status-dot--finish";
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

.session-row--active .session-status-ring {
  border-color: var(--app-list-item-active);
}

.session-row--active:hover .session-status-ring {
  border-color: color-mix(in srgb, var(--app-list-item-active) 86%, white);
}

.session-status-dot--initializing {
  background: var(--app-status-initializing);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.session-status-dot--running {
  background: var(--app-status-running);
}

.session-status-dot--waiting-user {
  background: var(--app-status-waiting-user);
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

.session-status-dot--finish {
  background: color-mix(in srgb, var(--app-text-muted) 70%, transparent);
}

.session-status-dot--agent-running {
  box-shadow: 0 0 0 2px var(--app-status-running);
}

.session-status-dot--agent-blocked {
  box-shadow: 0 0 0 2px var(--app-status-waiting-user);
}

.session-status-dot--agent-initializing {
  box-shadow: 0 0 0 2px var(--app-status-initializing);
}

.session-row {
  max-width: 100%;
  overflow: hidden;
  background: var(--app-list-bg);
  color: var(--app-text-primary);
}

.session-row:hover:not(.session-row--active):not(.session-row--achieved) {
  background: var(--app-list-item-hover);
  box-shadow: inset 3px 0 0 color-mix(in srgb, #07c160 65%, transparent);
}

.session-row--child:hover:not(.session-row--active):not(.session-row--achieved) {
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

.session-row--active .session-preview,
.session-row--active .session-time {
  color: var(--app-list-item-active-secondary, rgb(255 255 255 / 78%));
}

.session-row--active:hover {
  background: color-mix(in srgb, var(--app-list-item-active) 86%, white);
  box-shadow: inset 3px 0 0 rgb(255 255 255 / 72%);
}

.session-row--achieved {
  opacity: 0.62;
  color: var(--app-text-muted);
}

.session-row--achieved .session-name,
.session-row--achieved .session-preview,
.session-row--achieved .session-time {
  color: var(--app-text-muted);
}

.session-row--achieved.session-row--active {
  opacity: 0.78;
  background: color-mix(in srgb, var(--app-list-item-active) 55%, var(--app-list-bg, transparent));
  box-shadow: none;
}

.session-row--achieved.session-row--active .session-name,
.session-row--achieved.session-row--active .session-preview,
.session-row--achieved.session-row--active .session-time {
  color: var(--app-list-item-active-secondary, rgb(255 255 255 / 72%));
}

.session-row--achieved:hover {
  background: transparent;
  box-shadow: none;
}

.session-name {
  color: var(--app-text-primary);
  font-weight: 400;
}

.session-name--achieved {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  text-decoration-color: color-mix(in srgb, var(--app-text-muted) 80%, transparent);
}

.session-preview {
  display: block;
  width: 0;
  min-width: 0;
  flex: 1 1 0%;
  overflow: hidden;
  color: var(--app-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-row > .flex > div:last-child {
  min-width: 0;
  flex: 1 1 0%;
  overflow: hidden;
}

.session-row > .flex {
  width: 100%;
}

.session-heading {
  width: 0;
  min-width: 0;
  flex: 1 1 0%;
  overflow: hidden;
}

.session-heading .session-name {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-time {
  color: var(--app-text-muted);
}

@media (max-width: 767px) {
  .session-row {
    min-width: 0;
    max-width: none;
    width: 100%;
    margin-inline: 0;
    padding-top: 8px !important;
    padding-bottom: 8px !important;
    border-bottom: 1px solid var(--app-divider);
    padding-right: 16px !important;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  .session-row:not(.session-row--child) {
    padding-left: 16px !important;
  }

  .session-row:hover:not(.session-row--active):not(.session-row--achieved),
  .session-row--active,
  .session-row--active:hover {
    box-shadow: none;
  }

  .session-heading,
  .session-name,
  .session-preview {
    min-width: 0;
    max-width: 100%;
  }

  .session-heading {
    flex: 1 1 0%;
  }
}
</style>
