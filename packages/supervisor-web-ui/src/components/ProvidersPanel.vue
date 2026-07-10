<template>
  <div
    class="h-full w-full flex flex-col shrink-0 min-w-0"
    :style="{ ...panelStyle, background: 'var(--app-list-bg)' }"
  >
    <!-- Header -->
    <div class="h-16 flex items-center px-4 shrink-0 border-b" style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)">
      <h1 class="text-[16px] font-medium flex-1" style="color: var(--app-text-primary)">模型</h1>
    </div>

    <!-- 主内容区域 - 双侧边栏 -->
    <div class="flex flex-1 overflow-hidden">
      <!-- 供应商侧边栏 -->
      <div class="w-1/2 border-r" style="border-color: var(--app-border-subtle)">
        <div class="flex items-center px-4 py-2 shrink-0 border-b" style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)">
          <h2 class="text-[13px] font-medium flex-1" style="color: var(--app-text-secondary)">供应商</h2>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="list-header-btn"
              title="添加供应商"
              @click="$emit('add-provider')"
            >
              <Plus class="w-4 h-4" />
            </button>
            <button
              v-if="activeId"
              type="button"
              class="list-header-btn"
              title="更多操作"
              @click="showProviderContextMenu = !showProviderContextMenu"
            >
              <MoreVertical class="w-4 h-4" />
            </button>
          </div>
        </div>
        <div class="px-3 py-2 shrink-0 border-b" style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)">
          <div class="relative">
            <Search class="w-4 h-4 absolute left-2.5 top-2" style="color: var(--app-text-muted)" />
            <input
              v-model="providerQuery"
              type="text"
              placeholder="搜索供应商"
              class="list-search-input w-full rounded-md pl-8 pr-2 py-1.5 text-[13px] focus:outline-none transition-colors"
            />
          </div>
        </div>
        <div class="flex-1 overflow-y-auto custom-scrollbar">
          <ProviderListItem
            v-for="provider in filteredProviders"
            :key="provider.id"
            :provider="provider"
            :active="activeId === provider.id"
            @select="$emit('select-provider', $event)"
            @contextmenu.prevent.stop="openProviderContextMenu($event, provider)"
          />
          <div v-if="!filteredProviders.length" class="py-4 text-center text-sm" style="color: var(--app-text-muted)">无匹配供应商</div>
        </div>
      </div>

      <!-- 模型侧边栏 -->
      <div class="w-1/2">
        <div class="flex items-center px-4 py-2 shrink-0 border-b" style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)">
          <h2 class="text-[13px] font-medium flex-1" style="color: var(--app-text-secondary)">模型列表</h2>
          <div class="flex items-center gap-1">
            <button
              v-if="selectedProviderId"
              type="button"
              class="list-header-btn"
              title="为当前供应商添加模型"
              @click="$emit('add-model', selectedProviderId)"
            >
              <Plus class="w-4 h-4" />
            </button>
            <button
              v-if="activeModelId"
              type="button"
              class="list-header-btn"
              title="更多操作"
              @click="showModelContextMenu = !showModelContextMenu"
            >
              <MoreVertical class="w-4 h-4" />
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto custom-scrollbar">
          <div v-if="!selectedProviderId" class="py-6 text-center text-sm" style="color: var(--app-text-muted)">请先选择供应商</div>
          <div v-else-if="!models.length" class="py-6 text-center text-sm" style="color: var(--app-text-muted)">暂无模型，请添加</div>
          <button
            v-for="model in models"
            :key="model.modelId"
            class="model-item cursor-pointer flex items-center gap-3 px-4 py-2.5 transition-colors w-full text-left hover:bg-[var(--app-list-item-hover)]"
            :class="{ 'model-item--active': activeModelId === model.modelId }"
            @click="$emit('select-model', { providerId: selectedProviderId, modelId: model.modelId })"
            @contextmenu.prevent.stop="openModelContextMenu($event, model)"
          >
            <ProviderAvatar
              :provider-id="model.providerId ?? selectedProviderId ?? ''"
              :provider-name="selectedProvider?.name ?? ''"
              :icon="selectedProvider?.icon ?? null"
              class="w-5 h-5 shrink-0"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <div class="text-[11px] truncate" style="color: var(--app-text-secondary)">{{ selectedProvider?.name ?? '' }}</div>
              </div>
              <div class="text-[13px] font-medium truncate" style="color: var(--app-text-primary)">{{ model.name || model.modelId }}</div>
              <div class="text-[11px] truncate font-mono" style="color: var(--app-text-secondary)">{{ model.modelId }}</div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- 供应商右键菜单 -->
    <div
      v-if="showProviderContextMenu"
      class="context-menu fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border overflow-hidden"
      :style="{ left: `${providerContextMenuPosition.x}px`, top: `${providerContextMenuPosition.y}px` }"
      style="border-color: var(--app-border-subtle)"
      @click.away="showProviderContextMenu = false"
    >
      <button
        type="button"
        class="context-menu-item w-full px-4 py-2 text-left text-sm"
        style="color: var(--app-text-primary)"
        @click="onEditProvider"
      >
        编辑供应商
      </button>
      <button
        type="button"
        class="context-menu-item w-full px-4 py-2 text-left text-sm"
        :style="{ color: 'var(--app-danger, rgb(239, 68, 68))' }"
        @click="onDeleteProvider"
      >
        删除供应商
      </button>
    </div>

    <!-- 模型右键菜单 -->
    <div
      v-if="showModelContextMenu"
      class="context-menu fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border overflow-hidden"
      :style="{ left: `${modelContextMenuPosition.x}px`, top: `${modelContextMenuPosition.y}px` }"
      style="border-color: var(--app-border-subtle)"
      @click.away="showModelContextMenu = false"
    >
      <button
        type="button"
        class="context-menu-item w-full px-4 py-2 text-left text-sm"
        style="color: var(--app-text-primary)"
        @click="onEditModel"
      >
        编辑模型
      </button>
      <button
        type="button"
        class="context-menu-item w-full px-4 py-2 text-left text-sm"
        :style="{ color: 'var(--app-danger, rgb(239, 68, 68))' }"
        :disabled="!canDeleteCurrentModel"
        @click="onDeleteModel"
      >
        {{ deleteModelTitle(currentModel!) }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus, Search, MoreVertical } from 'lucide-vue-next'
