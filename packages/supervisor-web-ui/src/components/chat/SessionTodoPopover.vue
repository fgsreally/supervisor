<template>
  <div class="todo-popover-wrap">
    <button
      class="chat-context-button"
      type="button"
      :title="`Todo · ${todos.length}`"
      @click="open = !open"
    >
      <ClipboardList class="h-[17px] w-[17px]" />
      <span>{{ todos.length }}</span>
    </button>
    <section v-if="open" class="todo-popover" aria-label="Todo">
      <header>
        Todo <span>{{ completedCount }}/{{ todos.length }}</span>
      </header>
      <ul>
        <li v-for="todo in todos" :key="`${todo.status}:${todo.title}`">
          <CheckCircle2 v-if="todo.status === 'done'" class="todo-done" />
          <Loader2 v-else-if="todo.status === 'in_progress'" class="todo-progress" />
          <Circle v-else />
          <span :class="{ completed: todo.status === 'done' }">{{ todo.title }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { CheckCircle2, Circle, ClipboardList, Loader2 } from "lucide-vue-next";
import type { TodoItem } from "@/api";

const props = defineProps<{ todos: TodoItem[] }>();
const open = ref(false);
const completedCount = computed(() => props.todos.filter((todo) => todo.status === "done").length);
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
  justify-content: space-between;
  padding: 11px 13px;
  color: var(--app-text-primary);
  font-size: 13px;
  font-weight: 600;
}
.todo-popover header span {
  color: var(--app-text-muted);
  font-weight: 400;
}
.todo-popover ul {
  padding: 0 6px 7px;
}
.todo-popover li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 8px;
  border-radius: 7px;
  color: var(--app-text-primary);
  font-size: 13px;
}
.todo-popover li:hover {
  background: var(--app-popup-hover);
}
.todo-popover li svg {
  width: 15px;
  height: 15px;
  margin-top: 2px;
  color: var(--app-text-muted);
}
.todo-popover li .todo-done,
.todo-popover li .todo-progress {
  color: var(--app-accent);
}
.completed {
  color: var(--app-text-muted);
  text-decoration: line-through;
}
@media (max-width: 767px) {
  .todo-popover {
    position: fixed;
    top: 64px;
    right: 10px;
    left: 10px;
    width: auto;
  }
}
</style>
