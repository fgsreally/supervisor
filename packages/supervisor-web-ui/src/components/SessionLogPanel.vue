<template>
  <div
    class="session-log-panel flex flex-col h-full w-full overflow-hidden"
    style="background: var(--app-settings-bg)"
  >
    <div
      v-if="!mobile"
      class="h-14 md:h-16 border-b flex items-center px-4 shrink-0 gap-3"
      style="background: var(--app-settings-bg); border-color: var(--app-border)"
    >
      <button
        type="button"
        class="p-1.5 rounded-md"
        style="color: var(--app-text-secondary)"
        @click="$emit('close')"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>
      <div class="flex-1 min-w-0">
        <div class="text-[16px] font-medium" style="color: var(--app-text-primary)">会话日志</div>
      </div>
    </div>

    <div
      class="px-3 py-2 border-b space-y-1.5 shrink-0"
      style="border-color: var(--app-border-subtle)"
    >
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="lv in levels"
          :key="lv.key"
          type="button"
          class="px-2 py-0.5 rounded text-[11px] font-medium border transition-colors"
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
      <div v-if="allTags.length" class="flex flex-wrap gap-1">
        <button
          v-for="tag in allTags"
          :key="tag"
          type="button"
          class="px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors"
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
      <div class="flex items-center gap-3 text-[11px]" style="color: var(--app-text-muted)">
        <span>{{ entries.length }} 条{{ hasMoreOlder ? "+" : "" }}</span>
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

    <div ref="scrollEl" class="flex-1 overflow-y-auto custom-scrollbar">
      <div v-if="hasMoreOlder" class="px-3 py-2 text-center">
        <button type="button" class="log-load-more" :disabled="loadingOlder" @click="loadOlder">
          {{ loadingOlder ? "加载中…" : "加载更早" }}
        </button>
      </div>

      <div
        v-if="!entries.length && !loading"
        class="py-10 text-center text-[12px]"
        style="color: var(--app-text-muted)"
      >
        暂无日志
      </div>

      <template v-for="(entry, i) in entries" :key="`${entry.t}-${i}-${entry.m.slice(0, 24)}`">
        <div
          class="log-row"
          :class="{ 'log-row--expanded': expandedIndex === i, 'log-row--has-meta': hasMeta(entry) }"
          :title="hasMeta(entry) ? '点击查看元数据' : undefined"
          @click="toggleMeta(i, entry)"
        >
          <span class="log-row__time">{{ formatTime(entry.t) }}</span>
          <span class="log-row__level" :style="{ color: levelColor(entry.l) }">{{ entry.l }}</span>
          <span v-if="entry.tags?.length" class="log-row__tags">
            <span v-for="tag in entry.tags" :key="tag" class="log-row__tag">{{ tag }}</span>
          </span>
          <span class="log-row__msg">{{ entry.m }}</span>
          <span v-if="hasMeta(entry)" class="log-row__meta-dot" aria-hidden="true">·</span>
        </div>
        <div v-if="expandedIndex === i && entry.meta" class="log-meta-panel">
          <pre>{{ formatMeta(entry.meta) }}</pre>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { ChevronLeft } from "lucide-vue-next";
import type { LogEntry } from "@/api";
import { getSessionLog } from "@/api";

const LOG_PAGE_SIZE = 120;

const props = withDefaults(
  defineProps<{
    sessionId: string;
    mobile?: boolean;
    active?: boolean;
  }>(),
  { active: false },
);

defineEmits<{ close: [] }>();

const entries = ref<LogEntry[]>([]);
const levelFilter = ref<string | null>(null);
const tagFilter = ref<string[]>([]);
const loading = ref(false);
const loadingOlder = ref(false);
const hasMoreOlder = ref(false);
const expandedIndex = ref<number | null>(null);
const scrollEl = ref<HTMLElement | null>(null);

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
  for (const e of entries.value) {
    for (const t of e.tags ?? []) set.add(t);
  }
  return [...set].sort();
});