import { useProviderStore, useAgentStore } from '@/store'
import ProviderListItem from './ProviderListItem.vue'
import ProviderAvatar from './ProviderAvatar.vue'
import { providerToUI } from '@/utils/provider-ui'
import { resolveProviderIcon } from '@/constants/providers'
import type { Model } from '@/api'

const props = defineProps<{
  activeId: string | null
  activeModelId?: string
  width?: number
}>()

const emit = defineEmits<{
  'select-provider': [id: string]
  'add-provider': []
  'add-model': [providerId: string]
  'select-model': [model: { providerId: string | null; modelId: string }]
  'delete-model': [model: Model]
  'delete-provider': [id: string]
  'edit-provider': [id: string]
  'edit-model': [model: Model]
}>()

const providerStore = useProviderStore()
const agentStore = useAgentStore()

const panelStyle = computed(() => {
  if (props.width == null) return undefined
  return { width: `${props.width}px` }
})

const providerQuery = ref('')
const selectedProviderId = ref<string | null>(null)
const currentModel = ref<Model | null>(null)
const showProviderContextMenu = ref(false)
const showModelContextMenu = ref(false)
const providerContextMenuPosition = ref({ x: 0, y: 0 })
const modelContextMenuPosition = ref({ x: 0, y: 0 })

watch(() => props.activeId, (id) => {
  selectedProviderId.value = id
  if (id) providerStore.setCurrentProvider(id)
}, { immediate: true })

const uiProviders = computed(() =>
  providerStore.providers.map((p) =>
    providerToUI(p, providerStore.models[p.id] ?? []),
  ),
)

const filteredProviders = computed(() => {
  const q = providerQuery.value.trim().toLowerCase()
  if (!q) return uiProviders.value
  return uiProviders.value.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.apiType.toLowerCase().includes(q),
  )
})

const selectedProvider = computed(() => {
  if (!selectedProviderId.value) return null
  return providerStore.getProviderById(selectedProviderId.value)
})

const models = computed(() => {
  if (!selectedProviderId.value) return []
  return providerStore.models[selectedProviderId.value] ?? []
})

function deleteModelTitle(model: Model): string {
  const bindingAgent = agentStore.agents.find(
    (a) => a.providerId === selectedProviderId.value && a.modelId === model.modelId,
  )
  if (bindingAgent) return `被 Agent "${bindingAgent.name}" 使用中，无法删除`
  return '删除模型'
}

const canDeleteCurrentModel = computed(() => {
  if (!currentModel.value || !selectedProviderId.value) return false
  const bindingAgent = agentStore.agents.find(
    (a) => a.providerId === selectedProviderId.value && a.modelId === currentModel.value!.modelId,
  )
  return !bindingAgent
})

function openProviderContextMenu(event: MouseEvent, provider: any) {
  providerContextMenuPosition.value = { x: event.clientX, y: event.clientY }
  showProviderContextMenu.value = true
  showModelContextMenu.value = false
}

function openModelContextMenu(event: MouseEvent, model: Model) {
  currentModel.value = model
  modelContextMenuPosition.value = { x: event.clientX, y: event.clientY }
  showModelContextMenu.value = true
  showProviderContextMenu.value = false
}

function onDeleteModel() {
  if (!currentModel.value) return
  onDeleteModelDirect(currentModel.value)
  showModelContextMenu.value = false
}

function onDeleteModelDirect(model: Model) {
  const bindingAgent = agentStore.agents.find(
    (a) => a.providerId === selectedProviderId.value && a.modelId === model.modelId,
  )
  if (bindingAgent) return
  emit('delete-model', model)
}

function onEditModel() {
  if (!currentModel.value) return
  emit('edit-model', currentModel.value)
  showModelContextMenu.value = false
}

function onEditProvider() {
  if (!selectedProviderId.value) return
  emit('edit-provider', selectedProviderId.value)
  showProviderContextMenu.value = false
}

function onDeleteProvider() {
  if (!selectedProviderId.value) return
  emit('delete-provider', selectedProviderId.value)
  showProviderContextMenu.value = false
}
</script>

<style scoped>
.list-header-btn {
  padding: 6px;
  border-radius: 6px;
  color: var(--app-nav-icon);
  transition: background-color 0.15s;
}

.list-header-btn:hover {
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

.model-item:hover {
  background: var(--app-list-item-hover);
}

.model-item--active {
  background: var(--app-list-item-active);
}

.context-menu {
  min-width: 160px;
}

.context-menu-item {
  transition: background-color 0.15s;
}

.context-menu-item:hover:not(:disabled) {
  background: var(--app-hover);
}

.context-menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
