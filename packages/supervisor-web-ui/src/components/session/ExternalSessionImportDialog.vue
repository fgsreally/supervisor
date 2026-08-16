<template>
  <ResponsiveDialog
    :open="open"
    :title="t('session.import.title')"
    :description="t('session.import.description')"
    width="md"
    size="tall"
    :dismiss-on-backdrop="!importingKey"
    @close="onClose"
  >
    <template #header-actions>
      <button type="button" :title="t('common.refresh')" :disabled="loading || !!importingKey" @click="load">
        <RefreshCw :class="{ 'animate-spin': loading }" />
      </button>
    </template>

    <div class="external-import__body">
      <div v-if="sessions.length" class="external-import__toolbar">
        <div class="relative">
          <Search
            class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style="color: var(--app-text-muted)"
          />
          <input
            v-model="filterQuery"
            type="search"
            :placeholder="t('session.import.filterPlaceholder')"
            class="external-import__search w-full rounded-md py-1.5 pl-8 pr-2 text-[13px] focus:outline-none"
          />
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <button
            v-for="option in filterOptions"
            :key="option.value"
            type="button"
            class="external-import__chip"
            :class="{ 'external-import__chip--active': backendFilter === option.value }"
            @click="backendFilter = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div v-if="loading && !sessions.length" class="external-import__state">{{ t("session.import.loading") }}</div>
      <div v-else-if="error" class="external-import__state external-import__error">{{ error }}</div>
      <div v-else-if="!sessions.length" class="external-import__state">{{ t("session.import.empty") }}</div>
      <div v-else-if="!filteredSessions.length" class="external-import__state">{{ t("session.import.noMatch") }}</div>
      <div v-else class="external-import__list-wrap">
        <ul class="external-import__list custom-scrollbar">
          <li v-for="session in filteredSessions" :key="sessionKey(session)">
            <button
              type="button"
              class="external-import__item flex w-full items-center gap-3 text-left"
              :class="{
                'external-import__item--imported': session.imported,
                'external-import__item--busy': importingKey === sessionKey(session),
              }"
              :disabled="!!importingKey"
              :title="session.imported ? t('session.import.importedHint') : undefined"
              @click="onSelect(session)"
            >
              <span class="external-import__badge shrink-0">{{
                session.backend === "codex" ? "Codex" : "CC"
              }}</span>
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline gap-2">
                  <strong class="external-import__title min-w-0 flex-1 truncate">{{
                    session.title
                  }}</strong>
                  <time class="external-import__time shrink-0">{{
                    formatDate(session.lastActiveAt)
                  }}</time>
                </span>
                <small class="external-import__cwd mt-0.5 block truncate">{{ session.cwd }}</small>
              </span>
              <UiListStatus :status="rowStatus(session)" :title="rowStatusTitle(session)" />
            </button>
          </li>
          <li v-if="hasMore" class="external-import__more">
            <button type="button" :disabled="loadingMore" @click="loadMore">
              {{ loadingMore ? t("session.import.loadingMore") : t("session.import.loadEarlier") }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RefreshCw, Search } from "lucide-vue-next";
import { listExternalSessions, type ExternalSessionCandidate } from "@/api";
import { requestUiConfirm } from "@/composables/use-ui-confirm";
import { showUiMessage } from "@/composables/use-ui-message";
import ResponsiveDialog from "@/components/base/ResponsiveDialog/index.vue";
import { useSessionStore } from "@/store";
import UiListStatus, { type UiListStatusKind } from "@/components/base/UiListStatus.vue";
import { useI18n } from "@/i18n";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  imported: [sessionId: string];
}>();

