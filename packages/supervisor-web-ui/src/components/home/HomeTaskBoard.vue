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
        <button
          v-for="task in tasksIn(column.statuses)"
          :key="task.id"
          type="button"
          class="home-task-card"
          :class="`home-task-card--${task.priority}`"
          @click="emit('select', task)"
        >
          <div class="home-task-card__top">
            <span class="home-task-card__priority" :title="priorityLabel(task.priority)" />
            <strong>{{ task.title }}</strong>
          </div>
          <p v-if="task.description" class="home-task-card__desc">{{ task.description }}</p>
          <div class="home-task-card__meta">
            <span v-if="projectName(task)">{{ projectName(task) }}</span>
            <span v-if="childrenOf(task.id).length">
              {{ doneChildren(task.id) }}/{{ childrenOf(task.id).length }}
            </span>
            <span v-if="task.error" class="home-task-card__error">{{ task.error }}</span>
          </div>
          <div class="home-task-card__actions">
            <button
              v-if="!task.parentId && task.projectId && !childrenOf(task.id).length"
              type="button"
              class="home-task-card__btn"
              :disabled="busyId === task.id"
              @click.stop="emit('decompose', task)"
            >
              分解
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
        </button>
        <div v-if="!tasksIn(column.statuses).length" class="home-board__empty">暂无</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Plus } from "lucide-vue-next";
import type { HomeTask, HomeTaskPriority, HomeTaskStatus, Project } from "@/api";

const props = defineProps<{
  tasks: HomeTask[];
  projects: Project[];
  busyId?: number | null;
}>();

const emit = defineEmits<{
  create: [];
  select: [task: HomeTask];
  decompose: [task: HomeTask];
  "open-session": [task: HomeTask];
}>();

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

function projectName(task: HomeTask): string {
  if (task.projectId == null) return "";
  return props.projects.find((project) => Number(project.id) === task.projectId)?.name ?? "";
}

function priorityLabel(priority: HomeTaskPriority): string {
  if (priority === "urgent") return "紧急";
  if (priority === "high") return "高";
  if (priority === "low") return "低";
  return "普通";
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
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 7px;
  border-radius: 6px;
  border: 1px solid var(--app-border-subtle);
  background: var(--app-settings-card);
}
.home-task-card + .home-task-card {
  margin-top: 5px;
}
.home-task-card:hover {
  border-color: color-mix(in srgb, #07c160 30%, var(--app-border));
}
.home-task-card__top {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.home-task-card__priority {
  width: 6px;
  height: 6px;
  margin-top: 5px;
  border-radius: 999px;
  background: #9ca3af;
  flex: none;
}
.home-task-card--urgent .home-task-card__priority {
  background: #dc2626;
}
.home-task-card--high .home-task-card__priority {
  background: #ea580c;
}
.home-task-card--normal .home-task-card__priority {
  background: #07c160;
}
.home-task-card--low .home-task-card__priority {
  background: #9ca3af;
}
.home-task-card__top strong {
  font-size: 12px;
  line-height: 1.3;
  color: var(--app-text-primary);
}
.home-task-card__desc {
  margin: 4px 0 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 11px;
  color: var(--app-text-muted);
}
.home-task-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
  font-size: 10px;
  color: var(--app-text-secondary);
}
.home-task-card__error {
  color: var(--app-danger, #dc2626);
}
.home-task-card__actions {
  display: flex;
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
