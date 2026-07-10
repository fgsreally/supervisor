<template>
  <div
    class="h-full w-full flex flex-col shrink-0 min-w-0"
    :style="{ ...panelStyle, background: 'var(--app-list-bg)' }"
  >
    <div class="h-16 flex items-center px-4 shrink-0 border-b" style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)">
      <h1 class="text-[16px] font-medium flex-1" style="color: var(--app-text-primary)">Provider</h1>
      <button
        type="button"
        class="list-header-btn"
        title="添加 Provider"
        @click="$emit('add')"
      >
        <Plus class="w-5 h-5" />
      </button>
    </div>

    <div class="px-3 py-2 shrink-0 border-b" style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)">
      <div class="relative">
        <Search class="w-4 h-4 absolute left-2.5 top-2" style="color: var(--app-text-muted)" />
        <input
          v-model="query"
          type="text"
          placeholder="搜索 Provider / 模型"
          class="list-search-input w-full rounded-md pl-8 pr-2 py-1.5 text-[13px] focus:outline-none transition-colors"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <ProviderListItem
        v-for="provider in filtered"
        :key="provider.id"
        :provider="provider"
        :active="activeId === provider.id"
        @select="$emit('select', $event)"
      />
      <div v-if="!filtered.length" class="py-12 text-center text-sm" style="color: var(--app-text-muted)">无匹配 Provider</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Search } from 'lucide-vue-next'
import { mockStore } from '../mock/store'
import ProviderListItem from './ProviderListItem.vue'

const props = defineProps<{
  activeId: string
  width?: number
}>()

defineEmits<{ select: [id: string]; add: [] }>()

const panelStyle = computed(() => {
  if (props.width == null) return undefined
  return { width: `${props.width}px` }
})

const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return mockStore.providers
  return mockStore.providers.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.apiType.toLowerCase().includes(q) ||
      p.models.some((m) => m.id.toLowerCase().includes(q)),
  )
})
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
</style>
