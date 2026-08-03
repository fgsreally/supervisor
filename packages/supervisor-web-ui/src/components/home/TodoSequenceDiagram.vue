<template>
  <section class="sequence">
    <header><strong>顺序图</strong><span>5 个任务</span></header>
    <VueFlow
      class="sequence-flow"
      :nodes="nodes"
      :edges="edges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="false"
      :zoom-on-scroll="false"
      :pan-on-drag="false"
      fit-view-on-init
      :fit-view-on-init-options="{ padding: 0.16 }"
      @node-click="onNodeClick"
    >
      <template #node-task="{ data }">
        <div class="task-node">
          <Handle type="target" :position="Position.Left" />
          <b>{{ data.letter }}</b>
          <span>
            <strong>{{ data.title }}</strong>
            <small><FolderGit2 />{{ data.project }}</small>
            <em
              ><i>{{ data.agent[0] }}</i
              >{{ data.agent }}</em
            >
          </span>
          <Handle type="source" :position="Position.Right" />
        </div>
      </template>
    </VueFlow>
  </section>
</template>

<script setup lang="ts">
import { Handle, MarkerType, Position, VueFlow, type NodeMouseEvent } from "@vue-flow/core";
import { FolderGit2 } from "lucide-vue-next";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

const emit = defineEmits<{ select: [id: number] }>();
const taskData = [
  {
    id: "1",
    letter: "A",
    title: "梳理数据模型",
    project: "supervisor",
    agent: "Codex",
    x: 20,
    y: 35,
  },
  {
    id: "2",
    letter: "B",
    title: "设计交互方案",
    project: "supervisor-web-ui",
    agent: "Claude",
    x: 20,
    y: 205,
  },
  {
    id: "3",
    letter: "C",
    title: "重构任务接口",
    project: "supervisor",
    agent: "Codex",
    x: 330,
    y: 35,
  },
  {
    id: "4",
    letter: "D",
    title: "实现 Todo 界面",
    project: "supervisor-web-ui",
    agent: "Claude",
    x: 330,
    y: 205,
  },
  {
    id: "5",
    letter: "E",
    title: "联调与验证",
    project: "supervisor-web-ui",
    agent: "Codex",
    x: 640,
    y: 120,
  },
];
const nodes = taskData.map(({ id, x, y, ...data }) => ({
  id,
  type: "task",
  position: { x, y },
  data,
}));
const edge = (id: string, source: string, target: string) => ({
  id,
  source,
  target,
  type: "bezier",
  markerEnd: MarkerType.ArrowClosed,
  style: { stroke: "#8fa0b8", strokeWidth: 2.4 },
});
const edges = [
  edge("a-c", "1", "3"),
  edge("b-d", "2", "4"),
  edge("c-e", "3", "5"),
  edge("d-e", "4", "5"),
];
function onNodeClick(event: NodeMouseEvent) {
  emit("select", Number(event.node.id));
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
  font-size: 12px;
}
.sequence > header span {
  color: var(--app-text-muted);
  font-size: 9px;
}
.sequence-flow {
  height: 390px;
  background: var(--app-settings-card);
}
.task-node {
  position: relative;
  display: flex;
  width: 230px;
  gap: 10px;
  padding: 13px;
  border: 1px solid var(--app-border);
  border-radius: 9px;
  text-align: left;
  background: var(--app-settings-bg);
  box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
}
.task-node > b {
  display: grid;
  width: 28px;
  height: 28px;
  flex: none;
  place-items: center;
  border-radius: 7px;
  background: #54c978;
  color: white;
  font-size: 12px;
}
.task-node > span {
  min-width: 0;
  display: grid;
  gap: 5px;
}
.task-node strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.task-node small,
.task-node em {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--app-text-muted);
  font-size: 9px;
  font-style: normal;
}
.task-node small svg {
  width: 11px;
  height: 11px;
  flex: none;
}
.task-node em i {
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  border-radius: 50%;
  background: #24292f;
  color: white;
  font-size: 8px;
  font-style: normal;
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
