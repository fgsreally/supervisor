<template>
  <div class="home-board">
    <div v-for="column in columns" :key="column.id" class="home-board__column">
      <header>
        <div class="home-board__title">
          <strong>{{ column.label }}</strong>
          <span>{{ tasksIn(column.statuses).length }}</span>
        </div>
        <button
          v-if="column.id === 'todo'"
          type="button"
          class="home-board__add"
          title="添加任务"
          @click="emit('create')"
        >
          <Plus class="h-4 w-4" />
        </button>
      </header>
      <div class="home-board__cards custom-scrollbar">
        <TaskCard
          v-for="task in tasksIn(column.statuses)"
          :key="task.id"
          class="home-task-card"
          :title="task.title"
          :description="task.description"
          :project-name="projectName(task)"
          :agent-id="task.agentId"
          :agent-name="agentName(task)"
          :agent-avatar="agentAvatar(task)"
          :status="task.status"
          :status-label="statusLabel(task.status)"
          :accent="task.status"
          interactive
          @select="emit('select', task)"
        >
          <template #meta>
            <span v-if="phaseLabel(task)">{{ phaseLabel(task) }}</span>
            <span v-if="childrenOf(task.id).length">
              {{ doneChildren(task.id) }}/{{ childrenOf(task.id).length }}
            </span>
            <span v-if="task.error" class="home-task-card__error">{{ task.error }}</span>
          </template>
          <ul
            v-if="expandedId === task.id && childrenOf(task.id).length"
            class="home-task-card__kids"
          >
            <li v-for="child in childrenOf(task.id)" :key="child.id">
              <span :data-status="child.status">{{ child.status }}</span>
              <strong>{{ child.title }}</strong>
              <em v-if="child.dependsOn?.length">依赖 {{ child.dependsOn.length }} 项</em>
              <button
                v-if="child.sessionId"
                type="button"
                class="home-task-card__btn"
                @click.stop="emit('open-session', child)"
              >
                打开会话
              </button>
            </li>
          </ul>
          <div class="home-task-card__actions">
            <button
              v-if="canPlan(task)"
              type="button"
              class="home-task-card__btn"
              :disabled="busyId === task.id"
              @click.stop="emit('plan', task)"
            >
              规划
            </button>
            <button
              v-if="task.phase === 'awaiting_confirm'"
              type="button"
              class="home-task-card__btn"
              @click.stop="emit('review', task)"
            >
              确认
            </button>
            <button
              v-if="childrenOf(task.id).length"
              type="button"
              class="home-task-card__btn"
              @click.stop="expandedId = expandedId === task.id ? null : task.id"
            >
              {{ expandedId === task.id ? "收起" : "展开" }}
            </button>
            <button
              v-if="task.sessionId"
              type="button"
              class="home-task-card__btn"
              @click.stop="emit('open-session', task)"
            >
              打开会话
            </button>
          </div>
        </TaskCard>
        <div v-if="!tasksIn(column.statuses).length" class="home-board__empty">暂无</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Plus } from "lucide-vue-next";
import type { Agent, HomeTask, HomeTaskStatus, Project } from "@/api";
import TaskCard from "@/components/task/TaskCard.vue";

const props = defineProps<{
  tasks: HomeTask[];
  projects: Project[];
  agents?: Agent[];
  busyId?: number | null;
}>();

const emit = defineEmits<{
  create: [];
  select: [task: HomeTask];
  plan: [task: HomeTask];
  review: [task: HomeTask];
  "open-session": [task: HomeTask];
}>();

const expandedId = ref<number | null>(null);

const columns: Array<{ id: string; label: string; statuses: HomeTaskStatus[] }> = [
  { id: "todo", label: "待办", statuses: ["backlog", "todo"] },
  { id: "doing", label: "进行中", statuses: ["in_progress"] },
  { id: "blocked", label: "阻塞 / 错误", statuses: ["blocked", "error"] },
  { id: "done", label: "已完成", statuses: ["done"] },
];

