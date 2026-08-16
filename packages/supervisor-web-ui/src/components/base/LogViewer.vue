<template>
  <div class="log-viewer flex h-full w-full flex-col overflow-hidden" :class="{ 'log-viewer--embedded': embedded }">
    <div class="log-viewer__filters shrink-0 space-y-1.5 border-b">
      <div class="flex flex-wrap gap-1.5">
        <button v-for="lv in levels" :key="lv.key" type="button" class="rounded border px-2 py-0.5 text-[11px] font-medium transition-colors" :class="levelFilter === lv.key ? 'level-badge level-badge--active' : ''" :style="levelFilter === lv.key ? `background: ${lv.color}22; border-color: ${lv.color}; color: ${lv.color}` : 'border-color: var(--app-border); color: var(--app-text-muted)'" @click="toggleLevel(lv.key)">{{ lv.label }}</button>
      </div>
      <div class="log-filter-row">
        <div v-if="allTags.length" class="log-filter-row__tags">
          <button v-for="tag in allTags" :key="tag" type="button" class="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors" :style="{ background: tagFilter.includes(tag) ? tagBg(tag) : 'transparent', color: tagFilter.includes(tag) ? tagColor(tag) : 'var(--app-text-muted)', border: `1px solid ${tagFilter.includes(tag) ? tagColor(tag) : 'var(--app-border)'}` }" @click="toggleTag(tag)">#{{ tag }}</button>
        </div>
        <div class="log-filter-row__opts">
          <span>{{ t("log.count", { count: filteredEntries.length }) }}</span>
          <label class="log-opt"><input v-model="showTime" type="checkbox" />{{ t("log.showTime") }}</label>
          <label class="log-opt"><input v-model="showDelta" type="checkbox" />{{ t("log.showDelta") }}</label>
          <button v-if="levelFilter || tagFilter.length" type="button" class="hover:underline" style="color: var(--app-text-link)" @click="clearFilters">{{ t("log.clearFilters") }}</button>
        </div>
      </div>
    </div>
    <div ref="scrollEl" class="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div v-if="loading" class="py-10 text-center text-[12px]" style="color: var(--app-text-muted)">{{ t("log.loading") }}</div>
      <div v-else-if="!filteredEntries.length" class="py-10 text-center text-[12px]" style="color: var(--app-text-muted)">{{ emptyText ?? t("log.empty") }}</div>
      <template v-for="(entry, i) in filteredEntries" :key="`${entry.t}-${i}-${entry.m.slice(0, 24)}`">
        <div class="log-row" :class="{ 'log-row--expanded': expandedIndex === i, 'log-row--has-meta': hasMeta(entry) }" :title="hasMeta(entry) ? t('log.viewMetadata') : undefined" @click="toggleMeta(i, entry)">
          <span class="log-row__level" :style="{ color: levelColor(entry.l) }">{{ entry.l }}</span>
          <span v-if="entry.tags?.length" class="log-row__tags"><span v-for="tag in entry.tags" :key="tag" class="log-row__tag">{{ tag }}</span></span>
          <span class="log-row__msg">{{ entry.m }}</span>
          <span v-if="hasMeta(entry)" class="log-row__meta-dot" aria-hidden="true">·</span>
          <span v-if="showTime" class="log-row__time">{{ formatTime(entry.t) }}</span>
          <span v-if="showDelta" class="log-row__delta" :title="deltaTitle(entry, i)">{{ formatDelta(entry, i) }}</span>
        </div>
        <div v-if="expandedIndex === i && entry.meta" class="log-meta-panel"><pre>{{ formatMeta(entry.meta) }}</pre></div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { LogEntry } from "@/api";
import { useI18n } from "@/i18n";

const { t } = useI18n();
const SHOW_TIME_KEY = "pi-supervisor:session-log-show-time";
const SHOW_DELTA_KEY = "pi-supervisor:session-log-show-delta";
function readPref(key: string, fallback: boolean): boolean { try { const raw = localStorage.getItem(key); return raw == null ? fallback : raw === "1" || raw === "true"; } catch { return fallback; } }

