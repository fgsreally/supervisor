<template>
  <div ref="rootRef" class="task-dependency-graph" aria-label="任务依赖图">
    <span class="dependency-graph__hint">{{ hintText }}</span>
    <VueFlow
      :id="flowId"
      :nodes="nodes"
      :edges="edges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="false"
      :zoom-on-scroll="true"
      :zoom-on-pinch="true"
      :pan-on-drag="true"
      :prevent-scrolling="true"
      :min-zoom="0.15"
      :max-zoom="1.6"
      fit-view-on-init
      :fit-view-on-init-options="fitOptions"
      @node-click="onNodeClick"
    >
      <template #node-task="{ data }">
        <div class="dependency-node" :class="{ 'dependency-node--current': data.current }">
          <Handle type="target" :position="Position.Left" />
          <i :data-status="data.status" />
          <span>{{ data.title }}</span>
          <Handle type="source" :position="Position.Right" />
        </div>
      </template>
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Handle,
  MarkerType,
  Position,
  useVueFlow,
  VueFlow,
  type NodeMouseEvent,
} from "@vue-flow/core";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

interface DependencyTask {
  id: number;
  title: string;
  status: string;
}

const props = defineProps<{
  current: DependencyTask;
  dependencies: DependencyTask[];
  dependents: DependencyTask[];
}>();
const emit = defineEmits<{ select: [id: number] }>();

const flowId = `task-dep-${Math.random().toString(36).slice(2, 9)}`;
const rootRef = ref<HTMLElement | null>(null);
const narrow = ref(false);
const { fitView, onPaneReady, onNodesInitialized } = useVueFlow(flowId);
onPaneReady(() => scheduleFit());
onNodesInitialized(() => scheduleFit());

const fitOptions = computed(() => ({
  padding: narrow.value ? 0.14 : 0.2,
  includeHiddenNodes: false,
}));

const hintText = computed(() =>
  narrow.value ? "拖拽平移 · 双指缩放" : "拖拽平移 · 滚轮缩放",
);

const layout = computed(() => {
  if (narrow.value) {
    return {
      nodeWidth: 148,
      currentX: 176,
      dependentX: 352,
      gap: 76,
      currentY: 108,
    };
  }
  return {
    nodeWidth: 190,
    currentX: 230,
    dependentX: 460,
    gap: 88,
    currentY: 130,
  };
});

function columnNodes(tasks: DependencyTask[], x: number) {
  const gap = layout.value.gap;
  const start = layout.value.currentY - ((tasks.length - 1) * gap) / 2;
  return tasks.map((task, index) => ({
    id: String(task.id),
    type: "task" as const,
    position: { x, y: start + index * gap },
    data: task,
    style: { width: `${layout.value.nodeWidth}px` },
  }));
}

const nodes = computed(() => [
  ...columnNodes(props.dependencies, 0),
  {
    id: String(props.current.id),
    type: "task" as const,
    position: { x: layout.value.currentX, y: layout.value.currentY },
    data: { ...props.current, current: true },
    style: { width: `${layout.value.nodeWidth}px` },
  },
  ...columnNodes(props.dependents, layout.value.dependentX),
]);

const edges = computed(() =>
  [
    ...props.dependencies.map((task) => ({
      id: `${task.id}-${props.current.id}`,
      source: String(task.id),
      target: String(props.current.id),
    })),
    ...props.dependents.map((task) => ({
      id: `${props.current.id}-${task.id}`,
      source: String(props.current.id),
      target: String(task.id),
    })),
  ].map((edge) => ({
    ...edge,
    type: "smoothstep",
    markerEnd: MarkerType.ArrowClosed,
    style: { stroke: "#737b86", strokeWidth: 1.5 },
  })),
);

let fitTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleFit() {
  if (fitTimer != null) clearTimeout(fitTimer);
  fitTimer = setTimeout(() => {
    fitTimer = null;
    void fitView({ ...fitOptions.value, duration: 160 });
  }, 40);
}

