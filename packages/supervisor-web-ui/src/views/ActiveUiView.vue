<template>
  <div class="active-ui-view">
    <aside class="active-ui-view__list">
      <header class="active-ui-view__header">
        <div>
          <h1 class="active-ui-view__title">{{ t("activeUi.title") }}</h1>
          <p class="active-ui-view__meta">
            {{ sessionsLoading ? t("activeUi.loadingApps") : t("activeUi.entryCount", { count: entries.length }) }}
          </p>
        </div>
      </header>

      <div v-if="sessionsLoading" class="active-ui-view__state">
        <Loader2 class="active-ui-view__spin" aria-hidden="true" />
        <span>{{ t("activeUi.loadingApps") }}</span>
      </div>
      <UiEmptyState
        v-else-if="entries.length === 0"
        class="active-ui-view__empty-state"
        :title="t('activeUi.emptyTitle')"
        :description="t('activeUi.emptyDescription')"
      >
        <template #icon><AppWindow /></template>
      </UiEmptyState>
      <template v-else>
        <div class="active-ui-view__pager">
          <button type="button" :disabled="page <= 1" @click="page -= 1">{{ t("activeUi.previous") }}</button>
          <span>{{ page }} / {{ totalPages }}</span>
          <button type="button" :disabled="page >= totalPages" @click="page += 1">{{ t("activeUi.next") }}</button>
        </div>

        <div class="active-ui-view__items custom-scrollbar">
          <button
            v-for="entry in pageItems"
            :key="entry.key"
            type="button"
            class="active-ui-view__item"
            :class="{ 'active-ui-view__item--active': selectedKey === entry.key }"
            @click="selectEntry(entry)"
          >
            <strong>{{ entry.sessionTitle }}</strong>
            <span>{{ entry.label ?? entry.scriptName }}</span>
            <small>{{ entry.status === "starting" ? t("activeUi.starting") : t("activeUi.running") }}</small>
          </button>
        </div>
      </template>
    </aside>

    <section class="active-ui-view__preview">
      <div v-if="sessionsLoading" class="active-ui-view__state active-ui-view__state--preview">
        <Loader2 class="active-ui-view__spin" aria-hidden="true" />
        <span>{{ t("activeUi.loadingPreview") }}</span>
      </div>
      <UiEmptyState
        v-else-if="entries.length === 0"
        class="active-ui-view__empty-state active-ui-view__empty-state--preview"
        :title="t('activeUi.noPreview')"
        :description="t('activeUi.noPreviewDescription')"
      >
        <template #icon><AppWindow /></template>
      </UiEmptyState>
      <template v-else-if="selectedEntry">
        <header class="active-ui-view__preview-header">
          <div class="active-ui-view__preview-copy">
            <strong>{{ selectedEntry.sessionTitle }}</strong>
            <span>{{ selectedEntry.label ?? selectedEntry.scriptName }}</span>
          </div>
          <button type="button" class="active-ui-view__open-session" @click="openSelectedSession">
            {{ t("activeUi.openSession") }}
          </button>
        </header>
        <div v-if="previewLoading" class="active-ui-view__state active-ui-view__state--preview">
          <Loader2 class="active-ui-view__spin" aria-hidden="true" />
          <span>{{ t("activeUi.waking") }}</span>
        </div>
        <iframe
          v-else
          class="active-ui-view__frame"
          :src="selectedEntry.previewUrl"
          :title="`${selectedEntry.sessionTitle} · ${selectedEntry.label ?? selectedEntry.scriptName}`"
        />
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AppWindow, Loader2 } from "lucide-vue-next";
import {
  collectActiveUiEntries,
  paginateActiveUiEntries,
  type ActiveUiEntry,
} from "@/utils/active-ui-entries";
import { parseSessionServicesFromMeta } from "@/utils/session-services";
import { wakeSessionServices } from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import { toUISession } from "@/utils/ui-session";
import { useRootStore, useSessionStore } from "@/store";
import UiEmptyState from "@/components/base/UiEmptyState.vue";
import { useI18n } from "@/i18n";

const emit = defineEmits<{
  "open-session": [sessionId: string];
}>();

const PAGE_SIZE = 20;
const { t } = useI18n();
const page = ref(1);
const selectedKey = ref<string | null>(null);
const previewLoading = ref(false);
const sessionStore = useSessionStore();
const rootStore = useRootStore();