const props = withDefaults(defineProps<{ entries: LogEntry[]; loading?: boolean; embedded?: boolean; emptyText?: string; stickToBottom?: boolean }>(), { loading: false, embedded: false, emptyText: undefined, stickToBottom: true });
const levelFilter = ref<string | null>(null);
const tagFilter = ref<string[]>([]);
const showTime = ref(readPref(SHOW_TIME_KEY, false));
const showDelta = ref(readPref(SHOW_DELTA_KEY, true));
const expandedIndex = ref<number | null>(null);
const scrollEl = ref<HTMLElement | null>(null);
watch(showTime, (value) => { try { localStorage.setItem(SHOW_TIME_KEY, value ? "1" : "0"); } catch {} });
watch(showDelta, (value) => { try { localStorage.setItem(SHOW_DELTA_KEY, value ? "1" : "0"); } catch {} });
const levels = [{ key: "debug", label: "DEBUG", color: "#10b981" }, { key: "info", label: "INFO", color: "#3b82f6" }, { key: "warn", label: "WARN", color: "#f59e0b" }, { key: "error", label: "ERROR", color: "#ef4444" }];
const TAG_COLORS: Record<string, string> = { extension: "#6366f1", system: "#0ea5e9", git: "#22c55e", worktree: "#84cc16", runtime: "#f97316", approval: "#eab308", timing: "#64748b" };
const COLOR_WHEEL = ["#14b8a6", "#ec4899", "#8b5cf6", "#f97316", "#06b6d4"];
function levelColor(level: string) { return levels.find((item) => item.key === level)?.color ?? "#6b7280"; }
function tagColor(tag: string) { return TAG_COLORS[tag] ?? COLOR_WHEEL[Math.max(0, [...new Set(props.entries.flatMap((entry) => entry.tags ?? []))].indexOf(tag)) % COLOR_WHEEL.length]; }
function tagBg(tag: string) { return `${tagColor(tag)}22`; }
const allTags = computed(() => [...new Set(props.entries.flatMap((entry) => entry.tags ?? []))].sort());
const filteredEntries = computed(() => props.entries.filter((entry) => (!levelFilter.value || entry.l === levelFilter.value) && (!tagFilter.value.length || tagFilter.value.every((tag) => entry.tags?.includes(tag)))));
function toggleLevel(level: string) { levelFilter.value = levelFilter.value === level ? null : level; expandedIndex.value = null; }
function toggleTag(tag: string) { const index = tagFilter.value.indexOf(tag); if (index >= 0) tagFilter.value.splice(index, 1); else tagFilter.value.push(tag); expandedIndex.value = null; }
function clearFilters() { levelFilter.value = null; tagFilter.value = []; expandedIndex.value = null; }
function formatTime(timestamp: number) { const date = new Date(timestamp); const pad = (value: number) => String(value).padStart(2, "0"); return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`; }
function formatDeltaMs(ms: number) { if (!Number.isFinite(ms) || ms < 0) return "—"; if (ms < 1000) return `+${Math.round(ms)}ms`; if (ms < 60_000) return `+${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`; if (ms < 3_600_000) { const minutes = Math.floor(ms / 60_000); const seconds = Math.round((ms % 60_000) / 1000); return seconds ? `+${minutes}m${seconds}s` : `+${minutes}m`; } const hours = Math.floor(ms / 3_600_000); const minutes = Math.round((ms % 3_600_000) / 60_000); return minutes ? `+${hours}h${minutes}m` : `+${hours}h`; }
function formatDelta(entry: LogEntry, index: number) { const previous = filteredEntries.value[index - 1]; return index <= 0 || !previous ? "·" : formatDeltaMs(entry.t - previous.t); }
function deltaTitle(entry: LogEntry, index: number) { const previous = filteredEntries.value[index - 1]; return index <= 0 || !previous ? t("log.firstEntry") : t("log.deltaTitle", { delta: entry.t - previous.t }); }
function formatMeta(meta: Record<string, unknown>) { try { return JSON.stringify(meta, null, 2); } catch { return String(meta); } }
function hasMeta(entry: LogEntry) { return Boolean(entry.meta && Object.keys(entry.meta).length); }
function toggleMeta(index: number, entry: LogEntry) { if (!hasMeta(entry)) return; expandedIndex.value = expandedIndex.value === index ? null : index; }
async function scrollToBottom() { await nextTick(); const element = scrollEl.value; if (element && props.stickToBottom) element.scrollTop = element.scrollHeight; }
watch(() => props.entries.length, () => void scrollToBottom());
</script>

<style scoped>
.log-viewer { background: var(--app-popup-bg, var(--app-settings-bg)); }
.log-viewer--embedded { min-width: 0; }
.log-viewer__filters { padding: 10px 12px; border-color: var(--app-border-subtle); }
.log-filter-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.log-filter-row__tags { display: flex; flex: 1 1 auto; flex-wrap: wrap; gap: 4px; min-width: 0; }
.log-filter-row__opts { display: inline-flex; flex: none; flex-wrap: wrap; align-items: center; gap: 10px; margin-left: auto; font-size: 11px; color: var(--app-text-muted); }
.log-opt { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; }
.log-opt input { appearance: none; width: 13px; height: 13px; margin: 0; border: 1px solid var(--app-border); border-radius: 3px; background: transparent; }
.log-opt input:checked { border-color: var(--app-accent, #07c160); background: var(--app-accent, #07c160); }
.log-row { display: flex; min-width: 0; align-items: center; gap: 8px; padding: 5px 12px; border-bottom: 1px solid var(--app-border-subtle); color: var(--app-text-primary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.4; white-space: nowrap; }
.log-row--has-meta { cursor: pointer; } .log-row--expanded, .log-row:hover { background: var(--app-hover); }
.log-row__time { flex: none; margin-left: 4px; color: var(--app-text-muted); } .log-row__delta { flex: none; min-width: 2.75rem; color: var(--app-text-muted); font-variant-numeric: tabular-nums; text-align: right; }
.log-row__level { flex: none; min-width: 2.75rem; font-weight: 600; text-transform: uppercase; } .log-row__tags { display: inline-flex; flex: none; gap: 4px; } .log-row__tag { color: var(--app-text-secondary); font-size: 10px; }
.log-row__msg { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; } .log-row__meta-dot { flex: none; color: var(--app-text-link); }
.log-meta-panel { padding: 4px 10px 8px; border-bottom: 1px solid var(--app-border-subtle); background: color-mix(in srgb, var(--app-hover) 65%, transparent); }
.log-meta-panel pre { margin: 0; overflow-x: auto; color: var(--app-text-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; line-height: 1.4; white-space: pre-wrap; word-break: break-all; }
</style>
