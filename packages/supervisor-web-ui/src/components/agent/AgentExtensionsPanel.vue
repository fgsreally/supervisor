<template>
  <div class="agent-ext">
    <div v-if="loading" class="agent-ext-loading">
      <Loader2 class="h-4 w-4 animate-spin" />
      {{ t("agent.extensionsLoading") }}
    </div>
    <div v-else class="agent-ext-content custom-scrollbar">
      <div class="agent-ext-list">
        <div v-for="item in extensions" :key="item.resourceId" class="agent-ext-row">
          <span class="agent-ext-icon"><Puzzle aria-hidden="true" /></span>
          <div class="agent-ext-row__main">
            <div class="agent-ext-row__heading">
              <span class="agent-ext-name truncate">{{ item.name }}</span>
              <span class="agent-ext-badge">
                {{ item.builtin ? t("agent.builtin") : t("agent.addedExtensions") }}
              </span>
            </div>
            <p v-if="item.description" class="agent-ext-desc">{{ item.description }}</p>
          </div>
          <UiActionButton
            v-if="!item.builtin"
            variant="ghost"
            :loading="removingId === item.resourceId"
            @click="remove(item)"
          >
            {{ t("agent.remove") }}
          </UiActionButton>
        </div>
        <div v-if="extensions.length === 0" class="agent-ext-empty">
          {{ t("agent.noUserExtensions") }}
        </div>
        <button type="button" class="agent-ext-add" @click="libraryOpen = true">
          <span class="agent-ext-add__icon"><Plus aria-hidden="true" /></span>
          <span>{{ t("resource.addFromGlobal") }}</span>
        </button>
      </div>
    </div>

    <ResponsiveDialog
      :open="libraryOpen"
      :title="t('resource.addFromGlobal')"
      width="sm"
      size="auto"
      @close="libraryOpen = false"
    >
      <div class="agent-ext-picker">
        <button
          v-for="item in unlinkedGlobal"
          :key="item.id"
          type="button"
          class="agent-ext-picker__row"
          :class="{ 'agent-ext-picker__row--busy': bindingItemId === item.id }"
          :disabled="bindingItemId !== null"
          @click="bindGlobalItem(item)"
        >
          <span class="agent-ext-picker__icon"><Puzzle aria-hidden="true" /></span>
          <span class="agent-ext-picker__main">
            <span class="agent-ext-name truncate">{{ item.name ?? item.slug }}</span>
            <span v-if="item.description" class="agent-ext-desc">{{ item.description }}</span>
          </span>
          <UiListStatus v-if="bindingItemId === item.id" status="loading" />
          <span v-else class="agent-ext-picker__add">
            <Plus aria-hidden="true" />
            {{ t("agent.addResource") }}
          </span>
        </button>
        <div v-if="unlinkedGlobal.length === 0" class="agent-ext-empty">
          {{ t("resource.noAvailableItems") }}
        </div>
      </div>
    </ResponsiveDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Loader2, Plus, Puzzle } from "lucide-vue-next";