const sessionsLoading = computed(() => rootStore.loading.sessions);
const sessions = computed(() => sessionStore.sessions.map(toUISession));
const entries = computed(() => collectActiveUiEntries(sessions.value));
const pagination = computed(() => paginateActiveUiEntries(entries.value, page.value, PAGE_SIZE));
const pageItems = computed(() => pagination.value.items);
const totalPages = computed(() => pagination.value.totalPages);

const selectedEntry = computed(
  () => entries.value.find((entry) => entry.key === selectedKey.value) ?? null,
);

watch(
  entries,
  (next) => {
    if (next.length === 0) {
      selectedKey.value = null;
      return;
    }
    if (!next.some((entry) => entry.key === selectedKey.value)) {
      selectedKey.value = next[0]?.key ?? null;
    }
    if (page.value > paginateActiveUiEntries(next, page.value, PAGE_SIZE).totalPages) {
      page.value = 1;
    }
  },
  { immediate: true },
);

async function selectEntry(entry: ActiveUiEntry) {
  selectedKey.value = entry.key;
  const session = sessions.value.find((item) => item.id === entry.sessionId);
  const services = session ? parseSessionServicesFromMeta(session.meta) : null;
  if (services?.status === "stopped") {
    previewLoading.value = true;
    try {
      await wakeSessionServices(entry.sessionId);
      await sessionStore.fetchSession(entry.sessionId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      showUiMessage(t("activeUi.wakeFailed", { error: message }), "error");
    } finally {
      previewLoading.value = false;
    }
  }
}

function openSelectedSession() {
  if (!selectedEntry.value) return;
  emit("open-session", selectedEntry.value.sessionId);
}
</script>

<style scoped>
.active-ui-view {
  display: flex;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--app-shell-bg);
}

.active-ui-view__list {
  display: flex;
  flex-direction: column;
  width: 300px;
  min-width: 240px;
  max-width: 360px;
  border-right: 1px solid var(--app-border-subtle);
  background: var(--app-list-section-bg);
}

.active-ui-view__header {
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--app-border-subtle);
  background: var(--app-list-header-bg);
}

.active-ui-view__title {
  font-size: var(--app-font-title, 1rem);
  font-weight: var(--app-font-weight-semibold, 600);
  color: var(--app-text-primary);
}

.active-ui-view__meta {
  margin-top: 2px;
  font-size: var(--app-font-caption, 0.75rem);
  color: var(--app-text-muted);
}

.active-ui-view__state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 16px;
  color: var(--app-text-secondary);
  font-size: var(--app-font-control, 0.8125rem);
}

.active-ui-view__state--preview {
  flex: 1;
}

.active-ui-view__spin {
  width: 22px;
  height: 22px;
  animation: active-ui-spin 0.8s linear infinite;
}

.active-ui-view__empty-state {
  flex: 1;
  width: 100%;
  margin-inline: auto;
}

.active-ui-view__empty-state--preview {
  align-self: center;
}

.active-ui-view__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  font-size: var(--app-font-caption, 0.75rem);
  color: var(--app-text-secondary);
  border-bottom: 1px solid var(--app-border-subtle);
}

.active-ui-view__pager button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.active-ui-view__items {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  overflow-y: auto;
}

.active-ui-view__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  text-align: left;
  background: var(--app-chat-bg);
}

.active-ui-view__item strong {
  font-size: var(--app-font-control, 0.8125rem);
  color: var(--app-text-primary);
}

.active-ui-view__item span {
  font-size: var(--app-font-caption, 0.75rem);
  color: var(--app-text-secondary);
}

.active-ui-view__item small {
  font-size: var(--app-font-micro, 0.6875rem);
  color: var(--app-text-muted);
}

.active-ui-view__item--active {
  outline: 1px solid color-mix(in srgb, var(--app-accent) 45%, transparent);
  background: var(--app-list-item-active);
}

.active-ui-view__preview {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--app-chat-bg);
}

.active-ui-view__preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--app-border-subtle);
  background: var(--app-list-header-bg);
}

.active-ui-view__preview-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.active-ui-view__preview-copy strong {
  font-size: var(--app-font-body, 0.875rem);
  color: var(--app-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.active-ui-view__preview-copy span {
  font-size: var(--app-font-caption, 0.75rem);
  color: var(--app-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.active-ui-view__open-session {
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: var(--app-font-caption, 0.75rem);
  color: var(--app-text-primary);
  background: var(--app-hover);
}

.active-ui-view__open-session:hover {
  background: var(--app-list-item-active);
}

.active-ui-view__frame {
  flex: 1;
  width: 100%;
  min-height: 0;
  border: 0;
  background: #fff;
}

@keyframes active-ui-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
