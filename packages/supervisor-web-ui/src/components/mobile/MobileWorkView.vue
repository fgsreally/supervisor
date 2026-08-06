<template>
  <div class="mobile-work" data-tour-page="work">
    <header class="mobile-work__header m-mobile-header">
      <span aria-hidden="true" />
      <h1 class="m-mobile-header__title">工作</h1>
      <div class="mobile-work__actions" aria-label="工作视图">
        <button
          type="button"
          :class="{ active: mode === 'todo' }"
          aria-label="任务"
          @click="emit('navigate', '/todo')"
        >
          <ListTodo />
        </button>
        <button
          type="button"
          :class="{ active: mode === 'dashboard' }"
          aria-label="概览"
          @click="emit('navigate', '/dashboard')"
        >
          <LayoutDashboard />
        </button>
      </div>
    </header>
    <div class="mobile-work__body"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { LayoutDashboard, ListTodo } from "lucide-vue-next";

defineProps<{ mode: "todo" | "dashboard" }>();
const emit = defineEmits<{ navigate: [route: "/todo" | "/dashboard"] }>();
</script>

<style scoped>
.mobile-work {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow-x: hidden;
  background: var(--app-list-section-bg);
}

.mobile-work__header {
  flex: 0 0 auto;
}

.mobile-work__actions {
  display: flex;
  justify-self: end;
  gap: 4px;
}

.mobile-work__actions button {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 999px;
  color: var(--m-text-secondary);
  -webkit-tap-highlight-color: transparent;
}

.mobile-work__actions button:active {
  background: var(--m-pressed);
}

.mobile-work__actions button.active {
  color: var(--m-accent);
  background: color-mix(in srgb, var(--m-accent) 13%, transparent);
}

.mobile-work__actions svg {
  width: 21px;
  height: 21px;
}

.mobile-work__body {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.mobile-work__body :deep(.todo-view__header),
.mobile-work__body :deep(.home-view__header) {
  display: none;
}

.mobile-work__body :deep(.todo-shell),
.mobile-work__body :deep(.dashboard) {
  background: var(--app-list-section-bg);
}
</style>