function onNodeClick(event: NodeMouseEvent) {
  emit("select", Number(event.node.id));
}

function syncNarrow() {
  narrow.value = window.matchMedia("(max-width: 720px)").matches;
}

let media: MediaQueryList | null = null;
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  syncNarrow();
  media = window.matchMedia("(max-width: 720px)");
  media.addEventListener("change", syncNarrow);

  if (typeof ResizeObserver !== "undefined" && rootRef.value) {
    resizeObserver = new ResizeObserver(() => scheduleFit());
    resizeObserver.observe(rootRef.value);
  }
  scheduleFit();
});

onBeforeUnmount(() => {
  media?.removeEventListener("change", syncNarrow);
  resizeObserver?.disconnect();
  if (fitTimer != null) clearTimeout(fitTimer);
});

watch(
  () => [props.current.id, props.dependencies, props.dependents, narrow.value] as const,
  () => scheduleFit(),
);
</script>

<style scoped>
.task-dependency-graph {
  position: relative;
  width: 100%;
  height: 330px;
  overflow: hidden;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background-color: var(--app-settings-bg);
  background-image: radial-gradient(circle, rgb(132 142 156 / 28%) 1px, transparent 1px);
  background-size: 18px 18px;
}
.dependency-graph__hint {
  position: absolute;
  z-index: 2;
  top: 8px;
  right: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text-muted) 14%, transparent);
  color: var(--app-text-muted);
  font-size: 10px;
  pointer-events: none;
  user-select: none;
}
.dependency-node {
  position: relative;
  display: flex;
  width: 100%;
  height: 64px;
  align-items: center;
  justify-content: center;
  padding: 12px 14px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 8px;
  color: var(--app-text-primary);
  background: var(--app-settings-card);
  box-shadow: 0 3px 12px rgb(0 0 0 / 10%);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}
.dependency-node span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
.dependency-node--current {
  border-color: color-mix(in srgb, #07c160 68%, var(--app-border));
}
.dependency-node i {
  position: absolute;
  left: 8px;
  top: 8px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9ca3af;
  box-shadow: 0 0 0 0 color-mix(in srgb, #9ca3af 28%, transparent);
  animation: dependency-status-breathe 3.2s ease-in-out infinite;
}
.dependency-node i[data-status="running"] {
  background: #4f8df7;
  --status-glow: rgb(79 141 247 / 28%);
}
.dependency-node i[data-status="blocked"] {
  background: #ef5b56;
  --status-glow: rgb(239 91 86 / 25%);
}
.dependency-node i[data-status="done"] {
  background: #35b96f;
  --status-glow: rgb(53 185 111 / 25%);
}
.dependency-node i[data-status="pending"] {
  background: #d9a62e;
  --status-glow: rgb(217 166 46 / 25%);
}
@keyframes dependency-status-breathe {
  0%,
  100% {
    box-shadow: 0 0 0 0 var(--status-glow, rgb(156 163 175 / 20%));
    opacity: 0.88;
  }
  50% {
    box-shadow: 0 0 0 3px var(--status-glow, rgb(156 163 175 / 20%));
    opacity: 1;
  }
}
:deep(.vue-flow__pane) {
  cursor: default;
}
:deep(.vue-flow__node) {
  cursor: pointer;
}
:deep(.vue-flow__handle) {
  width: 5px;
  height: 5px;
  border: 0;
  background: transparent;
}
:deep(.vue-flow__edge-path) {
  stroke-linecap: round;
}
@media (prefers-reduced-motion: reduce) {
  .dependency-node i {
    animation: none;
  }
}

@media (max-width: 720px) {
  .task-dependency-graph {
    height: min(42dvh, 360px);
  }

  .dependency-node {
    height: 56px;
    padding: 10px 12px;
    font-size: 12px;
  }

  .dependency-graph__hint {
    top: 6px;
    right: 8px;
    font-size: 9px;
  }
}
</style>
