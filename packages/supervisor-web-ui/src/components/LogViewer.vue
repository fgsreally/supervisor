<template>
  <div
    class="log-viewer flex h-full w-full flex-col overflow-hidden"
    :class="{ 'log-viewer--embedded': embedded }"
  >
    <div class="log-viewer__filters shrink-0 space-y-1.5 border-b">
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="lv in levels"
          :key="lv.key"
          type="button"
          class="rounded border px-2 py-0.5 text-[11px] font-medium transition-colors"
          :class="levelFilter === lv.key ? 'level-badge level-badge--active' : ''"
          :style="
            levelFilter === lv.key
              ? `background: ${lv.color}22; border-color: ${lv.color}; color: ${lv.color}`
              : 'border-color: var(--app-border); color: var(--app-text-muted)'
          "
          @click="toggleLevel(lv.key)"
        >
          {{ lv.label }}
        </button>
      </div>
      <div class="log-filter-row">
        <div v-if="allTags.length" class="log-filter-row__tags">
          <button
            v-for="tag in allTags"
            :key="tag"
            type="button"
            class="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
            :style="{
              background: tagFilter.includes(tag) ? tagBg(tag) : 'transparent',
              color: tagFilter.includes(tag) ? tagColor(tag) : 'var(--app-text-muted)',
              border: `1px solid ${tagFilter.includes(tag) ? tagColor(tag) : 'var(--app-border)'}`,
            }"
            @click="toggleTag(tag)"
          >
            #{{ tag }}
          </button>
        </div>
        <div class="log-filter-row__opts">
          <span>{{ filteredEntries.length }} 条</span>
          <label class="log-opt">
            <input v-model="showTime" type="checkbox" />
            显示时间
          </label>
          <label class="log-opt">
            <input v-model="showDelta" type="checkbox" />
            显示时间差
          </label>
          <button
            v-if="levelFilter || tagFilter.length"
            type="button"
            class="hover:underline"
            style="color: var(--app-text-link)"
            @click="clearFilters"
          >
            清除筛选
          </button>
        </div>
      </div>
    </div>

    <div ref="scrollEl" class="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div v-if="loading" class="py-10 text-center text-[12px]" style="color: var(--app-text-muted)">
        加载中…
      </div>
      <div
        v-else-if="!filteredEntries.length"
        class="py-10 text-center text-[12px]"
        style="color: var(--app-text-muted)"
      >
        {{ emptyText }}
      </div>

      <template v-for="(entry, i) in filteredEntries" :key="`${entry.t}-${i}-${entry.m.slice(0, 24)}`">
        <div
          class="log-row"
          :class="{ 'log-row--expanded': expandedIndex === i, 'log-row--has-meta': hasMeta(entry) }"
          :title="hasMeta(entry) ? '点击查看元数据' : undefined"
          @click="toggleMeta(i, entry)"
        >
          <span class="log-row__level" :style="{ color: levelColor(entry.l) }">{{ entry.l }}</span>
          <span v-if="entry.tags?.length" class="log-row__tags">
            <span v-for="tag in entry.tags" :key="tag" class="log-row__tag">{{ tag }}</span>
          </span>
          <span class="log-row__msg">{{ entry.m }}</span>
          <span v-if="hasMeta(entry)" class="log-row__meta-dot" aria-hidden="true">·</span>
          <span v-if="showTime" class="log-row__time">{{ formatTime(entry.t) }}</span>
          <span v-if="showDelta" class="log-row__delta" :title="deltaTitle(entry, i)">{{
            formatDelta(entry, i)
          }}</span>
        </div>
        <div v-if="expandedIndex === i && entry.meta" class="log-meta-panel">
          <pre>{{ formatMeta(entry.meta) }}</pre>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { LogEntry } from "@/api";

const SHOW_TIME_KEY = "pi-supervisor:session-log-show-time";
const SHOW_DELTA_KEY = "pi-supervisor:session-log-show-delta";

function readPref(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === "1" || raw === "true";
  } catch {
    return fallback;
  }
}

const props = withDefaults(
  defineProps<{
    entries: LogEntry[];
    loading?: boolean;
    embedded?: boolean;
    emptyText?: string;
    /** When true, scroll to bottom after entries change */
    stickToBottom?: boolean;
  }>(),
  {
    loading: false,
    embedded: false,
    emptyText: "暂无日志",
    stickToBottom: true,
  },
);

const levelFilter = ref<string | null>(null);
const tagFilter = ref<string[]>([]);
const showTime = ref(readPref(SHOW_TIME_KEY, false));
const showDelta = ref(readPref(SHOW_DELTA_KEY, true));
const expandedIndex = ref<number | null>(null);
const scrollEl = ref<HTMLElement | null>(null);

