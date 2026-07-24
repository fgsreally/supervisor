<template>
  <Teleport to="body">
    <Transition name="external-import">
      <div
        v-if="open"
        class="fixed inset-0 z-[210] flex items-center justify-center p-4"
        @mousedown.self="emit('close')"
      >
        <div class="absolute inset-0 bg-black/40" />
        <div
          class="external-import-modal relative flex max-h-[min(76vh,620px)] w-full max-w-[560px] flex-col overflow-hidden rounded-lg border shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="external-import-title"
          @mousedown.stop
        >
          <header
            class="external-import-modal__header flex shrink-0 items-center gap-3 border-b px-4 py-3"
          >
            <div class="min-w-0 flex-1">
              <h2 id="external-import-title" class="text-[15px] font-medium">从外部引入</h2>
              <p class="mt-0.5 text-[12px] external-import-modal__muted">
                选择最近活跃的 Codex 或 Claude Code 对话
              </p>
            </div>
            <button
              type="button"
              class="external-import-modal__icon"
              :disabled="loading"
              @click="load"
            >
              <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
            </button>
            <button type="button" class="external-import-modal__icon" @click="emit('close')">
              <X class="h-5 w-5" />
            </button>
          </header>

          <div
            v-if="sessions.length"
            class="external-import-modal__toolbar shrink-0 border-b px-4 py-2"
          >
            <div class="relative">
              <Search
                class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                style="color: var(--app-text-muted)"
              />
              <input
                v-model="filterQuery"
                type="search"
                placeholder="筛选标题、路径或来源"
                class="external-import-modal__search w-full rounded-md py-1.5 pl-8 pr-2 text-[13px] focus:outline-none"
              />
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="option in filterOptions"
                :key="option.value"
                type="button"
                class="external-import-modal__chip"
                :class="{ 'external-import-modal__chip--active': backendFilter === option.value }"
                @click="backendFilter = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div v-if="loading && !sessions.length" class="external-import-modal__state">
            正在读取外部对话…
          </div>
          <div v-else-if="error" class="external-import-modal__state external-import-modal__error">
            {{ error }}
          </div>
          <div v-else-if="!sessions.length" class="external-import-modal__state">
            没有找到可引入的对话
          </div>
          <div v-else-if="!filteredSessions.length" class="external-import-modal__state">
            没有匹配的对话
          </div>
          <ul v-else class="custom-scrollbar flex-1 overflow-y-auto">
            <li
              v-for="session in filteredSessions"
              :key="`${session.backend}:${session.externalSessionId}`"
            >
              <button
                type="button"
                class="external-import-modal__item flex w-full items-center gap-3 px-4 py-3 text-left"
                :disabled="importing"
                @click="emit('select', session)"
              >
                <span class="external-import-modal__badge shrink-0">{{
                  session.backend === "codex" ? "Codex" : "CC"
                }}</span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-baseline gap-2">
                    <strong class="min-w-0 flex-1 truncate text-[15px] font-normal">{{
                      session.title
                    }}</strong>
                    <time class="external-import-modal__time shrink-0">{{
                      formatDate(session.lastActiveAt)
                    }}</time>
                  </span>
                  <small class="external-import-modal__cwd mt-0.5 block truncate">{{
                    session.cwd
                  }}</small>
                </span>
              </button>
            </li>
          </ul>
          <div v-if="importing" class="external-import-modal__busy">
            正在提交原目录修改并创建 worktree…
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RefreshCw, Search, X } from "lucide-vue-next";
import { listExternalSessions, type ExternalSessionCandidate } from "@/api";

const props = defineProps<{ open: boolean; importing?: boolean }>();
const emit = defineEmits<{
  close: [];
  select: [session: ExternalSessionCandidate];
}>();
const sessions = ref<ExternalSessionCandidate[]>([]);
const loading = ref(false);
const error = ref("");
const filterQuery = ref("");
const backendFilter = ref<"all" | ExternalSessionCandidate["backend"]>("all");

const filterOptions = [
  { value: "all" as const, label: "全部" },
  { value: "codex" as const, label: "Codex" },
  { value: "claude" as const, label: "Claude Code" },
];

const filteredSessions = computed(() => {
  const q = filterQuery.value.trim().toLowerCase();
  return sessions.value.filter((session) => {
    if (backendFilter.value !== "all" && session.backend !== backendFilter.value) return false;
    if (!q) return true;
    const backendLabel = session.backend === "codex" ? "codex" : "claude cc";
    return (
      session.title.toLowerCase().includes(q) ||
      session.cwd.toLowerCase().includes(q) ||
      backendLabel.includes(q)
    );
  });
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    sessions.value = await listExternalSessions();
  } catch (value) {
    error.value = value instanceof Error ? value.message : "读取外部对话失败";
  } finally {
    loading.value = false;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      filterQuery.value = "";
      backendFilter.value = "all";
      void load();
    }
  },
);
</script>

<style scoped>
.external-import-modal {
  color: var(--app-text-primary);
  background: var(--app-popup-bg);
  border-color: var(--app-popup-border);
}
.external-import-modal__header,
.external-import-modal__toolbar {
  border-color: var(--app-border-subtle);
}
.external-import-modal__muted,
.external-import-modal__cwd,
.external-import-modal__time {
  color: var(--app-text-muted);
}
.external-import-modal__icon {
  padding: 4px;
  border-radius: 6px;
  color: var(--app-text-muted);
}
.external-import-modal__icon:hover {
  color: var(--app-text-primary);
  background: var(--app-hover);
}
.external-import-modal__search {
  background: var(--app-list-search-bg);
  color: var(--app-text-primary);
}
.external-import-modal__chip {
  border: 1px solid var(--app-border-subtle);
  border-radius: 999px;
  padding: 2px 10px;
  color: var(--app-text-secondary);
  font-size: 12px;
  background: transparent;
}
.external-import-modal__chip--active {
  border-color: color-mix(in srgb, var(--app-accent) 40%, transparent);
  color: var(--app-accent);
  background: color-mix(in srgb, var(--app-accent) 12%, transparent);
}
.external-import-modal__item {
  border-bottom: 1px solid var(--app-border-subtle);
}
.external-import-modal__item:hover {
  background: var(--app-popup-hover);
}
.external-import-modal__item:last-child {
  border-bottom: none;
}
.external-import-modal__badge {
  min-width: 44px;
  border-radius: 6px;
  padding: 10px 6px;
  text-align: center;
  font-size: 11px;
  line-height: 1;
  color: var(--app-text-secondary);
  background: var(--app-hover);
}
.external-import-modal__time {
  font-size: 11px;
  line-height: 1.4;
}
.external-import-modal__cwd {
  font-size: 12px;
  line-height: 1.4;
}
.external-import-modal__state,
.external-import-modal__busy {
  padding: 36px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--app-text-muted);
}
.external-import-modal__busy {
  padding: 10px 16px;
  border-top: 1px solid var(--app-border-subtle);
}
.external-import-modal__error {
  color: var(--app-danger, #dc2626);
}
.external-import-enter-active,
.external-import-leave-active {
  transition: opacity 0.2s ease;
}
.external-import-enter-from,
.external-import-leave-to {
  opacity: 0;
}
</style>
