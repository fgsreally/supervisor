<template>
  <div class="provider-detail-view flex flex-col flex-1 min-w-0 basis-0 h-full w-full overflow-hidden">
    <div class="provider-detail-header h-14 md:h-16 border-b flex items-center px-3 md:px-6 shrink-0 gap-3">
      <button
        v-if="showBack"
        type="button"
        class="mr-1 p-1.5 rounded-md provider-detail-back-btn"
        @click="emit('back')"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>
      <ProviderAvatar
        :provider-id="provider.id"
        :provider-name="provider.name"
        :icon="provider.icon"
        class="w-10 h-10"
      />
      <div class="flex-1 min-w-0">
        <div class="text-[16px] font-medium truncate provider-detail-title">{{ provider.name }}</div>
        <div class="text-[12px] truncate font-mono mt-0.5 provider-detail-subtitle">
          {{ provider.models.length }} models
        </div>
      </div>
      <span
        class="shrink-0 px-2 py-0.5 rounded text-xs font-medium provider-detail-pill"
        :class="provider.isEnabled ? 'provider-detail-pill--on' : 'provider-detail-pill--off'"
      >
        {{ provider.isEnabled ? 'enabled' : 'disabled' }}
      </span>
      <button
        type="button"
        class="provider-detail-btn shrink-0 px-3 py-1.5 rounded-md border text-[13px]"
        @click="emit('edit')"
      >
        编辑
      </button>
      <button
        type="button"
        class="provider-detail-btn shrink-0 px-3 py-1.5 rounded-md border text-[13px]"
        @click="emit('manage-models')"
      >
        管理模型
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
      <section class="provider-detail-card rounded-lg border overflow-hidden p-4 space-y-3">
        <div class="text-[14px] font-medium provider-detail-title">配置</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
          <div>
            <div class="provider-detail-subtitle mb-1">API Type</div>
            <div class="provider-detail-title font-mono">{{ apiTypeLabel }}</div>
          </div>
          <div>
            <div class="provider-detail-subtitle mb-1">Base URL</div>
            <div class="provider-detail-title font-mono break-all">{{ provider.baseUrl || '（默认）' }}</div>
          </div>
        </div>
      </section>

      <ProviderModelTable
        :models="provider.models"
        :provider="provider"
      />

      <section class="provider-detail-card rounded-lg border overflow-hidden">
        <div class="px-4 py-3 border-b provider-detail-divider text-[14px] font-medium provider-detail-title">
          使用此 Provider 的 Agent
          <span class="ml-2 text-[12px] font-normal provider-detail-subtitle">{{ linkedAgents.length }}</span>
        </div>
        <ul v-if="linkedAgents.length" class="divide-y provider-detail-divider">
          <li v-for="agent in linkedAgents" :key="agent.id">
            <button
              type="button"
              class="w-full px-4 py-3 flex items-center gap-3 text-left provider-detail-row transition-colors"
              @click="emit('view-agent', agent.id)"
            >
              <div
                class="w-10 h-10 rounded-md flex items-center justify-center text-white font-semibold shrink-0 shadow-sm"
                :class="agentAvatarClass(agent.id)"
              >
                {{ agent.name.substring(0, 1).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[14px] font-medium provider-detail-title truncate">{{ agent.name }}</div>
                <div class="text-[12px] provider-detail-subtitle truncate mt-0.5">{{ agent.description }}</div>
              </div>
              <ChevronRight class="w-4 h-4 provider-detail-subtitle shrink-0" />
            </button>
          </li>
        </ul>
        <div v-else class="px-4 py-6 text-[13px] provider-detail-subtitle text-center">暂无 Agent 绑定</div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import ProviderModelTable from '../components/ProviderModelTable.vue'
import ProviderAvatar from '../components/ProviderAvatar.vue'
import type { UIProvider } from '@/types/ui'
import { PROVIDER_API_TYPES } from '@/constants/providers'
import { useAgentStore } from '@/store'
import { agentAvatarClass } from '../utils/avatar-class'

const props = defineProps<{
  provider: UIProvider
  showBack?: boolean
}>()

const emit = defineEmits<{
  back: []
  edit: []
  'manage-models': []
  'view-agent': [agentId: string]
}>()

const agentStore = useAgentStore()

const linkedAgents = computed(() =>
  agentStore.agents.filter((a) => a.providerId === props.provider.id),
)

const apiTypeLabel = computed(
  () => PROVIDER_API_TYPES.find((t) => t.value === props.provider.apiType)?.label ?? props.provider.apiType,
)
</script>

<style scoped>
.provider-detail-view {
  background: var(--app-settings-bg);
}

.provider-detail-header {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
}

.provider-detail-back-btn {
  color: var(--app-text-secondary);
}

.provider-detail-back-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.provider-detail-title {
  color: var(--app-text-primary);
}

.provider-detail-subtitle {
  color: var(--app-text-secondary);
}

.provider-detail-pill--on {
  background: color-mix(in srgb, var(--app-accent) 18%, transparent);
  color: var(--app-accent);
}

.provider-detail-pill--off {
  background: color-mix(in srgb, var(--app-hover) 80%, transparent);
  color: var(--app-text-secondary);
}

.provider-detail-btn {
  border-color: var(--app-border);
  background: var(--app-settings-card);
  color: var(--app-text-secondary);
}

.provider-detail-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.provider-detail-card {
  background: var(--app-settings-card);
  border-color: var(--app-border-subtle);
}

.provider-detail-divider {
  border-color: var(--app-border-subtle);
}

.provider-detail-row:hover {
  background: var(--app-hover);
}
</style>
