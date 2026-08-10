<template>
  <div ref="rootRef" class="task-dependency-graph" aria-label="任务依赖图">
    <VueFlow
      :id="flowId"
      class="dependency-flow"
      :nodes="nodes"
      :edges="edges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="false"
      :zoom-on-scroll="false"
      :zoom-on-pinch="false"
      :zoom-on-double-click="false"
      :pan-on-drag="false"
      :pan-on-scroll="false"
      :prevent-scrolling="false"
      :min-zoom="0.35"
      :max-zoom="1"
      fit-view-on-init
      :fit-view-on-init-options="fitOptions"
      @node-click="onNodeClick"
    >
      <template #node-task="{ data }">
        <div
          class="task-node-wrap"
          :class="{ 'task-node-wrap--current': data.current }"
          @mouseenter="hoveredNodeId = data.nodeId"
          @mouseleave="hoveredNodeId = null"
        >
          <Handle type="target" :position="Position.Left" />
          <TaskCard
            :title="data.title"
            :description="data.description"
            :project-name="data.project"
            :agent-id="agentInfo(data.agent)?.id ?? data.agent"
            :agent-name="data.agent"
            :agent-avatar="agentInfo(data.agent)?.avatar"
            :status="data.status"
            :status-label="data.statusLabel"
            density="compact"
          />
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
import TaskCard from "@/components/task/TaskCard.vue";
import type { Agent } from "@/api";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

interface DependencyTask {
  id: number;
  title: string;
  description?: string;
  project?: string;
  agent?: string;
  status: string;
}

const props = withDefaults(
  defineProps<{
    current: DependencyTask;
    dependencies: DependencyTask[];
    dependents: DependencyTask[];
    agents?: Agent[];
  }>(),
  { agents: () => [] },
);
const emit = defineEmits<{ select: [id: number] }>();

const flowId = `task-dep-${Math.random().toString(36).slice(2, 9)}`;
const rootRef = ref<HTMLElement | null>(null);
const narrow = ref(false);
const hoveredNodeId = ref<string | null>(null);
const { fitView, onPaneReady, onNodesInitialized } = useVueFlow(flowId);
onPaneReady(() => scheduleFit());
onNodesInitialized(() => scheduleFit());

const fitOptions = computed(() => ({
  padding: narrow.value ? 0.1 : 0.16,
  includeHiddenNodes: false,
}));

const layout = computed(() => {
  if (narrow.value) {
    return {
      nodeWidth: 220,
      currentX: 248,
      dependentX: 496,
      gap: 132,
      currentY: 150,
    };
  }
  return {
    nodeWidth: 260,
    currentX: 300,
    dependentX: 600,
    gap: 150,
    currentY: 170,
  };
});

const statusLabels: Record<string, string> = {
  pending: "待办",
  running: "进行中",
  blocked: "阻塞",
  done: "已完成",
};

function agentInfo(name?: string): Agent | undefined {
  if (!name) return undefined;
  return props.agents.find((agent) => agent.name === name);
}

function columnNodes(tasks: DependencyTask[], x: number) {
  const gap = layout.value.gap;
  const start = layout.value.currentY - ((tasks.length - 1) * gap) / 2;
  return tasks.map((task, index) => ({
    id: String(task.id),
    type: "task" as const,
    position: { x, y: start + index * gap },
    data: {
      ...task,
      nodeId: String(task.id),
      statusLabel: statusLabels[task.status] ?? "",
    },
    style: { width: `${layout.value.nodeWidth}px` },
    class: nodeClass(String(task.id)),
  }));
}

function nodeClass(id: string) {
  const hover = hoveredNodeId.value;
  if (!hover) return "";
  if (id === hover) return "sequence-node--current";
  if (connectedNodeIds.value.has(id)) return "sequence-node--connected";
  return "sequence-node--dim";
}

const edgePairs = computed(() => [
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
]);

const connectedNodeIds = computed(() => {
  const id = hoveredNodeId.value;
  if (!id) return new Set<string>();
  return new Set(
    edgePairs.value
      .filter((edge) => edge.source === id || edge.target === id)
      .flatMap((edge) => [edge.source, edge.target]),
  );
});

const nodes = computed(() => [
  ...columnNodes(props.dependencies, 0),
  {
    id: String(props.current.id),
    type: "task" as const,
    position: { x: layout.value.currentX, y: layout.value.currentY },
    data: {
      ...props.current,
      current: true,
      nodeId: String(props.current.id),
      statusLabel: statusLabels[props.current.status] ?? "",
    },
    style: { width: `${layout.value.nodeWidth}px` },
    class: nodeClass(String(props.current.id)) || "sequence-node--current",
  },
  ...columnNodes(props.dependents, layout.value.dependentX),
]);

const edges = computed(() =>
  edgePairs.value.map((edge) => {
    const active =
      edge.source === hoveredNodeId.value ||
      edge.target === hoveredNodeId.value ||
      edge.source === String(props.current.id) ||
      edge.target === String(props.current.id);
    const dimmed = Boolean(hoveredNodeId.value) && !active;
    return {
      ...edge,
      type: "bezier",
      markerEnd: MarkerType.ArrowClosed,
      class: active
        ? "sequence-edge--active"
        : dimmed
          ? "sequence-edge--dim"
          : "sequence-edge--idle",
      style: {
        stroke: active ? "#ff8a24" : "#8fa0b8",
        strokeWidth: active ? 3.2 : 2.2,
      },
    };
  }),
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
  height: 380px;
  overflow: hidden;
  border: 1px solid var(--app-border-subtle);
  border-radius: 11px;
  background: var(--app-settings-card);
}

.dependency-flow {
  width: 100%;
  height: 100%;
  background: var(--app-settings-card);
}

.task-node-wrap {
  position: relative;
  width: 100%;
  box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
}

.task-node-wrap--current :deep(.task-card-ui),
:deep(.sequence-node--current .task-card-ui) {
  border-color: #ff8a24;
}

:deep(.vue-flow__handle) {
  width: 7px;
  height: 7px;
  border: 0;
  background: #8fa0b8;
  opacity: 0;
}

:deep(.vue-flow__edge-path) {
  stroke-linecap: round;
  transition:
    stroke 0.18s ease,
    stroke-width 0.18s ease,
    opacity 0.18s ease;
}

:deep(.sequence-edge--active .vue-flow__edge-path) {
  filter: drop-shadow(0 0 5px rgb(255 138 36 / 55%));
}

:deep(.sequence-edge--dim),
:deep(.sequence-node--dim) {
  opacity: 0.24;
}

:deep(.vue-flow__node) {
  cursor: pointer;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

:deep(.sequence-node--current) {
  z-index: 4 !important;
  filter: drop-shadow(0 8px 13px rgb(255 138 36 / 20%));
}

:deep(.vue-flow__pane) {
  cursor: default;
}

@media (max-width: 720px) {
  .task-dependency-graph {
    height: min(46dvh, 400px);
  }
}
</style>