function queryOptions(extra?: { before?: number; after?: number }) {
  return {
    level: levelFilter.value ?? undefined,
    tags: tagFilter.value.length ? tagFilter.value : undefined,
    limit: LOG_PAGE_SIZE,
    ...extra,
  };
}

function toggleLevel(lv: string) {
  levelFilter.value = levelFilter.value === lv ? null : lv;
}

function toggleTag(tag: string) {
  const i = tagFilter.value.indexOf(tag);
  if (i >= 0) tagFilter.value.splice(i, 1);
  else tagFilter.value.push(tag);
}

function clearFilters() {
  levelFilter.value = null;
  tagFilter.value = [];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

async function fetchInitial() {
  if (loading.value) return;
  loading.value = true;
  expandedIndex.value = null;
  try {
    const result = await getSessionLog(props.sessionId, queryOptions());
    entries.value = result.entries;
    hasMoreOlder.value = result.hasMore;
  } catch {
    entries.value = [];
    hasMoreOlder.value = false;
  } finally {
    loading.value = false;
  }
}

async function loadOlder() {
  if (loadingOlder.value || !entries.value.length) return;
  loadingOlder.value = true;
  const el = scrollEl.value;
  const prevHeight = el?.scrollHeight ?? 0;
  try {
    const result = await getSessionLog(
      props.sessionId,
      queryOptions({ before: entries.value[0]!.t }),
    );
    entries.value = [...result.entries, ...entries.value];
    hasMoreOlder.value = result.hasMore;
    expandedIndex.value = null;
    await nextScrollRestore(el, prevHeight);
  } catch {
    // keep current page
  } finally {
    loadingOlder.value = false;
  }
}

async function nextScrollRestore(el: HTMLElement | null, prevHeight: number) {
  if (!el) return;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  el.scrollTop += el.scrollHeight - prevHeight;
}

async function pollNewer() {
  if (loading.value || loadingOlder.value) return;
  if (!entries.value.length) {
    await fetchInitial();
    return;
  }
  const last = entries.value[entries.value.length - 1];
  if (!last) return;
  try {
    const result = await getSessionLog(props.sessionId, queryOptions({ after: last.t }));
    if (result.entries.length) {
      entries.value = [...entries.value, ...result.entries];
    }
  } catch {
    // ignore poll errors
  }
}

let pollTimer: ReturnType<typeof setInterval> | undefined;

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

function startPolling() {
  stopPolling();
  if (!props.sessionId || !props.active) return;
  void fetchInitial();
  pollTimer = setInterval(() => {
    if (document.hidden || !props.active) return;
    void pollNewer();
  }, 10_000);
}

watch(
  () => [props.sessionId, props.active] as const,
  ([id, active]) => {
    stopPolling();
    if (id && active) startPolling();
  },
  { immediate: true },
);

watch([levelFilter, tagFilter], () => {
  if (props.sessionId && props.active) void fetchInitial();
});

onBeforeUnmount(stopPolling);
</script>

<style scoped>
.session-log-panel {
  min-width: 22rem;
  background: var(--app-popup-bg);
  border-left: 1px solid var(--app-border-subtle);
}

.log-load-more {
  padding: 2px 10px;
  border-radius: 4px;
  border: 1px solid var(--app-border);
  color: var(--app-text-secondary);
  font-size: 11px;
  background: transparent;
}

.log-load-more:hover:not(:disabled) {
  color: var(--app-text-primary);
  background: var(--app-hover);
}

.log-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 3px 10px;
  border-bottom: 1px solid var(--app-border-subtle);
  color: var(--app-text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.35;
  cursor: default;
  white-space: nowrap;
}

.log-row--has-meta {
  cursor: pointer;
}

.log-row--expanded {
  background: var(--app-hover);
}

.log-row:hover {
  background: var(--app-hover);
}

.log-row__time {
  flex: none;
  color: var(--app-text-muted);
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
