<template>
  <section class="sequence" :class="{ 'sequence--fill': fill, 'sequence--bare': bare }">
    <header v-if="!bare">
      <strong>{{ title }}</strong>
      <span>{{ tasks.length }} 个任务 · 拖拽平移 / 滚轮缩放</span>
    </header>
    <div v-if="!tasks.length" class="sequence-empty">
      <p>{{ emptyText }}</p>
    </div>
    <div v-else class="sequence-flow-wrap">
      <VueFlow
        :id="flowId"
        class="sequence-flow"
        :nodes="nodes"
        :edges="edges"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :elements-selectable="false"
        :select-nodes-on-drag="false"
        :zoom-on-scroll="true"
        :zoom-on-pinch="true"
        :zoom-on-double-click="true"
        :pan-on-drag="true"
        :pan-on-scroll="false"
        :prevent-scrolling="true"
        :min-zoom="0.2"
        :max-zoom="2"
        :fit-view-on-init="false"
        @pane-ready="onPaneReady"
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
              :agent-id="data.agentId"
              :agent-name="data.agent"
              :agent-avatar="data.agentAvatar"
              :status="data.status"
              :status-label="data.statusLabel"
              density="default"
            />
            <Handle type="source" :position="Position.Right" />
          </div>
        </template>
      </VueFlow>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  Handle,
  MarkerType,
  Position,
  VueFlow,
  useVueFlow,
  type NodeMouseEvent,
} from "@vue-flow/core";
import TaskCard from "@/components/task/TaskCard.vue";
import type { Agent } from "@/api";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

export interface SequenceTask {
  id: number;
  title: string;
  description: string;
  project: string;
  agent: string;
  dependencies: number[];
  status?: string;
}

const emit = defineEmits<{ select: [id: number] }>();
const props = withDefaults(
  defineProps<{
    agents?: Agent[];
    tasks?: SequenceTask[];
    selectedId?: number | null;
    title?: string;
    emptyText?: string;
    fill?: boolean;
    bare?: boolean;
  }>(),
  {
    agents: () => [],
    tasks: () => [],
    selectedId: null,
    title: "顺序图",
    emptyText: "规划完成后，任务关系会显示在这里",
    fill: false,
    bare: false,
  },
);

const flowId = `todo-seq-${Math.random().toString(36).slice(2, 9)}`;
const hoveredNodeId = ref<string | null>(null);
const paneReady = ref(false);
let lastFittedKey = "";

const { fitView } = useVueFlow({
  id: flowId,
  nodesDraggable: false,
  nodesConnectable: false,
  elementsSelectable: false,
  zoomOnScroll: true,
  zoomOnPinch: true,
  zoomOnDoubleClick: true,
  panOnDrag: true,
  panOnScroll: false,
  preventScrolling: true,
  minZoom: 0.2,
  maxZoom: 2,
});

const statusLabels: Record<string, string> = {
  pending: "待办",
  running: "进行中",
  blocked: "阻塞",
  done: "已完成",
};

function agentInfo(name: string): Agent | undefined {
  return props.agents.find((agent) => agent.name === name);
}

function tasksKey(tasks: SequenceTask[]) {
  return tasks.map((task) => `${task.id}:${task.status ?? ""}`).join(",");
}

async function fitOnce(force = false) {
  if (!paneReady.value || !props.tasks.length) return;
  const key = tasksKey(props.tasks);
  if (!force && key === lastFittedKey) return;
  lastFittedKey = key;
  await nextTick();
  requestAnimationFrame(() => {
    void fitView({ padding: 0.16, duration: 180 });
  });
}

function onPaneReady() {
  paneReady.value = true;
  void fitOnce(true);
}

const layout = computed(() => {
  const tasks = props.tasks;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const depth = new Map<number, number>();

  function getDepth(id: number): number {
    if (depth.has(id)) return depth.get(id)!;
    const task = byId.get(id);
    if (!task || !task.dependencies.length) {
      depth.set(id, 0);
      return 0;
    }
    const next =
      Math.max(0, ...task.dependencies.filter((dep) => byId.has(dep)).map((dep) => getDepth(dep))) +
      1;
    depth.set(id, next);
    return next;
  }

  for (const task of tasks) getDepth(task.id);

  const columns = new Map<number, SequenceTask[]>();
  for (const task of tasks) {
    const col = depth.get(task.id) ?? 0;
    const list = columns.get(col) ?? [];
    list.push(task);
    columns.set(col, list);
  }

  const nodeWidth = 260;
  const colGap = 300;
  const rowGap = 170;
  const positions = new Map<number, { x: number; y: number }>();

  for (const [col, list] of columns) {
    list.forEach((task, index) => {
      positions.set(task.id, {
        x: 24 + col * colGap,
        y: 48 + index * rowGap,
      });
    });
  }

  return { positions, nodeWidth };
});

const edgePairs = computed(() => {
  const ids = new Set(props.tasks.map((task) => task.id));
  return props.tasks.flatMap((task) =>
    task.dependencies
      .filter((dep) => ids.has(dep))
      .map((dep) => ({
        id: `${dep}-${task.id}`,
        source: String(dep),
        target: String(task.id),
      })),
  );
});