watch(showTime, (value) => {
  try {
    localStorage.setItem(SHOW_TIME_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
});
watch(showDelta, (value) => {
  try {
    localStorage.setItem(SHOW_DELTA_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
});

const levels = [
  { key: "debug", label: "DEBUG", color: "#10b981" },
  { key: "info", label: "INFO", color: "#3b82f6" },
  { key: "warn", label: "WARN", color: "#f59e0b" },
  { key: "error", label: "ERROR", color: "#ef4444" },
];

function levelColor(l: string): string {
  return levels.find((lv) => lv.key === l)?.color ?? "#6b7280";
}

const TAG_COLORS: Record<string, string> = {
  extension: "#6366f1",
  system: "#0ea5e9",
  git: "#22c55e",
  worktree: "#84cc16",
  runtime: "#f97316",
  approval: "#eab308",
  timing: "#64748b",
  setup: "#10b981",
  api: "#f59e0b",
  tool: "#3b82f6",
  error: "#ef4444",
  auth: "#8b5cf6",
  config: "#ec4899",
  db: "#14b8a6",
  network: "#f97316",
  legacy: "#94a3b8",
  start: "#22c55e",
  done: "#3b82f6",
  watson: "#07c160",
};

const COLOR_WHEEL = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
  "#f97316",
];

function tagColor(tag: string): string {
  if (TAG_COLORS[tag]) return TAG_COLORS[tag];
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash << 5) - hash + tag.charCodeAt(i);
  }
  return COLOR_WHEEL[Math.abs(hash) % COLOR_WHEEL.length];
}

function tagBg(tag: string): string {
  return tagColor(tag) + "22";
}

const allTags = computed(() => {
  const set = new Set<string>();
  for (const e of props.entries) {
    for (const t of e.tags ?? []) set.add(t);
  }
  return [...set].sort();
});

const filteredEntries = computed(() => {
  return props.entries.filter((entry) => {
    if (levelFilter.value && entry.l !== levelFilter.value) return false;
    if (tagFilter.value.length) {
      const tags = entry.tags ?? [];
      if (!tagFilter.value.every((tag) => tags.includes(tag))) return false;
    }
    return true;
  });
});

function toggleLevel(lv: string) {
  levelFilter.value = levelFilter.value === lv ? null : lv;
  expandedIndex.value = null;
}

function toggleTag(tag: string) {
  const i = tagFilter.value.indexOf(tag);
  if (i >= 0) tagFilter.value.splice(i, 1);
  else tagFilter.value.push(tag);
  expandedIndex.value = null;
}

function clearFilters() {
  levelFilter.value = null;
  tagFilter.value = [];
  expandedIndex.value = null;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDeltaMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `+${Math.round(ms)}ms`;
  if (ms < 60_000) return `+${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  if (ms < 3_600_000) {
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return seconds ? `+${minutes}m${seconds}s` : `+${minutes}m`;
  }
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  return minutes ? `+${hours}h${minutes}m` : `+${hours}h`;
}

function formatDelta(entry: LogEntry, index: number): string {
  if (index <= 0) return "·";
  const prev = filteredEntries.value[index - 1];
  if (!prev) return "·";
  return formatDeltaMs(entry.t - prev.t);
}

function deltaTitle(entry: LogEntry, index: number): string {
  if (index <= 0) return "首条";
  const prev = filteredEntries.value[index - 1];
  if (!prev) return "";
  return `距上条 ${entry.t - prev.t}ms`;
}

function formatMeta(meta: Record<string, unknown>): string {
  try {
    return JSON.stringify(meta, null, 2);
  } catch {
    return String(meta);
  }
}

function hasMeta(entry: LogEntry): boolean {
  return Boolean(entry.meta && Object.keys(entry.meta).length);
}

function toggleMeta(index: number, entry: LogEntry) {
  if (!hasMeta(entry)) return;
  expandedIndex.value = expandedIndex.value === index ? null : index;
}

async function scrollToBottom() {
  await nextTick();
  const el = scrollEl.value;
  if (!el) return;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  el.scrollTop = el.scrollHeight;
}

watch(
  () => props.entries,
  () => {
    expandedIndex.value = null;
    if (props.stickToBottom) void scrollToBottom();
  },
);
</script>

<style scoped>
.log-viewer {
  background: var(--app-popup-bg, var(--app-settings-bg));
}

.log-viewer--embedded {
  min-width: 0;
}

.log-viewer__filters {
  padding: 10px 12px;
  border-color: var(--app-border-subtle);
}

.log-filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.log-filter-row__tags {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.log-filter-row__opts {
  display: inline-flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  font-size: 11px;
  color: var(--app-text-muted);
}

.log-opt {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
}

.log-opt input {
  appearance: none;
  width: 13px;
  height: 13px;
  margin: 0;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  background: transparent;
  vertical-align: middle;
}

.log-opt input:checked {
  border-color: var(--app-accent, #07c160);
  background-color: var(--app-accent, #07c160);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M2.5 6.2 4.8 8.5 9.5 3.5'/%3E%3C/svg%3E");
  background-position: center;
  background-repeat: no-repeat;
  background-size: 10px 10px;
}

.log-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--app-border-subtle);
  color: var(--app-text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.4;
  cursor: default;
  white-space: nowrap;
}

.log-row--has-meta {
  cursor: pointer;
}

.log-row--expanded,
.log-row:hover {
  background: var(--app-hover);
}

.log-row__time {
  flex: none;
  margin-left: 4px;
  color: var(--app-text-muted);
}

.log-row__delta {
  flex: none;
  min-width: 2.75rem;
  color: var(--app-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.log-row__level {
  flex: none;
  min-width: 2.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.log-row__tags {
  display: inline-flex;
  flex: none;
  gap: 4px;
}

.log-row__tag {
  color: var(--app-text-secondary);
  font-size: 10px;
}

.log-row__msg {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-row__meta-dot {
  flex: none;
  color: var(--app-text-link);
}

.log-meta-panel {
  padding: 4px 10px 8px;
  border-bottom: 1px solid var(--app-border-subtle);
  background: color-mix(in srgb, var(--app-hover) 65%, transparent);
}

.log-meta-panel pre {
  margin: 0;
  overflow-x: auto;
  color: var(--app-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
