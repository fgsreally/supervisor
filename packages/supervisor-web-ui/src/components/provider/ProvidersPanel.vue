<template>
  <div class="provider-panel">
    <div
      v-if="!mobileSearchOpen"
      class="provider-panel__header m-centered-list-header"
    >
      <h1 class="provider-panel__title">{{ t("provider.title") }}</h1>
      <div class="m-centered-list-header__actions">
        <button
          type="button"
          class="mobile-search-trigger"
          :aria-label="t('common.search')"
          @click="mobileSearchOpen = true"
        >
          <Search />
        </button>
        <button
          type="button"
          class="list-header-btn"
          :title="t('provider.add')"
          @click="emit('add-provider')"
        >
          <Plus class="provider-panel__action-icon" />
        </button>
      </div>
    </div>

    <div v-else class="mobile-search-page provider-panel__header">
      <button type="button" :aria-label="t('common.back')" @click="mobileSearchOpen = false">
        <ArrowLeft />
      </button>
      <Search />
      <input v-model="query" type="search" :placeholder="t('provider.search')" autofocus />
    </div>

    <div class="panel-inline-search provider-panel__header">
      <div class="provider-panel__search-wrap">
        <Search class="provider-panel__search-icon provider-panel__muted" />
        <input
          v-model="query"
          type="text"
          :placeholder="t('provider.search')"
          class="list-search-input provider-panel__search"
        />
      </div>
    </div>

    <div class="provider-panel__list custom-scrollbar">
      <ProviderListItem
        v-for="provider in filteredProviders"
        :key="provider.id"
        :provider="provider"
        :active="activeId === provider.id"
        @select="emit('select-provider', $event)"
        @contextmenu.prevent.stop="openMenu($event, provider.id)"
      />
      <div v-if="!filteredProviders.length" class="provider-panel__empty provider-panel__muted">
        {{ t("provider.empty") }}
      </div>
    </div>

    <div
      v-if="menu.open"
      class="context-menu fixed z-50 rounded-md shadow-lg border overflow-hidden"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
    >
      <button type="button" class="context-menu-item" @click="editSelected">{{ t("provider.edit") }}</button>
      <button
        type="button"
        class="context-menu-item context-menu-item--danger"
        @click="deleteSelected"
      >
        {{ t("provider.delete") }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { ArrowLeft, Plus, Search } from "lucide-vue-next";
import { useProviderStore } from "@/store";
import { providerToUI } from "@/utils/provider-ui";
import ProviderListItem from "@/components/provider/ProviderListItem.vue";
import { useI18n } from "@/i18n";

defineProps<{ activeId: string | null }>();

const emit = defineEmits<{
  "select-provider": [id: string];
  "add-provider": [];
  "edit-provider": [id: string];
  "delete-provider": [id: string];
}>();

const providerStore = useProviderStore();
const { t } = useI18n();
const query = ref("");
const mobileSearchOpen = ref(false);
const menu = reactive({ open: false, x: 0, y: 0, providerId: "" });

const providers = computed(() =>
  providerStore.providers.map((provider) =>
    providerToUI(provider, providerStore.models[provider.id] ?? []),
  ),
);

const filteredProviders = computed(() => {
  const value = query.value.trim().toLowerCase();
  if (!value) return providers.value;
  return providers.value.filter((provider) => provider.name.toLowerCase().includes(value));
});

function openMenu(event: MouseEvent, providerId: string) {
  menu.open = true;
  menu.x = event.clientX;
  menu.y = event.clientY;
  menu.providerId = providerId;
}

function editSelected() {
  menu.open = false;
  emit("edit-provider", menu.providerId);
}

function deleteSelected() {
  menu.open = false;
  emit("delete-provider", menu.providerId);
}
</script>

<style scoped>
.provider-panel {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  flex-shrink: 0;
  flex-direction: column;
  background: var(--app-list-bg);
  color: var(--app-text-primary);
}

.provider-panel__title {
  flex: 1;
  font-size: var(--app-font-title);
  font-weight: var(--app-font-weight-medium);
}

.provider-panel__search {
  width: 100%;
  padding: 0.375rem 0.5rem 0.375rem 2rem;
  border-radius: var(--app-radius-control);
  font-size: var(--app-font-control);
  outline: none;
}

.provider-panel__action-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.provider-panel__list {
  flex: 1;
  overflow-y: auto;
}

.provider-panel__empty {
  padding: 3rem 0;
  text-align: center;
  font-size: var(--app-font-body);
}

.provider-panel__search-wrap {
  position: relative;
}

.provider-panel__search-icon {
  position: absolute;
  top: 0.5rem;
  left: 0.625rem;
  width: 1rem;
  height: 1rem;
}

.panel-inline-search {
  flex-shrink: 0;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--app-border-subtle);
}

.provider-panel__header {
  background: var(--app-list-header-bg);
  border-color: var(--app-header-divider, var(--app-border-subtle));
}

.provider-panel__muted {
  color: var(--app-text-muted);
}

.list-header-btn {
  padding: 6px;
  border-radius: 6px;
  color: var(--app-nav-icon);
}

.list-header-btn:hover,
.context-menu-item:hover {
  background: var(--app-hover);
}

.list-search-input {
  background: var(--app-list-search-bg);
  color: var(--app-text-primary);
}

.list-search-input:focus {
  background: var(--app-list-search-focus-bg);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-accent) 50%, transparent);
}

.context-menu {
  min-width: 160px;
  background: var(--app-settings-card);
  border-color: var(--app-border);
}

.context-menu-item {
  display: block;
  width: 100%;
  padding: 8px 14px;
  text-align: left;
  font-size: var(--app-font-control);
  color: var(--app-text-primary);
}

.context-menu-item--danger {
  color: #dc2626;
}

.mobile-search-trigger,
.mobile-search-page {
  display: none;
}

@media (max-width: 767px) {
  .panel-inline-search {
    display: none;
  }
  .mobile-search-trigger {
    display: grid;
    width: 40px;
    height: 40px;
    margin-left: auto;
    place-items: center;
  }
  .mobile-search-trigger svg {
    width: 21px;
    height: 21px;
  }
  .mobile-search-page {
    display: grid;
    min-height: 52px;
    grid-template-columns: 40px 20px minmax(0, 1fr);
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    border-bottom: 1px solid var(--app-border-subtle);
  }
  .mobile-search-page button {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
  }
  .mobile-search-page svg {
    width: 20px;
    height: 20px;
    color: var(--app-text-secondary);
  }
  .mobile-search-page input {
    min-width: 0;
    height: 36px;
    background: transparent;
    outline: none;
  }
}
</style>