const sessionStore = useSessionStore();
const { t } = useI18n();
const sessions = ref<ExternalSessionCandidate[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(false);
const nextOffset = ref(0);
const error = ref("");
const filterQuery = ref("");
const backendFilter = ref<"all" | ExternalSessionCandidate["backend"]>("all");
const importingKey = ref<string | null>(null);
const rowResults = ref<Record<string, "success" | "error">>({});

const filterOptions = [
  { value: "all" as const, label: t("common.all") },
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
  if (status === "loading") return t("session.import.importing");
  if (status === "success") return session.imported ? t("session.import.importedHint") : t("session.import.success");
  if (status === "error") return t("session.import.failed");
  return undefined;
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const page = await listExternalSessions();
    sessions.value = page.items;
    hasMore.value = page.hasMore;
    nextOffset.value = page.nextOffset;
  } catch (value) {
    error.value = value instanceof Error ? value.message : t("session.import.loadFailed");
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const page = await listExternalSessions({ offset: nextOffset.value });
    sessions.value.push(...page.items);
    hasMore.value = page.hasMore;
    nextOffset.value = page.nextOffset;
  } catch (value) {
    showUiMessage(value instanceof Error ? value.message : t("session.import.loadFailed"), "error");
  } finally {
    loadingMore.value = false;
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

function onClose() {
  if (importingKey.value) return;
  emit("close");
}

async function onSelect(session: ExternalSessionCandidate) {
  if (importingKey.value) return;
  if (session.imported) {
    const ok = await requestUiConfirm({
      title: t("session.import.reimportTitle"),
      message: t("session.import.reimportMessage", { id: session.importedSessionId ?? "?" }),
      confirmText: t("session.import.reimport"),
      danger: true,
    });
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
    showUiMessage(session.imported ? t("session.import.reimported") : t("session.import.imported"), "success");
    emit("imported", imported.id);
    emit("close");
  } catch (value) {
    rowResults.value = { ...rowResults.value, [key]: "error" };
    showUiMessage(value instanceof Error ? value.message : t("session.import.importFailed"), "error");
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
.external-import__body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 0;
}

.external-import__toolbar {
  flex: none;
  padding: 12px 16px;
  border-bottom: 1px solid var(--app-border-subtle);
  background: var(--app-popup-bg, var(--app-settings-card));
}

.external-import__search {
  background: var(--app-list-search-bg);
  color: var(--app-text-primary);
}

.external-import__chip {
  border: 1px solid var(--app-border-subtle);
  border-radius: 999px;
  padding: 2px 10px;
  color: var(--app-text-secondary);
  font-size: 12px;
  background: transparent;
  cursor: pointer;
}

.external-import__chip--active {
  border-color: color-mix(in srgb, var(--app-accent) 40%, transparent);
  color: var(--app-accent);
  background: color-mix(in srgb, var(--app-accent) 12%, transparent);
}

.external-import__list-wrap {
  flex: 1;
  min-height: 0;
  padding: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.external-import__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: var(--app-settings-card, var(--app-popup-bg));
}

.external-import__item {
  padding: 12px 14px;
  border: none;
  border-bottom: 1px solid var(--app-border-subtle);
  background: transparent;
  cursor: pointer;
}

.external-import__item:hover:not(:disabled) {
  background: var(--app-popup-hover);
}

.external-import__item:hover:not(:disabled) .external-import__title {
  color: var(--app-accent);
}

.external-import__item--imported {
  opacity: 0.72;
}

.external-import__item--busy {
  cursor: default;
  pointer-events: none;
}

.external-import__item:last-child {
  border-bottom: none;
}

.external-import__more {
  padding: 10px;
  text-align: center;
}

.external-import__more button {
  color: var(--app-accent);
  font-size: var(--app-font-control);
}

.external-import__badge {
  min-width: 36px;
  border-radius: 4px;
  padding: 3px 6px;
  text-align: center;
  font-size: 10px;
  line-height: 1.2;
  color: var(--app-text-muted);
  background: color-mix(in srgb, var(--app-hover) 80%, transparent);
}

.external-import__title {
  color: var(--app-text-secondary);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  transition: color 0.12s ease;
}

.external-import__time,
.external-import__cwd {
  color: var(--app-text-muted);
}

.external-import__time {
  font-size: 11px;
  line-height: 1.4;
}

.external-import__cwd {
  font-size: 12px;
  line-height: 1.4;
}

.external-import__state {
  padding: 48px 20px;
  text-align: center;
  font-size: 13px;
  color: var(--app-text-muted);
}

.external-import__error {
  color: var(--app-danger, #dc2626);
}

@media (min-width: 768px) {
  .external-import__toolbar {
    padding: 16px 20px;
  }

  .external-import__list-wrap {
    padding: 16px 20px 20px;
  }

  .external-import__list {
    border-radius: 12px;
  }

  .external-import__item {
    padding: 13px 16px;
  }
}
</style>
