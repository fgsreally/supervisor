<template>
  <div
    class="session-log-panel flex flex-col h-full w-full overflow-hidden"
    style="background: var(--app-settings-bg)"
  >
    <!-- Header -->
    <div
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

    <!-- Filter bar -->
    <div
      class="px-4 py-3 border-b space-y-2 shrink-0"
      style="border-color: var(--app-border-subtle)"
    >
      <div class="flex flex-wrap gap-2">
        <button
          v-for="lv in levels"
          :key="lv.key"
          type="button"
          class="px-2.5 py-1 rounded text-[12px] font-medium border transition-colors"
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
      <div v-if="allTags.length" class="flex flex-wrap gap-1.5">
        <button
          v-for="tag in allTags"
          :key="tag"
          type="button"
          class="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
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
      <div class="flex items-center gap-3 text-[12px]" style="color: var(--app-text-muted)">
        <span>{{ filteredEntries.length }} 条日志</span>
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

    <!-- Log entries -->
    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div
        v-if="!filteredEntries.length"
        class="py-12 text-center text-[13px]"
        style="color: var(--app-text-muted)"
      >
        暂无日志
      </div>
      <div
        v-for="(entry, i) in filteredEntries"
        :key="i"
        class="px-4 py-2.5 border-b text-[13px] leading-relaxed transition-colors hover:bg-[var(--app-hover)]"
        style="border-color: var(--app-border-subtle)"
      >
        <div class="flex items-center gap-2 mb-1">
          <span class="text-[11px] shrink-0 font-mono" style="color: var(--app-text-muted)">{{
            formatTime(entry.t)
          }}</span>
          <span
            class="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0"
            :style="{ background: levelBg(entry.l), color: levelColor(entry.l) }"
          >
            {{ entry.l }}
          </span>
          <span
            v-for="tag in entry.tags"
            :key="tag"
            class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
            :style="{ background: tagBg(tag), color: tagColor(tag) }"
          >
            {{ tag }}
          </span>
        </div>
        <div
          class="font-mono text-[12px] whitespace-pre-wrap break-all"
          style="color: var(--app-text-primary)"
        >
          {{ entry.m }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ChevronLeft } from "lucide-vue-next";
import type { LogEntry } from "@/api";
import { getSessionLog } from "@/api";

const props = defineProps<{
  sessionId: string;
}>();

const emit = defineEmits<{ close: [] }>();

const entries = ref<LogEntry[]>([]);
const levelFilter = ref<string | null>(null);
const tagFilter = ref<string[]>([]);
const loading = ref(false);

const levels = [
  { key: "debug", label: "DEBUG", color: "#10b981" },
  { key: "info", label: "INFO", color: "#3b82f6" },
  { key: "warn", label: "WARN", color: "#f59e0b" },
  { key: "error", label: "ERROR", color: "#ef4444" },
];

function levelColor(l: string): string {
  return levels.find((lv) => lv.key === l)?.color ?? "#6b7280";
}

function levelBg(l: string): string {
  return levelColor(l) + "22";
}

// Tag color wheel for tags without explicit mapping
const TAG_COLORS: Record<string, string> = {
  extension: "#6366f1",
  api: "#f59e0b",
  setup: "#10b981",
  tool: "#3b82f6",
  error: "#ef4444",
  auth: "#8b5cf6",
  config: "#ec4899",
  db: "#14b8a6",
  network: "#f97316",
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

const filteredEntries = computed(() => {
  let result = entries.value;
  if (levelFilter.value) {
    result = result.filter((e) => e.l === levelFilter.value);
  }
  if (tagFilter.value.length > 0) {
    result = result.filter((e) => e.tags && tagFilter.value.some((t) => e.tags!.includes(t)));
  }
  return result;
});

function toggleLevel(lv: string) {
  levelFilter.value = levelFilter.value === lv ? null : lv;
}

function toggleTag(tag: string) {
  const i = tagFilter.value.indexOf(tag);
  if (i >= 0) {
    tagFilter.value.splice(i, 1);
  } else {
    tagFilter.value.push(tag);
  }
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

async function fetchLogs() {
  loading.value = true;
  try {
    entries.value = await getSessionLog(props.sessionId);
  } catch {
    // silently fail
  }
  loading.value = false;
}

let pollTimer: ReturnType<typeof setInterval> | undefined;

watch(
  () => props.sessionId,
  (id) => {
    if (id) {
      void fetchLogs();
      pollTimer = setInterval(fetchLogs, 5000);
    }
    return () => {
      if (pollTimer) clearInterval(pollTimer);
    };
  },
  { immediate: true },
);
</script>

<style scoped>
.session-log-panel {
  min-width: 22rem;
  background: var(--app-popup-bg);
  border-left: 1px solid var(--app-border-subtle);
}

@media (max-width: 767px) {
  .session-log-panel {
    position: fixed;
    z-index: 70;
    inset: 0;
  }
}
</style>