const activeNodeId = computed(() => {
  if (hoveredNodeId.value) return hoveredNodeId.value;
  if (props.selectedId != null) return String(props.selectedId);
  return null;
});

const connectedNodeIds = computed(() => {
  const id = activeNodeId.value;
  if (!id) return new Set<string>();
  return new Set(
    edgePairs.value
      .filter((edge) => edge.source === id || edge.target === id)
      .flatMap((edge) => [edge.source, edge.target]),
  );
});

const nodes = computed(() =>
  props.tasks.map((task) => {
    const id = String(task.id);
    const pos = layout.value.positions.get(task.id) ?? { x: 0, y: 0 };
    const active = activeNodeId.value;
    const agent = agentInfo(task.agent);
    const clazz = !active
      ? id === String(props.selectedId)
        ? "sequence-node--current"
        : ""
      : id === active
        ? "sequence-node--current"
        : connectedNodeIds.value.has(id)
          ? "sequence-node--connected"
          : "sequence-node--dim";
    return {
      id,
      type: "task" as const,
      position: pos,
      draggable: false,
      selectable: false,
      connectable: false,
      data: {
        title: task.title,
        description: task.description,
        project: task.project,
        agent: task.agent,
        agentId: agent?.id ?? task.agent,
        agentAvatar: agent?.avatar ?? null,
        status: task.status,
        statusLabel: task.status ? (statusLabels[task.status] ?? "") : "",
        nodeId: id,
        current: id === String(props.selectedId) || id === active,
      },
      style: { width: `${layout.value.nodeWidth}px` },
      class: clazz,
    };
  }),
);

const edges = computed(() =>
  edgePairs.value.map((edge) => {
    const active = edge.source === activeNodeId.value || edge.target === activeNodeId.value;
    return {
      ...edge,
      type: "bezier",
      interactive: false,
      markerEnd: MarkerType.ArrowClosed,
      class: active ? "sequence-edge--active" : activeNodeId.value ? "sequence-edge--dim" : "",
      style: {
        stroke: active ? "#07c160" : "var(--app-text-muted)",
        strokeWidth: active ? 2.6 : 1.8,
      },
    };
  }),
);

function onNodeClick(event: NodeMouseEvent) {
  emit("select", Number(event.node.id));
}

watch(
  () => tasksKey(props.tasks),
  () => {
    lastFittedKey = "";
    void fitOnce(true);
  },
);
</script>

<style scoped>
.sequence {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border-subtle);
  border-radius: 12px;
  background: var(--app-settings-card);
}

.sequence--bare {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.sequence--fill {
  height: 100%;
}

.sequence > header {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.sequence > header strong {
  color: var(--app-text-primary);
  font-size: 0.875rem;
  font-weight: 600;
}

.sequence > header span {
  color: var(--app-text-secondary);
  font-size: 0.75rem;
}

.sequence-flow-wrap {
  position: relative;
  width: 100%;
  min-height: 0;
  flex: 1;
}

.sequence-flow {
  width: 100% !important;
  height: 100% !important;
  min-height: 320px;
  background:
    radial-gradient(
        circle,
        color-mix(in srgb, var(--app-text-muted) 35%, transparent) 1px,
        transparent 1px
      )
      0 0 / 18px 18px,
    var(--app-list-section-bg, var(--app-shell-bg));
}

.sequence-empty {
  display: grid;
  flex: 1;
  min-height: 280px;
  place-items: center;
  padding: 32px;
  color: var(--app-text-muted);
  font-size: 0.875rem;
  text-align: center;
}

.task-node-wrap {
  position: relative;
  width: 100%;
}

.task-node-wrap :deep(.task-card-ui) {
  border-color: var(--app-border-subtle);
  background: var(--app-settings-card);
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
  color: var(--app-text-primary);
}

.task-node-wrap--current :deep(.task-card-ui),
:deep(.sequence-node--current .task-card-ui) {
  border-color: #07c160;
  box-shadow: 0 0 0 1px color-mix(in srgb, #07c160 35%, transparent);
}

:deep(.vue-flow__handle) {
  width: 7px;
  height: 7px;
  border: 0;
  background: transparent;
}

:deep(.vue-flow__edge-path) {
  stroke-linecap: round;
  pointer-events: none;
}

:deep(.sequence-edge--dim) {
  opacity: 0.35;
}

:deep(.sequence-node--dim) {
  opacity: 0.5;
}

:deep(.sequence-node--connected .task-card-ui) {
  border-color: color-mix(in srgb, #07c160 40%, var(--app-border-subtle));
}

:deep(.vue-flow__node) {
  cursor: grab;
  pointer-events: all;
}

:deep(.vue-flow__node:active),
:deep(.vue-flow__pane:active) {
  cursor: grabbing;
}

:deep(.sequence-node--current) {
  z-index: 4 !important;
}

:deep(.vue-flow__pane) {
  cursor: grab;
}

:deep(.vue-flow__attribution) {
  display: none;
}
</style>
