<template>
  <div ref="root" class="todo-popover-wrap">
    <ChatHeaderAction
      :title="`Todo · ${todos.length}`"
      :active="open"
      :count="todos.length"
      @click="open = !open"
    >
      <ClipboardList />
    </ChatHeaderAction>
    <section v-if="open" class="todo-popover" aria-label="Todo">
      <header>
        Todo <span>{{ completedCount }}/{{ todos.length }}</span>
      </header>
      <ul>
        <li v-for="todo in todos" :key="`${todo.status}:${todo.title}`">
          <CheckCircle2 v-if="todo.status === 'completed'" class="todo-done" />
          <Loader2 v-else-if="todo.status === 'in_progress'" class="todo-progress" />
          <Circle v-else />
          <span
            :class="{ completed: todo.status === 'completed' || todo.status === 'cancelled' }"
            >{{ todo.title }}</span
          >
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { CheckCircle2, Circle, ClipboardList, Loader2 } from "lucide-vue-next";
import type { TodoItem } from "@/api";
import ChatHeaderAction from "./ChatHeaderAction.vue";
import { useOutsideDismiss } from "@/composables/use-outside-dismiss";

const props = withDefaults(defineProps<{ todos: TodoItem[]; dismissOnOutside?: boolean }>(), {
  dismissOnOutside: true,
});
const open = ref(false);
const root = ref<HTMLElement | null>(null);
useOutsideDismiss(
  root,
  () => (open.value = false),
  () => open.value && props.dismissOnOutside,
);
const completedCount = computed(
  () =>
    props.todos.filter((todo) => todo.status === "completed" || todo.status === "cancelled").length,
);
</script>

<style scoped>
.todo-popover-wrap {
  position: relative;
}
.todo-popover {
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
.todo-popover header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 8px;
  color: var(--app-text-primary);
  font-size: 13px;
  font-weight: 600;
}
.todo-popover header span {
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 400;
}
.todo-popover ul {
  margin: 0;
  max-height: min(50vh, 360px);
  overflow-y: auto;
  padding: 0 0 8px;
  list-style: none;
}
.todo-popover li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  color: var(--app-text-primary);
  font-size: 13px;
  line-height: 1.4;
}
.todo-popover li svg {
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
.todo-popover .completed {
  color: var(--app-text-muted);
  text-decoration: line-through;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
