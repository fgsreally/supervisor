<template>
  <div class="h-full w-full flex flex-col shrink-0 min-w-0 provider-panel">
    <div class="h-16 flex items-center px-4 shrink-0 border-b provider-panel__header">
      <h1 class="text-[16px] font-medium flex-1">模型供应商</h1>
      <button
        type="button"
        class="list-header-btn"
        title="添加模型供应商"
        @click="emit('add-provider')"
      >
        <Plus class="w-5 h-5" />
      </button>
    </div>

    <div class="px-3 py-2 shrink-0 border-b provider-panel__header">
      <div class="relative">
        <Search class="w-4 h-4 absolute left-2.5 top-2 provider-panel__muted" />
        <input
          v-model="query"
          type="text"
          placeholder="搜索模型供应商"
          class="list-search-input w-full rounded-md pl-8 pr-2 py-1.5 text-[13px] focus:outline-none"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <ProviderListItem
        v-for="provider in filteredProviders"
        :key="provider.id"
        :provider="provider"
        :active="activeId === provider.id"
        @select="emit('select-provider', $event)"
        @contextmenu.prevent.stop="openMenu($event, provider.id)"
      />
      <div v-if="!filteredProviders.length" class="py-12 text-center text-sm provider-panel__muted">
        暂无模型供应商
      </div>
    </div>

    <div
      v-if="menu.open"
      class="context-menu fixed z-50 rounded-md shadow-lg border overflow-hidden"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
    >
      <button type="button" class="context-menu-item" @click="editSelected">编辑模型供应商</button>
      <button
        type="button"
        class="context-menu-item context-menu-item--danger"
        @click="deleteSelected"
      >
        删除模型供应商
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Plus, Search } from "lucide-vue-next";
import { useProviderStore } from "@/store";
import { providerToUI } from "@/utils/provider-ui";
import ProviderListItem from "./ProviderListItem.vue";

defineProps<{ activeId: string | null }>();

const emit = defineEmits<{
  "select-provider": [id: string];
  "add-provider": [];
  "edit-provider": [id: string];
  "delete-provider": [id: string];
}>();

const providerStore = useProviderStore();
const query = ref("");
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
  background: var(--app-list-bg);
  color: var(--app-text-primary);
}

.provider-panel__header {
  background: var(--app-list-header-bg);
  border-color: var(--app-border-subtle);
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
  font-size: 13px;
  color: var(--app-text-primary);
}

.context-menu-item--danger {
  color: #dc2626;
}
</style>
