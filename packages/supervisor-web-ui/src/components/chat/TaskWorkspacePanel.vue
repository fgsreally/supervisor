<template>
  <aside class="task-workspace" aria-label="任务视窗">
    <header class="task-workspace__header">
      <div>
        <div class="task-workspace__eyebrow">任务视窗</div>
        <div class="task-workspace__title">{{ selectedTask?.title ?? "当前任务" }}</div>
      </div>
      <button
        class="task-workspace__close"
        type="button"
        aria-label="关闭任务视窗"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <nav v-if="entries.length > 1" class="task-workspace__tabs" aria-label="任务产物">
      <button
        v-for="task in entries"
        :key="task.path"
        class="task-workspace__tab"
        :class="{ 'task-workspace__tab--active': task.path === selectedPath }"
        type="button"
        @click="emit('select', task.path)"
      >
        <span class="task-workspace__type">{{ typeLabel(task.type) }}</span>
        <span class="task-workspace__tab-title">{{ task.title }}</span>
      </button>
    </nav>

    <div v-if="selectedTask" class="task-workspace__content">
      <div class="task-workspace__meta">
        <span class="task-workspace__type">{{ typeLabel(selectedTask.type) }}</span>
        <span>{{ statusLabel(selectedTask.status) }}</span>
        <span v-if="selectedTask.type !== 'todo'" class="task-workspace__path">
          {{ selectedTask.path }}
        </span>
      </div>
      <ul v-if="selectedTask.type === 'todo'" class="task-workspace__todos">
        <li v-for="todo in selectedTask.todos" :key="`${todo.status}:${todo.title}`">
          <span class="task-workspace__todo-status" :data-status="todo.status">
            {{ todo.status === "done" ? "✓" : todo.status === "in_progress" ? "●" : "○" }}
          </span>
          <span :class="{ 'task-workspace__todo-done': todo.status === 'done' }">
            {{ todo.title }}
          </span>
        </li>
      </ul>
      <MarkdownContent v-else :content="markdownBody" prose />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { TaskArtifact, TodoItem } from "@/api";
import MarkdownContent from "../MarkdownContent.vue";

const props = defineProps<{
  tasks: TaskArtifact[];
  todos: TodoItem[];
  selectedPath: string | null;
}>();

const emit = defineEmits<{
  close: [];
  select: [path: string];
}>();

type TaskEntry =
  | TaskArtifact
  | {
      path: "$todo";
      type: "todo";
      title: "Todo";
      status: "active";
      content: "";
      todos: TodoItem[];
    };

const entries = computed<TaskEntry[]>(() => [
  ...props.tasks,
  ...(props.todos.length
    ? ([
        {
          path: "$todo",
          type: "todo",
          title: "Todo",
          status: "active",
          content: "",
          todos: props.todos,
        },
      ] as const)
    : []),
]);
const selectedTask = computed(
  () => entries.value.find((task) => task.path === props.selectedPath) ?? entries.value[0] ?? null,
);
const markdownBody = computed(
  () => selectedTask.value?.content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "") ?? "",
);

function typeLabel(type: TaskEntry["type"]): string {
  return { goal: "Goal", plan: "Plan", todo: "Todo" }[type];
}

function statusLabel(status: string): string {
  return (
    {
      active: "进行中",
      planning: "规划中",
      paused: "已暂停",
      blocked: "受阻",
    }[status] ?? status
  );
}
</script>

<style scoped>
.task-workspace {
  display: flex;
  min-width: 0;
  flex: 0 0 50%;
  flex-direction: column;
  border-left: 1px solid var(--app-border-color, rgba(127, 127, 127, 0.22));
  background: var(--app-chat-bg);
}

.task-workspace__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--app-border-color, rgba(127, 127, 127, 0.22));
}

.task-workspace__eyebrow,
.task-workspace__meta {
  color: var(--app-text-muted);
  font-size: 12px;
}

.task-workspace__title {
  overflow: hidden;
  margin-top: 2px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-workspace__close {
  border: 0;
  padding: 4px 8px;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
  font-size: 22px;
}

.task-workspace__tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border-color, rgba(127, 127, 127, 0.22));
}

.task-workspace__tab {
  display: flex;
  min-width: 120px;
  flex-direction: column;
  align-items: flex-start;
  border: 1px solid var(--app-border-color, rgba(127, 127, 127, 0.22));
  border-radius: 8px;
  padding: 7px 9px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.task-workspace__tab--active {
  border-color: var(--app-accent, #64748b);
  background: color-mix(in srgb, var(--app-accent, #64748b) 10%, transparent);
}

.task-workspace__type {
  color: var(--app-accent, #64748b);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.task-workspace__tab-title,
.task-workspace__path {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-workspace__content {
  min-height: 0;
  overflow: auto;
  padding: 16px 20px 32px;
}

.task-workspace__meta {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.task-workspace__path {
  margin-left: auto;
}

.task-workspace__todos {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.task-workspace__todos li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.task-workspace__todo-status {
  width: 16px;
  flex: 0 0 16px;
  color: var(--app-text-muted);
  text-align: center;
}

.task-workspace__todo-status[data-status="in_progress"] {
  color: var(--app-accent, #64748b);
}

.task-workspace__todo-done {
  color: var(--app-text-muted);
  text-decoration: line-through;
}

@media (max-width: 800px) {
  .task-workspace {
    position: absolute;
    z-index: 20;
    inset: 0;
    width: 100%;
    border-left: 0;
  }
}
</style>
