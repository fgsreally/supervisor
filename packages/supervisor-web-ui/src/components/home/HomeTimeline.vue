<template>
  <div class="home-timeline">
    <header class="home-timeline__header">
      <h2>工作分析</h2>
      <button type="button" class="home-timeline__refresh" :disabled="loading" @click="emit('refresh')">
        <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
        刷新
      </button>
    </header>

    <div v-if="!records.length && !loading" class="home-timeline__empty">
      暂无每日分析记录。配置「当日工作分析」模型后，会自动汇总前一天的 sv commit。
    </div>

    <div v-else class="home-timeline__rail-wrap custom-scrollbar">
      <ol class="home-timeline__rail">
        <li
          v-for="record in records"
          :key="record.dayKey"
          class="home-timeline__card"
          :class="{ 'home-timeline__card--active': openDay === record.dayKey }"
        >
          <button type="button" class="home-timeline__card-head" @click="toggle(record.dayKey)">
            <span class="home-timeline__dot" />
            <span class="home-timeline__day">{{ record.dayKey }}</span>
            <span class="home-timeline__meta">
              {{ commitCount(record) }} commits
              <template v-if="record.usedModel"> · AI</template>
            </span>
          </button>
          <div v-if="openDay === record.dayKey" class="home-timeline__card-body">
            <p class="home-timeline__summary">{{ record.summary }}</p>
            <div
              v-for="section in record.sections"
              :key="section.projectId"
              class="home-timeline__section"
            >
              <strong>{{ section.projectName }}</strong>
              <ul>
                <li v-for="commit in section.commits.slice(0, 4)" :key="commit.hash">
                  <code>{{ commit.shortHash }}</code>
                  {{ commit.subject }}
                </li>
              </ul>
            </div>
          </div>
          <p v-else class="home-timeline__preview">{{ record.summary }}</p>
        </li>
      </ol>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { RefreshCw } from "lucide-vue-next";
import type { DailyWorkRecord } from "@/api";

defineProps<{
  records: DailyWorkRecord[];
  loading?: boolean;
}>();

const emit = defineEmits<{ refresh: [] }>();
const openDay = ref<string | null>(null);

function toggle(dayKey: string) {
  openDay.value = openDay.value === dayKey ? null : dayKey;
}

function commitCount(record: DailyWorkRecord): number {
  return record.sections.reduce((sum, section) => sum + section.commits.length, 0);
}
</script>

<style scoped>
.home-timeline {
  padding: 8px 10px 10px;
}
.home-timeline__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.home-timeline__header h2 {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-primary);
}
.home-timeline__refresh {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--app-text-secondary);
  background: var(--app-hover);
}
.home-timeline__empty {
  padding: 10px 2px 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--app-text-muted);
}
.home-timeline__rail-wrap {
  overflow-x: auto;
  overflow-y: hidden;
}
.home-timeline__rail {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0 0 2px;
  list-style: none;
  min-width: max-content;
}
.home-timeline__card {
  width: min(240px, 72vw);
  flex: none;
  border-radius: 6px;
  border: 1px solid var(--app-border-subtle);
  background: var(--app-hover);
  padding: 7px 8px;
}
.home-timeline__card--active {
  border-color: color-mix(in srgb, #07c160 40%, var(--app-border));
  background: color-mix(in srgb, #07c160 6%, var(--app-hover));
}
.home-timeline__card-head {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 6px;
  width: 100%;
  text-align: left;
}
.home-timeline__dot {
  grid-row: 1 / span 2;
  width: 6px;
  height: 6px;
  margin-top: 5px;
  border-radius: 999px;
  background: #07c160;
}
.home-timeline__day {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-primary);
}
.home-timeline__meta,
.home-timeline__preview {
  font-size: 11px;
  color: var(--app-text-muted);
}
.home-timeline__preview {
  margin: 5px 0 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  line-height: 1.4;
}
.home-timeline__card-body {
  margin-top: 6px;
  max-height: 120px;
  overflow: auto;
}
.home-timeline__summary {
  margin: 0 0 6px;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  color: var(--app-text-primary);
}
.home-timeline__section + .home-timeline__section {
  margin-top: 6px;
}
.home-timeline__section strong {
  display: block;
  margin-bottom: 2px;
  font-size: 11px;
  color: var(--app-text-secondary);
}
.home-timeline__section ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.home-timeline__section li {
  font-size: 11px;
  line-height: 1.35;
  color: var(--app-text-muted);
}
.home-timeline__section code {
  margin-right: 4px;
  color: var(--app-text-secondary);
}
</style>