import ResponsiveDialog from "@/components/base/ResponsiveDialog/index.vue";
import { useAgentStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import {
  bindCatalogResourceToAgent,
  listResourceCatalog,
  type AgentExtensionInfo,
  type CatalogResource,
} from "@/api/api";
import { useI18n } from "@/i18n";

const props = defineProps<{ agentId: string }>();

const agentStore = useAgentStore();
const { t } = useI18n();

const extensions = ref<AgentExtensionInfo[]>([]);
const catalog = ref<CatalogResource[]>([]);
const removingId = ref<number | null>(null);
const bindingItemId = ref<number | null>(null);
const loading = ref(false);
const libraryOpen = ref(false);

const builtinItems = computed(() => extensions.value.filter((item) => item.builtin));
const userItems = computed(() => extensions.value.filter((item) => !item.builtin));

const unlinkedGlobal = computed(() => {
  const linked = new Set(userItems.value.map((item) => item.slug));
  const builtinNames = new Set(builtinItems.value.flatMap((item) => [item.slug, item.name]));
  return catalog.value.filter((item) => {
    if (builtinNames.has(item.slug) || (item.name && builtinNames.has(item.name))) return false;
    return !linked.has(item.slug);
  });
});

async function reload() {
  loading.value = true;
  try {
    [catalog.value, extensions.value] = await Promise.all([
      listResourceCatalog("extension"),
      agentStore.fetchAgentExtensions(props.agentId),
    ]);
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.agentId,
  () => {
    void reload();
  },
  { immediate: true },
);

async function remove(item: AgentExtensionInfo) {
  if (item.builtin) return;
  removingId.value = item.resourceId;
  try {
    await agentStore.unbindAgentResource(props.agentId, item.resourceId);
    extensions.value = extensions.value.filter((row) => row.resourceId !== item.resourceId);
    showUiMessage(t("agent.removedResource", { name: item.name }), "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("agent.removeFailed"), "error");
  } finally {
    removingId.value = null;
  }
}

async function bindGlobalItem(item: CatalogResource) {
  try {
    bindingItemId.value = item.id;
    await bindCatalogResourceToAgent(props.agentId, { resourceId: item.id });
    await reload();
    libraryOpen.value = false;
    showUiMessage(t("agent.addedResource", { name: item.name ?? item.slug }), "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("agent.addFailed"), "error");
  } finally {
    bindingItemId.value = null;
  }
}
</script>

<style scoped>
.agent-ext {
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background: var(--app-settings-bg);
}

.agent-ext-content {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: 1.5rem;
}

.agent-ext-loading {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: var(--app-font-body);
  color: var(--app-text-secondary);
}

.agent-ext-list {
  max-width: 46rem;
  margin-inline: auto;
  overflow: hidden;
  border-top: 1px solid var(--app-border-subtle);
  border-bottom: 1px solid var(--app-border-subtle);
  background: var(--app-settings-card);
}

.agent-ext-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 4rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--app-border-subtle);
  transition: background-color var(--app-motion-fast);
}

.agent-ext-row:hover {
  background: var(--app-list-item-hover);
}

.agent-ext-icon {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  flex: none;
  place-items: center;
  border-radius: var(--app-radius-control);
  color: var(--app-accent);
  background: color-mix(in srgb, var(--app-accent) 12%, transparent);
}

.agent-ext-icon svg {
  width: 1.125rem;
  height: 1.125rem;
}

.agent-ext-row__main {
  min-width: 0;
  flex: 1;
}

.agent-ext-row__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.375rem;
}

.agent-ext-name {
  font-size: var(--app-font-body-strong);
  font-weight: var(--app-font-weight-medium);
  color: var(--app-text-primary);
}

.agent-ext-desc {
  margin-top: 0.2rem;
  font-size: var(--app-font-caption);
  line-height: 1.45;
  color: var(--app-text-secondary);
}

.agent-ext-badge {
  flex-shrink: 0;
  padding: 0.1rem 0.35rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-control);
  font-size: var(--app-font-micro);
  color: var(--app-text-secondary);
}

.agent-ext-empty {
  padding: 1.5rem 1rem;
  font-size: var(--app-font-body);
  color: var(--app-text-muted);
}

.agent-ext-add {
  display: flex;
  width: 100%;
  min-height: 3.5rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  font-size: var(--app-font-body-strong);
  color: var(--app-accent);
  transition: background-color var(--app-motion-fast);
}

.agent-ext-add:hover {
  background: var(--app-list-item-hover);
}

.agent-ext-add__icon {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border-radius: var(--app-radius-control);
  background: color-mix(in srgb, var(--app-accent) 12%, transparent);
}

.agent-ext-add__icon svg {
  width: 1.125rem;
  height: 1.125rem;
}

.agent-ext-picker {
  overflow: hidden;
  border-top: 1px solid var(--app-border-subtle);
  border-bottom: 1px solid var(--app-border-subtle);
}

.agent-ext-picker__row {
  display: flex;
  width: 100%;
  min-height: 4rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--app-border-subtle);
  text-align: left;
  transition: background-color var(--app-motion-fast);
}

.agent-ext-picker__row:last-child {
  border-bottom: 0;
}

.agent-ext-picker__row:hover:not(:disabled),
.agent-ext-picker__row--busy {
  background: var(--app-list-item-hover);
}

.agent-ext-picker__row:disabled:not(.agent-ext-picker__row--busy) {
  opacity: 0.55;
}

.agent-ext-picker__icon {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  flex: none;
  place-items: center;
  border-radius: var(--app-radius-control);
  color: var(--app-text-secondary);
  background: var(--app-list-item-hover);
}

.agent-ext-picker__icon svg {
  width: 1.125rem;
  height: 1.125rem;
}

.agent-ext-picker__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.agent-ext-picker__add {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.25rem;
  font-size: var(--app-font-control);
  font-weight: var(--app-font-weight-medium);
  color: var(--app-accent);
}

.agent-ext-picker__add svg {
  width: 1rem;
  height: 1rem;
}

@media (max-width: 767px) {
  .agent-ext-content {
    padding: 1rem 0;
  }
}
</style>
