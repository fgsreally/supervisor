<template>
  <div class="task-dependency-graph" aria-label="任务依赖图">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="false"
      :zoom-on-scroll="false"
      :zoom-on-pinch="false"
      :pan-on-drag="false"
      :prevent-scrolling="false"
      :default-viewport="{ x: 10, y: 0, zoom: 1 }"
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
import { computed } from "vue";
import { Handle, MarkerType, Position, VueFlow, type NodeMouseEvent } from "@vue-flow/core";
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

function columnNodes(tasks: DependencyTask[], x: number) {
  const gap = 88;
  const start = 130 - ((tasks.length - 1) * gap) / 2;
  return tasks.map((task, index) => ({
    id: String(task.id),
    type: "task",
    position: { x, y: start + index * gap },
    data: task,
  }));
}

const nodes = computed(() => [
  ...columnNodes(props.dependencies, 0),
  {
    id: String(props.current.id),
    type: "task",
    position: { x: 230, y: 130 },
    data: { ...props.current, current: true },
  },
  ...columnNodes(props.dependents, 460),
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

function onNodeClick(event: NodeMouseEvent) {
  emit("select", Number(event.node.id));
}
</script>

<style scoped>
.task-dependency-graph {
  width: 100%;
  height: 330px;
  overflow: hidden;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background-color: var(--app-settings-bg);
  background-image: radial-gradient(circle, rgb(132 142 156 / 28%) 1px, transparent 1px);
  background-size: 18px 18px;
}
.dependency-node {
  position: relative;
  display: flex;
  width: 190px;
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
    overflow: auto hidden;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  :deep(.vue-flow) {
    width: 680px;
    min-width: 680px;
    height: 100%;
  }
}
</style>
