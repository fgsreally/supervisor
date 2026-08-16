<template>
  <div class="home-timeline">
    <header class="home-timeline__header">
      <div>
        <h2>{{ t("home.daily.title") }}</h2>
        <p>{{ t("home.daily.subtitle") }}</p>
      </div>
      <button
        type="button"
        class="home-timeline__refresh"
        :disabled="loading"
        :aria-label="t('common.refresh')"
        @click="emit('refresh')"
      >
        <RefreshCw :class="{ spin: loading }" />
      </button>
    </header>

    <div v-if="!records.length && !loading" class="home-timeline__empty">
      {{ t("home.daily.empty") }}
    </div>

    <ol v-else class="home-timeline__list">
      <li
        v-for="record in recentRecords"
        :key="record.dayKey"
        class="home-timeline__item"
        :class="{ 'home-timeline__item--open': openDay === record.dayKey }"
      >
        <button type="button" class="home-timeline__row" @click="toggle(record.dayKey)">
          <span class="home-timeline__dot" />
          <span class="home-timeline__main">
            <strong>{{ formatDay(record.dayKey) }}</strong>
            <small>
              {{ t("home.daily.commits", { count: commitCount(record) }) }}
              <template v-if="record.usedModel"> · {{ t("common.ai") }}</template>
            </small>
          </span>
          <span class="home-timeline__preview" v-if="openDay !== record.dayKey">{{
            record.summary
          }}</span>
          <ChevronDown class="home-timeline__chevron" aria-hidden="true" />
        </button>
        <div v-if="openDay === record.dayKey" class="home-timeline__body">
          <p class="home-timeline__summary">{{ record.summary }}</p>
          <div
            v-for="section in record.sections"
            :key="section.projectId"
            class="home-timeline__section"
          >
            <strong>{{ section.projectName }}</strong>
            <ul>
              <li v-for="commit in section.commits.slice(0, 6)" :key="commit.hash">
                <code>{{ commit.shortHash }}</code>
                {{ commit.subject }}
              </li>
            </ul>
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronDown, RefreshCw } from "lucide-vue-next";
import type { DailyWorkRecord } from "@/api";
import { useI18n } from "@/i18n";

const props = defineProps<{
  records: DailyWorkRecord[];
  loading?: boolean;
}>();
const { t, locale } = useI18n();

const emit = defineEmits<{ refresh: [] }>();
const openDay = ref<string | null>(null);
const recentRecords = computed(() => props.records.slice(0, 7));

watch(
  recentRecords,
  (rows) => {
    if (!rows.length) {
      openDay.value = null;
      return;
    }
    if (!openDay.value || !rows.some((row) => row.dayKey === openDay.value)) {
      openDay.value = rows[0]!.dayKey;
    }
  },
  { immediate: true },
);

function toggle(dayKey: string) {
  openDay.value = openDay.value === dayKey ? null : dayKey;
}

function commitCount(record: DailyWorkRecord): number {
  return record.sections.reduce((sum, section) => sum + section.commits.length, 0);
}

function formatDay(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return new Intl.DateTimeFormat(locale.value, {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}
</script>

<style scoped>
.home-timeline {
  padding: 4px 0 8px;
}
.home-timeline__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px 8px;
}
.home-timeline__header h2 {
  font-size: 15px;
  font-weight: 650;
  color: var(--app-text-primary);
}
.home-timeline__header p {
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 12px;
}
.home-timeline__refresh {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  color: var(--app-text-secondary);
}
.home-timeline__refresh:hover:not(:disabled) {
  background: var(--app-hover);
}
.home-timeline__refresh:disabled {
  opacity: 0.55;
}
.home-timeline__refresh svg {
  width: 15px;
  height: 15px;
}
.home-timeline__empty {
  padding: 8px 16px 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--app-text-muted);
}
.home-timeline__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.home-timeline__item {
  border-top: 1px solid var(--app-border-subtle);
}
.home-timeline__item--open {
  background: color-mix(in srgb, var(--app-accent) 4%, transparent);
}
.home-timeline__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "dot main chevron"
    "dot preview chevron";
  column-gap: 10px;
  width: 100%;
  min-height: 56px;
  align-items: center;
  padding: 10px 16px;
  text-align: left;
}
.home-timeline__dot {
  grid-area: dot;
  width: 7px;
  height: 7px;
  margin-top: 2px;
  align-self: start;
  border-radius: 50%;
  background: var(--app-accent);
}
.home-timeline__main {
  grid-area: main;
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
}
.home-timeline__main strong {
  font-size: 14px;
  font-weight: 600;
}
.home-timeline__main small {
  color: var(--app-text-muted);
  font-size: 12px;
}
.home-timeline__preview {
  grid-area: preview;
  margin: 2px 0 0;
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.home-timeline__item--open .home-timeline__preview {
  display: none;
}
.home-timeline__chevron {
  grid-area: chevron;
  width: 16px;
  height: 16px;
  color: var(--app-text-muted);
  transition: transform 0.15s ease;
}
.home-timeline__item--open .home-timeline__chevron {
  transform: rotate(180deg);
}
.home-timeline__body {
  padding: 0 16px 14px 33px;
}
.home-timeline__summary {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  color: var(--app-text-primary);
}
.home-timeline__section + .home-timeline__section {
  margin-top: 10px;
}
.home-timeline__section strong {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
}
.home-timeline__section ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.home-timeline__section li {
  font-size: 12px;
  line-height: 1.45;
  color: var(--app-text-muted);
}
.home-timeline__section code {
  margin-right: 5px;
  color: #576b95;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 767px) {
  .home-timeline__header,
  .home-timeline__empty,
  .home-timeline__row {
    padding-left: var(--m-page-inline, 16px);
    padding-right: var(--m-page-inline, 16px);
  }
  .home-timeline__body {
    padding-left: calc(var(--m-page-inline, 16px) + 17px);
    padding-right: var(--m-page-inline, 16px);
  }
  .home-timeline__row {
    min-height: 64px;
  }
  .home-timeline__main strong {
    font-size: 15px;
  }
}
</style>
