<template>
  <div v-if="timers.length" class="timer-strip">
    <button
      class="timer-summary"
      type="button"
      :title="`${timers.length} 个定时器 · 下次 ${formatTime(timers[0]!.nextFireAt)}`"
      @click="open = !open"
    >
      <Clock3 class="h-4 w-4" />
      <span>{{ timers.length }}</span>
    </button>
    <div v-if="open" class="timer-list">
      <div v-for="timer in timers" :key="timer.id" class="timer-item">
        <div class="timer-item__prompt">{{ timer.prompt }}</div>
        <div class="timer-item__meta">
          <span>{{ formatTime(timer.nextFireAt) }}</span>
          <span v-if="timer.intervalMs">每 {{ formatInterval(timer.intervalMs) }}</span>
          <span v-else>一次性</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Clock3 } from "lucide-vue-next";

export interface SessionTimerView {
  id: string;
  prompt: string;
  createdAt: number;
  nextFireAt: number;
  intervalMs?: number;
}

defineProps<{ timers: SessionTimerView[] }>();
const open = ref(false);

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatInterval(value: number): string {
  if (value % 3_600_000 === 0) return `${value / 3_600_000} 小时`;
  if (value % 60_000 === 0) return `${value / 60_000} 分钟`;
  return `${value / 1000} 秒`;
}
</script>

<style scoped>
.timer-strip {
  position: relative;
}
.timer-summary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 8px;
  color: var(--app-text-secondary);
  background: color-mix(in srgb, var(--app-chat-bg) 88%, transparent);
  font-size: 10px;
  backdrop-filter: blur(6px);
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease;
}
.timer-summary:hover,
.timer-summary:focus-visible {
  color: #07a65a;
  background: var(--app-hover);
  outline: none;
}
.timer-summary:active {
  transform: scale(0.94);
}
.timer-list {
  position: absolute;
  z-index: 20;
  top: 34px;
  right: 0;
  width: min(420px, calc(100vw - 32px));
  padding: 6px;
  border: 1px solid var(--app-popup-border);
  border-radius: 10px;
  background: var(--app-popup-bg);
  box-shadow: 0 10px 30px rgb(0 0 0 / 16%);
}
.timer-item {
  padding: 8px;
  border-radius: 7px;
  transition: background-color 0.15s ease;
}
.timer-item:hover {
  background: var(--app-hover);
}

@media (max-width: 767px) {
  .timer-list {
    position: fixed;
    z-index: 90;
    top: auto;
    right: 10px;
    bottom: calc(74px + env(safe-area-inset-bottom));
    left: 10px;
    width: auto;
    max-height: min(46vh, 360px);
    overflow-y: auto;
    padding: 8px;
    border-radius: 12px;
    box-shadow: 0 12px 36px rgb(0 0 0 / 22%);
  }
}
.timer-item + .timer-item {
  border-top: 1px solid var(--app-border-subtle);
}
.timer-item__prompt {
  color: var(--app-text-primary);
  font-size: 13px;
}
.timer-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 11px;
}
</style>
