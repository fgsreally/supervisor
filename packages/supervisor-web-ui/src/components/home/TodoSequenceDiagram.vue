<template>
  <section class="sequence">
    <header><strong>顺序图</strong><span>5 个任务 · 拖拽平移 / 滚轮缩放</span></header>
    <VueFlow
      class="sequence-flow"
      :nodes="nodes"
      :edges="edges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="false"
      :zoom-on-scroll="true"
      :pan-on-drag="true"
      fit-view-on-init
      :fit-view-on-init-options="{ padding: 0.16 }"
      @node-click="onNodeClick"
    >
      <template #node-task="{ data }">
        <div
          class="task-node-wrap"
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
            density="default"
          />
          <Handle type="source" :position="Position.Right" />
        </div>
      </template>
    </VueFlow>
  </section>
</template>

<script setup lang="ts">
import { Handle, MarkerType, Position, VueFlow, type NodeMouseEvent } from "@vue-flow/core";
import { computed, ref } from "vue";
import TaskCard from "@/components/task/TaskCard.vue";
import type { Agent } from "@/api";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

const emit = defineEmits<{ select: [id: number] }>();
const props = withDefaults(defineProps<{ agents?: Agent[] }>(), { agents: () => [] });
const hoveredNodeId = ref<string | null>(null);
const taskData = [
  {
    id: "1",
    letter: "A",
    title: "梳理数据模型",
    description: "确认任务字段、状态和迁移策略",
    project: "supervisor",
    agent: "Codex",
    x: 20,
    y: 35,
  },
  {
    id: "2",
    letter: "B",
    title: "设计交互方案",
    description: "统一 Task 卡片和详情信息结构",
    project: "supervisor-web-ui",
    agent: "Claude Code",
    x: 20,
    y: 205,
  },
  {
    id: "3",
    letter: "C",
    title: "重构任务接口",
    description: "实现规划确认、调度与手动启动",
    project: "supervisor",
    agent: "Codex",
    x: 330,
    y: 35,
  },
  {
    id: "4",
    letter: "D",
    title: "实现 Todo 界面",
    description: "完成桌面端与移动端任务体验",
    project: "supervisor-web-ui",
    agent: "Claude Code",
    x: 330,
    y: 205,
  },
  {
    id: "5",
    letter: "E",
    title: "联调与验证",
    description: "验证任务状态同步与执行顺序",
    project: "supervisor-web-ui",
    agent: "Codex",
    x: 640,
    y: 120,
  },
];
const edge = (id: string, source: string, target: string) => ({
  id,
  source,
  target,
  type: "bezier",
  markerEnd: MarkerType.ArrowClosed,
});
const edgeData = [
  edge("a-c", "1", "3"),
  edge("b-d", "2", "4"),
  edge("c-e", "3", "5"),
  edge("d-e", "4", "5"),
];
const connectedNodeIds = computed(() => {
  const id = hoveredNodeId.value;
  if (!id) return new Set<string>();
  return new Set(
    edgeData
      .filter((edge) => edge.source === id || edge.target === id)
      .flatMap((edge) => [edge.source, edge.target]),
  );
});
const nodes = computed(() =>
  taskData.map(({ id, x, y, ...data }) => ({
    id,
    type: "task",
    position: { x, y },
    data: { ...data, nodeId: id },
    class:
      !hoveredNodeId.value || connectedNodeIds.value.has(id)
        ? id === hoveredNodeId.value
          ? "sequence-node--current"
          : "sequence-node--connected"
        : "sequence-node--dim",
  })),
);
const edges = computed(() =>
  edgeData.map((edge) => {
    const active = edge.source === hoveredNodeId.value || edge.target === hoveredNodeId.value;
    return {
      ...edge,
      class: active ? "sequence-edge--active" : hoveredNodeId.value ? "sequence-edge--dim" : "",
      style: {
        stroke: active ? "#ff8a24" : "#8fa0b8",
        strokeWidth: active ? 4 : 2.4,
      },
    };
  }),
);
function onNodeClick(event: NodeMouseEvent) {
  emit("select", Number(event.node.id));
}
function agentInfo(name: string): Agent | undefined {
  return props.agents.find((agent) => agent.name === name);
}
</script>

<style scoped>
.sequence {
  border: 1px solid var(--app-border-subtle);
  border-radius: 11px;
  background: var(--app-settings-card);
  overflow: hidden;
}
.sequence > header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.sequence > header strong {
  font-size: 0.8125rem;
}
.sequence > header span {
  color: var(--app-text-secondary);
  font-size: 0.75rem;
}
.sequence-flow {
  height: 420px;
  background: var(--app-settings-card);
}
.task-node-wrap {
  position: relative;
  width: 260px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
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
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
:deep(.sequence-node--current) {
  z-index: 4 !important;
  filter: drop-shadow(0 8px 13px rgb(255 138 36 / 20%));
}
:deep(.sequence-node--current .task-card-ui) {
  border-color: #ff8a24;
}
:deep(.vue-flow__node) {
  cursor: pointer;
}
@media (max-width: 640px) {
  .sequence-flow {
    min-width: 760px;
    height: 340px;
  }
  .sequence {
    overflow-x: auto;
  }
}
</style>
