<template>
  <div class="mobile-work" data-tour-page="work">
    <header class="mobile-work__header">
      <div>
        <h1>工作</h1>
        <p>{{ mode === "todo" ? "关注正在推进和下一步要做的事" : "查看近期完成和需要关注的工作" }}</p>
      </div>
      <div class="mobile-work__segments" aria-label="工作视图">
        <button
          type="button"
          :class="{ active: mode === 'todo' }"
          @click="emit('navigate', '/todo')"
        >
          任务
        </button>
        <button
          type="button"
          :class="{ active: mode === 'dashboard' }"
          @click="emit('navigate', '/dashboard')"
        >
          概览
        </button>
      </div>
    </header>
    <div class="mobile-work__body"><slot /></div>
  </div>
</template>

<script setup lang="ts">
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
  background: var(--m-page-bg);
}

.mobile-work__header {
  flex: 0 0 auto;
  padding: calc(14px + env(safe-area-inset-top)) 16px 10px;
  border-bottom: 1px solid var(--m-divider);
  background: var(--m-header-bg);
}

.mobile-work__header h1 {
  font-size: var(--m-font-page-title);
  font-weight: var(--m-font-page-title-weight);
}

.mobile-work__header p {
  margin-top: 3px;
  color: var(--m-text-secondary);
  font-size: 12px;
}

.mobile-work__segments {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  margin-top: 12px;
  padding: 3px;
  border-radius: 9px;
  background: var(--m-pressed);
}

.mobile-work__segments button {
  min-height: 34px;
  border-radius: 7px;
  color: var(--m-text-secondary);
  font-size: 14px;
}

.mobile-work__segments button.active {
  background: var(--m-surface);
  color: var(--m-text-primary);
  box-shadow: 0 1px 3px rgb(0 0 0 / 10%);
}

.mobile-work__body {
  display: flex;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.mobile-work__body :deep(.todo-view__header),
.mobile-work__body :deep(.home-view__header) {
  display: none;
}
</style>
