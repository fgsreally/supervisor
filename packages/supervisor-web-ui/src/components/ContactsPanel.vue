<template>
  <div
    class="h-full w-full flex flex-col shrink-0 min-w-0"
    :style="{ ...panelStyle, background: 'var(--app-list-bg)' }"
  >
    <div class="h-16 flex items-center px-4 shrink-0 border-b" style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)">
      <h1 class="text-[16px] font-medium flex-1" style="color: var(--app-text-primary)">智能代理</h1>
      <button
        type="button"
        class="list-header-btn"
        title="添加智能代理"
        @click="$emit('add')"
      >
        <UserPlus class="w-5 h-5" />
      </button>
    </div>

    <div class="px-3 py-2 shrink-0 border-b" style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)">
      <div class="relative">
        <Search class="w-4 h-4 absolute left-2.5 top-2" style="color: var(--app-text-muted)" />
        <input
          v-model="query"
          type="text"
          placeholder="搜索智能代理"
          class="list-search-input w-full rounded-md pl-8 pr-2 py-1.5 text-[13px] focus:outline-none transition-colors"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <template v-for="group in filteredGroups" :key="group.label">
        <div
          class="list-section-label px-4 py-1.5 text-[11px] font-semibold tracking-wide sticky top-0 z-10"
        >
          {{ group.label }}
        </div>
        <AgentListItem
          v-for="agent in group.agents"
          :key="agent.id"
          :agent="agent"
          :active="activeId === agent.id"
          @select="$emit('select', $event)"
        />
      </template>

      <div v-if="!filteredGroups.length" class="py-12 text-center text-sm" style="color: var(--app-text-muted)">
        无匹配智能代理
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search, UserPlus } from 'lucide-vue-next'
import type { Agent } from '@/api'
import { useAgentStore } from '@/store'
import AgentListItem from './AgentListItem.vue'

const props = defineProps<{
  activeId: string
  width?: number
}>()

const panelStyle = computed(() => {
  if (props.width == null) return undefined
  return { width: `${props.width}px` }
})

defineEmits<{ select: [id: string]; add: [] }>()

const agentStore = useAgentStore()
const query = ref('')

const filteredGroups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const groups = agentStore.getAgentsByCategory
  if (!q) return groups

  return groups
    .map((g) => ({
      ...g,
      agents: g.agents.filter(
        (a: Agent) =>
          a.name.toLowerCase().includes(q) ||
          (a.description ?? '').toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.agents.length > 0)
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

.list-section-label {
  background: color-mix(in srgb, var(--app-list-section-bg) 95%, transparent);
  color: var(--app-text-secondary);
}
</style>

