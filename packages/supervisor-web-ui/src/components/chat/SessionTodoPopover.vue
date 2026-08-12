<template>
  <ResponsivePopover
    v-model:open="open"
    title="Todo"
    panel-class="todo-popover"
    :dismiss-on-outside="dismissOnOutside"
  >
    <template #trigger>
      <ChatHeaderAction
        :title="`Todo · ${todos.length}`"
        :active="open"
        :count="todos.length"
        @click="open = !open"
      >
        <ClipboardList />
      </ChatHeaderAction>
    </template>

    <template #default="{ mobile }">
      <header v-if="!mobile">
        Todo <span>{{ completedCount }}/{{ todos.length }}</span>
      </header>
      <div v-else class="todo-sheet-meta">{{ completedCount }}/{{ todos.length }}</div>
      <ul>
        <li v-for="todo in todos" :key="`${todo.status}:${todo.title}`">
          <CheckCircle2 v-if="todo.status === 'completed'" class="todo-done" />
          <Loader2 v-else-if="todo.status === 'in_progress'" class="todo-progress" />
          <Circle v-else />
          <span class="todo-item-copy">
            <span
              :class="{ completed: todo.status === 'completed' || todo.status === 'cancelled' }"
            >
              {{ todo.title }}
            </span>
            <small v-if="todo.dependsOn?.length" class="todo-item-deps">
              依赖：{{ todo.dependsOn.join("、") }}
            </small>
          </span>
        </li>
      </ul>
    </template>
  </ResponsivePopover>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { CheckCircle2, Circle, ClipboardList, Loader2 } from "lucide-vue-next";
import type { TodoItem } from "@/api";
import ResponsivePopover from "@/components/ui/ResponsivePopover.vue";
import ChatHeaderAction from "./ChatHeaderAction.vue";

const props = withDefaults(defineProps<{ todos: TodoItem[]; dismissOnOutside?: boolean }>(), {
  dismissOnOutside: true,
});
const open = ref(false);
const completedCount = computed(
  () =>
    props.todos.filter((todo) => todo.status === "completed" || todo.status === "cancelled").length,
);
</script>

<style scoped>
.todo-item-copy {
  display: grid;
  gap: 2px;
}

.todo-item-deps {
  color: var(--app-text-tertiary);
  font-size: var(--app-font-caption);
  font-weight: var(--app-font-weight-regular);
}

.todo-sheet-meta {
  margin: -4px 0 4px;
  color: var(--app-text-muted);
  font-size: 13px;
}

:deep(.todo-popover) {
  position: absolute;
  z-index: 30;
  top: 36px;
  right: 0;
  width: min(360px, calc(100vw - 32px));
  overflow: hidden;
  border: 1px solid var(--app-popup-border);
  border-radius: 10px;
  background: var(--app-popup-bg);
  box-shadow: 0 10px 30px rgb(0 0 0 / 16%);
}

:deep(.todo-popover) > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 8px;
  color: var(--app-text-primary);
  font-size: 13px;
  font-weight: 600;
}

:deep(.todo-popover) > header span {
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 400;
}

ul {
  margin: 0;
  max-height: min(50vh, 360px);
  overflow-y: auto;
  padding: 0 0 8px;
  list-style: none;
}

li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  color: var(--app-text-primary);
  font-size: 13px;
  line-height: 1.4;
}

li svg {
  width: 14px;
  height: 14px;
  margin-top: 2px;
  flex-shrink: 0;
  color: var(--app-text-muted);
}

.todo-done {
  color: var(--app-accent) !important;
}

.todo-progress {
  color: #f0c040 !important;
  animation: spin 1s linear infinite;
}

.completed {
  color: var(--app-text-muted);
  text-decoration: line-through;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 767px) {
  ul {
    max-height: none;
    padding: 0;
  }

  li {
    padding: 12px 4px;
    font-size: 15px;
  }

  li svg {
    width: 16px;
    height: 16px;
  }
}
</style>