const roots = computed(() => props.tasks.filter((task) => task.parentId == null));

function tasksIn(statuses: HomeTaskStatus[]): HomeTask[] {
  return roots.value.filter((task) => statuses.includes(task.status));
}

function childrenOf(id: number): HomeTask[] {
  return props.tasks.filter((task) => task.parentId === id);
}

function doneChildren(id: number): number {
  return childrenOf(id).filter((task) => task.status === "done").length;
}

function canPlan(task: HomeTask): boolean {
  if (task.parentId != null || !task.projectId) return false;
  if (task.phase === "executing" || task.phase === "planning") return false;
  if (childrenOf(task.id).some((child) => child.sessionId != null)) return false;
  return true;
}

function phaseLabel(task: HomeTask): string {
  if (task.phase === "planning") return "规划中";
  if (task.phase === "awaiting_confirm") return "待确认";
  if (task.phase === "executing") return "执行中";
  if (task.phase === "done") return "已完成";
  if (task.phase === "error") return "失败";
  return "";
}

function projectName(task: HomeTask): string {
  if (task.projectId == null) return "";
  return props.projects.find((project) => Number(project.id) === task.projectId)?.name ?? "";
}

function agent(task: HomeTask): Agent | undefined {
  if (task.agentId == null) return undefined;
  return props.agents?.find((item) => Number(item.id) === task.agentId);
}

function agentName(task: HomeTask): string {
  return agent(task)?.name ?? "";
}

function agentAvatar(task: HomeTask): string | null {
  return agent(task)?.avatar ?? null;
}

function statusLabel(status: HomeTaskStatus): string {
  return {
    backlog: "待办",
    todo: "待办",
    in_progress: "进行中",
    blocked: "阻塞",
    done: "已完成",
    error: "失败",
  }[status];
}
</script>

<style scoped>
.home-board {
  display: grid;
  grid-template-columns: repeat(4, minmax(140px, 1fr));
  gap: 8px;
  height: 100%;
  min-height: 0;
  padding: 8px;
}
.home-board__column {
  display: flex;
  min-height: 0;
  max-height: 100%;
  flex-direction: column;
  border-radius: 6px;
  background: var(--app-hover);
  border: 1px solid var(--app-border-subtle);
}
.home-board__column header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.home-board__title {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}
.home-board__title strong {
  font-size: 12px;
  color: var(--app-text-primary);
}
.home-board__title span {
  font-size: 11px;
  color: var(--app-text-muted);
}
.home-board__add {
  display: inline-grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 5px;
  color: var(--app-text-secondary);
}
.home-board__add:hover {
  color: #07a65a;
  background: color-mix(in srgb, #07c160 12%, transparent);
}
.home-board__cards {
  flex: 1;
  overflow: auto;
  padding: 6px;
}
.home-board__empty {
  padding: 10px 4px;
  text-align: center;
  font-size: 11px;
  color: var(--app-text-muted);
}
.home-task-card {
  width: 100%;
}
.home-task-card + .home-task-card {
  margin-top: 5px;
}
.home-task-card__error {
  color: var(--app-danger, #dc2626);
}
.home-task-card__kids {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.home-task-card__kids li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  padding: 4px 5px;
  border-radius: 4px;
  background: var(--app-hover);
  font-size: 10px;
  color: var(--app-text-secondary);
}
.home-task-card__kids strong {
  color: var(--app-text-primary);
  font-weight: 550;
}
.home-task-card__kids em {
  font-style: normal;
  color: var(--app-text-muted);
}
.home-task-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
.home-task-card__btn {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--app-text-secondary);
  background: var(--app-hover);
}
.home-task-card__btn:hover:not(:disabled) {
  color: #07a65a;
}
.home-task-card__btn:disabled {
  opacity: 0.5;
}
@media (max-width: 960px) {
  .home-board {
    grid-template-columns: repeat(2, minmax(140px, 1fr));
  }
}
@media (max-width: 640px) {
  .home-board {
    grid-template-columns: 1fr;
  }
}
</style>
