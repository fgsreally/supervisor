<template>
  <div v-if="agent" class="agent-config text-[13px] max-w-3xl">
    <div class="flex items-center justify-between gap-3 mb-5">
      <span class="text-[13px] font-medium agent-config-title">Config</span>
      <InlineEditActions
        :editing="editing"
        @edit="startEdit"
        @cancel="cancelEdit"
        @done="finishEdit"
      />
    </div>

    <div class="space-y-5">
      <div>
        <div class="agent-config-label mb-1.5">名称</div>
        <input
          v-if="editing"
          :value="agent.name"
          type="text"
          class="agent-config-input w-full max-w-lg px-2.5 py-2 rounded border"
          @input="onNameInput"
        />
        <div v-else class="agent-config-value text-[15px]">{{ agent.name }}</div>
      </div>
      <div>
        <div class="agent-config-label mb-1.5">描述</div>
        <textarea
          v-if="editing"
          :value="agent.description"
          rows="2"
          class="agent-config-input w-full max-w-lg px-2.5 py-2 rounded border resize-y min-h-[4rem]"
          @input="onDescriptionInput"
        />
        <div v-else class="agent-config-desc leading-relaxed max-w-2xl">{{ agent.description || '—' }}</div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl">
        <div>
          <div class="agent-config-label mb-1.5">Provider</div>
          <select
            v-if="editing"
            :value="agent.providerId"
            class="agent-config-input w-full px-2.5 py-2 rounded border"
            @change="onProviderChange"
          >
            <option v-for="p in providerOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <div v-else class="agent-config-value">{{ providerLabel }}</div>
        </div>
        <div>
          <div class="agent-config-label mb-1.5">模型</div>
          <select
            v-if="editing"
            :value="modelId"
            class="agent-config-input w-full px-2.5 py-2 rounded border font-mono text-[12px]"
            @change="onModelChange"
          >
            <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.id }}</option>
          </select>
          <div v-else class="agent-config-value font-mono text-[12px]">{{ modelId }}</div>
        </div>
        <div>
          <div class="agent-config-label mb-1.5">工具集</div>
          <select
            v-if="editing"
            :value="agent.toolsPreset"
            class="agent-config-input w-full px-2.5 py-2 rounded border"
            @change="onToolsPresetChange"
          >
            <option value="coding">coding</option>
            <option value="readonly">readonly</option>
            <option value="none">none</option>
          </select>
          <div v-else class="agent-config-value">{{ agent.toolsPreset }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import InlineEditActions from './InlineEditActions.vue'
import { getAgentById } from '../mock/agents'
import type { MockAgent } from '../mock/agents'
import { getProviderById } from '../mock/providers'
import { mockStore } from '../mock/store'

interface ConfigDraft {
  name: string
  description: string
  providerId: string
  modelId: string
  toolsPreset: MockAgent['toolsPreset']
}

const props = defineProps<{
  agentId: string
}>()

const agent = computed(() => getAgentById(props.agentId))
const editing = ref(false)
const snapshot = ref<ConfigDraft | null>(null)

const providerOptions = computed(() => mockStore.providers)

const selectedProvider = computed(() => {
  const a = agent.value
  return a ? getProviderById(a.providerId) : undefined
})

const modelOptions = computed(() => selectedProvider.value?.models ?? [])

const modelId = computed(() => {
  const a = agent.value
  if (!a) return ''
  if (a.modelId && modelOptions.value.some((m) => m.id === a.modelId)) {
    return a.modelId
  }
  return selectedProvider.value?.activeModelId ?? modelOptions.value[0]?.id ?? ''
})

const providerLabel = computed(() => selectedProvider.value?.name ?? agent.value?.providerId ?? '—')

watch(
  () => props.agentId,
  () => {
    editing.value = false
    snapshot.value = null
  },
)

function captureDraft(): ConfigDraft | null {
  const a = agent.value
  if (!a) return null
  return {
    name: a.name,
    description: a.description,
    providerId: a.providerId,
    modelId: a.modelId,
    toolsPreset: a.toolsPreset,
  }
}

function startEdit() {
  snapshot.value = captureDraft()
  editing.value = true
}

function cancelEdit() {
  const a = agent.value
  const s = snapshot.value
  if (a && s) {
    a.name = s.name
    a.description = s.description
    a.providerId = s.providerId
    a.modelId = s.modelId
    a.toolsPreset = s.toolsPreset
  }
  editing.value = false
  snapshot.value = null
}

function finishEdit() {
  editing.value = false
  snapshot.value = null
}

function onNameInput(e: Event) {
  const a = agent.value
  if (!a) return
  a.name = (e.target as HTMLInputElement).value
}

function onDescriptionInput(e: Event) {
  const a = agent.value
  if (!a) return
  a.description = (e.target as HTMLTextAreaElement).value
}

function onProviderChange(e: Event) {
  const a = agent.value
  if (!a) return
  a.providerId = (e.target as HTMLSelectElement).value
  onProviderChangeSideEffects(a)
}

function onModelChange(e: Event) {
  const a = agent.value
  if (!a) return
  a.modelId = (e.target as HTMLSelectElement).value
}

function onToolsPresetChange(e: Event) {
  const a = agent.value
  if (!a) return
  a.toolsPreset = (e.target as HTMLSelectElement).value as MockAgent['toolsPreset']
}

function onProviderChangeSideEffects(a: MockAgent) {
  const provider = getProviderById(a.providerId)
  if (!provider) return
  if (!provider.models.some((m) => m.id === a.modelId)) {
    a.modelId = provider.activeModelId || provider.models[0]?.id || ''
  }
}
</script>

<style scoped>
.agent-config-title {
  color: var(--app-text-secondary);
}

.agent-config-label {
  color: var(--app-text-secondary);
}

.agent-config-value {
  color: var(--app-text-primary);
}

.agent-config-desc {
  color: var(--app-text-secondary);
}

.agent-config-input {
  border-color: var(--app-border);
  background: var(--app-settings-card);
  color: var(--app-text-primary);
}
</style>
