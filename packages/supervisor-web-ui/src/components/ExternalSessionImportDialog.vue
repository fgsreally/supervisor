<template>
  <Teleport to="body">
    <Transition name="external-import">
      <div
        v-if="open"
        class="fixed inset-0 z-[210] flex items-center justify-center p-4"
        @mousedown.self="onBackdrop"
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
              :disabled="loading || !!importingKey"
              @click="load"
            >
              <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
            </button>
            <button
              type="button"
              class="external-import-modal__icon"
              :disabled="!!importingKey"
              @click="emit('close')"
            >
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
            <li v-for="session in filteredSessions" :key="sessionKey(session)">
              <button
                type="button"
                class="external-import-modal__item flex w-full items-center gap-3 px-4 py-3 text-left"
                :class="{
                  'external-import-modal__item--imported': session.imported,
                  'external-import-modal__item--busy': importingKey === sessionKey(session),
                }"
                :disabled="!!importingKey"
                :title="session.imported ? '已引入，点击可重新导入（覆盖旧会话）' : undefined"
                @click="onSelect(session)"
              >
                <span class="external-import-modal__badge shrink-0">{{
                  session.backend === "codex" ? "Codex" : "CC"
                }}</span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-baseline gap-2">
                    <strong class="external-import-modal__title min-w-0 flex-1 truncate">{{
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
                <UiListStatus
                  :status="rowStatus(session)"
                  :title="rowStatusTitle(session)"
                />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RefreshCw, Search, X } from "lucide-vue-next";
import { listExternalSessions, type ExternalSessionCandidate } from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import { useSessionStore } from "@/store";
import UiListStatus, { type UiListStatusKind } from "./UiListStatus.vue";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  imported: [sessionId: string];
}>();

const sessionStore = useSessionStore();
const sessions = ref<ExternalSessionCandidate[]>([]);
const loading = ref(false);
const error = ref("");
const filterQuery = ref("");
const backendFilter = ref<"all" | ExternalSessionCandidate["backend"]>("all");
const importingKey = ref<string | null>(null);
const rowResults = ref<Record<string, "success" | "error">>({});

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

function sessionKey(session: ExternalSessionCandidate): string {
  return `${session.backend}:${session.externalSessionId}`;
}

function rowStatus(session: ExternalSessionCandidate): UiListStatusKind {
  const key = sessionKey(session);
  if (importingKey.value === key) return "loading";
  if (session.imported || rowResults.value[key] === "success") return "success";
  return rowResults.value[key] ?? "idle";
}

function rowStatusTitle(session: ExternalSessionCandidate): string | undefined {
  const status = rowStatus(session);
  if (status === "loading") return "正在引入…";
  if (status === "success") return session.imported ? "已引入（可点选重新导入）" : "引入成功";
  if (status === "error") return "引入失败";
  return undefined;
}

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

function onBackdrop() {
  if (importingKey.value) return;
  emit("close");
}

async function onSelect(session: ExternalSessionCandidate) {
  if (importingKey.value) return;
  if (session.imported) {
    const ok = window.confirm(
      `该对话已导入为会话 #${session.importedSessionId ?? "?"}。重新导入将删除旧会话并覆盖，是否继续？`,
    );
    if (!ok) return;
  }
  const key = sessionKey(session);
  importingKey.value = key;
  const nextResults = { ...rowResults.value };
  delete nextResults[key];
  rowResults.value = nextResults;
  try {
    const imported = await sessionStore.importExternalSession({
      backend: session.backend,
      externalSessionId: session.externalSessionId,
      replace: !!session.imported,
    });
    sessions.value = sessions.value.map((item) =>
      sessionKey(item) === key
        ? { ...item, imported: true, importedSessionId: Number(imported.id) }
        : item,
    );
    rowResults.value = { ...rowResults.value, [key]: "success" };
    showUiMessage(session.imported ? "外部对话已重新导入" : "外部对话已引入", "success");
    emit("imported", imported.id);
    emit("close");
  } catch (value) {
    rowResults.value = { ...rowResults.value, [key]: "error" };
    showUiMessage(value instanceof Error ? value.message : "引入外部对话失败", "error");
  } finally {
    importingKey.value = null;
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      filterQuery.value = "";
      backendFilter.value = "all";
      importingKey.value = null;
      rowResults.value = {};
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
  border: none;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
}
.external-import-modal__icon:hover:not(:disabled) {
  color: var(--app-accent);
}
.external-import-modal__icon:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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
  cursor: pointer;
}
.external-import-modal__chip--active {
  border-color: color-mix(in srgb, var(--app-accent) 40%, transparent);
  color: var(--app-accent);
  background: color-mix(in srgb, var(--app-accent) 12%, transparent);
}
.external-import-modal__item {
  border: none;
  border-bottom: 1px solid var(--app-border-subtle);
  background: transparent;
  cursor: pointer;
}
.external-import-modal__item:hover:not(:disabled) {
  background: var(--app-popup-hover);
}
.external-import-modal__item:hover:not(:disabled) .external-import-modal__title {
  color: var(--app-accent);
}
.external-import-modal__item--imported {
  cursor: default;
  opacity: 0.72;
}
.external-import-modal__item--busy {
  cursor: default;
  pointer-events: none;
}
.external-import-modal__item:last-child {
  border-bottom: none;
}
.external-import-modal__badge {
  min-width: 36px;
  border-radius: 4px;
  padding: 3px 6px;
  text-align: center;
  font-size: 10px;
  line-height: 1.2;
  color: var(--app-text-muted);
  background: color-mix(in srgb, var(--app-hover) 80%, transparent);
}
.external-import-modal__title {
  color: var(--app-text-secondary);
  font-size: 15px;
  font-weight: 400;
  line-height: 1.35;
  transition: color 0.12s ease;
}
.external-import-modal__time {
  font-size: 11px;
  line-height: 1.4;
}
.external-import-modal__cwd {
  font-size: 12px;
  line-height: 1.4;
}
.external-import-modal__state {
  padding: 36px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--app-text-muted);
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
