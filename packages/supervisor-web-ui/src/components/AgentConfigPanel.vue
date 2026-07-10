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
      <div>
        <div class="agent-config-label mb-1.5">Home 目录</div>
        <div class="agent-config-value font-mono text-[12px] break-all">{{ homeDir || '—' }}</div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl">
        <div>
          <div class="agent-config-label mb-1.5">模型服务</div>
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

      <div v-if="resolvedTools.length > 0" class="mt-2">
        <div class="agent-config-label mb-1.5">可用工具 ({{ resolvedTools.length }})</div>
        <div class="space-y-1 max-w-3xl">
          <div
            v-for="tool in resolvedTools"
            :key="tool.name"
            class="flex items-start gap-2 px-2.5 py-1.5 rounded border agent-config-tool-row"
          >
            <span class="font-mono text-[12px] agent-config-value shrink-0">{{ tool.name }}</span>
            <span class="text-[11px] px-1.5 py-0.5 rounded agent-config-tool-badge">{{ tool.source }}</span>
            <span v-if="tool.extensionName" class="text-[11px] agent-config-desc">{{ tool.extensionName }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import InlineEditActions from './InlineEditActions.vue'
import { useAgentStore, useProviderStore } from '@/store'
import { providerToUI } from '@/utils/provider-ui'
import type { ToolsPreset } from '@/api'
import { getDefaultWorkspaceCwd } from '@/config/workspace'

interface ConfigDraft {
  name: string
  description: string
  providerId: string
  modelId: string
  toolsPreset: ToolsPreset | null
}

const props = defineProps<{
  agentId: string
}>()

const agentStore = useAgentStore()
const providerStore = useProviderStore()

const agent = computed(() => agentStore.getAgentById(props.agentId))
const editing = ref(false)
const snapshot = ref<ConfigDraft | null>(null)

const providerOptions = computed(() =>
  providerStore.providers.map((p) => providerToUI(p, providerStore.models[p.id] ?? [])),
)

const selectedProvider = computed(() => {
  const a = agent.value
  if (!a) return undefined
  const p = providerStore.getProviderById(a.providerId)
  return p ? providerToUI(p, providerStore.models[p.id] ?? []) : undefined
})

const modelOptions = computed(() => selectedProvider.value?.models ?? [])

const modelId = computed(() => {
  const a = agent.value
  if (!a) return ''
  if (a.modelId && modelOptions.value.some((m) => m.id === a.modelId)) {
    return a.modelId
  }
  return modelOptions.value[0]?.id ?? ''
})

const providerLabel = computed(() => selectedProvider.value?.name ?? agent.value?.providerId ?? '—')

const homeDir = computed(() => {
  const fromAgent = agent.value?.homeDir
  if (fromAgent) return fromAgent
  const res = agentStore.agentResources[props.agentId]
  return res?.homeDir ?? ''
})

const resolvedTools = computed(() => agentStore.agentResources[props.agentId]?.tools ?? [])

watch(
  () => props.agentId,
  async (id) => {
    await agentStore.fetchAgentResources(id, getDefaultWorkspaceCwd())
  },
  { immediate: true },
)

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
    description: a.description ?? '',
    providerId: a.providerId,
    modelId: a.modelId ?? '',
    toolsPreset: a.toolsPreset,
  }
}

function startEdit() {
  snapshot.value = captureDraft()
  editing.value = true
}

function cancelEdit() {
  const s = snapshot.value
  const a = agent.value
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

async function finishEdit() {
  const a = agent.value
  if (!a) return
  await agentStore.updateAgent(props.agentId, {
    name: a.name,
    description: a.description ?? undefined,
    providerId: a.providerId,
    modelId: a.modelId ?? undefined,
    toolsPreset: a.toolsPreset ?? undefined,
  })
  editing.value = false
  snapshot.value = null
}

function patchAgent(patch: Partial<ConfigDraft>) {
  const a = agent.value
  if (!a) return
  if (patch.name !== undefined) a.name = patch.name
  if (patch.description !== undefined) a.description = patch.description
  if (patch.providerId !== undefined) a.providerId = patch.providerId
  if (patch.modelId !== undefined) a.modelId = patch.modelId
  if (patch.toolsPreset !== undefined) a.toolsPreset = patch.toolsPreset
}

function onNameInput(e: Event) {
  patchAgent({ name: (e.target as HTMLInputElement).value })
}

function onDescriptionInput(e: Event) {
  patchAgent({ description: (e.target as HTMLTextAreaElement).value })
}

function onProviderChange(e: Event) {
  const providerId = (e.target as HTMLSelectElement).value
  patchAgent({ providerId })
  const provider = providerStore.getProviderById(providerId)
  const ui = provider ? providerToUI(provider, providerStore.models[providerId] ?? []) : undefined
  if (ui && !ui.models.some((m) => m.id === agent.value?.modelId)) {
    patchAgent({ modelId: ui.models[0]?.id || '' })
  }
}

function onModelChange(e: Event) {
  patchAgent({ modelId: (e.target as HTMLSelectElement).value })
}

function onToolsPresetChange(e: Event) {
  patchAgent({ toolsPreset: (e.target as HTMLSelectElement).value as ToolsPreset })
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

.agent-config-tool-row {
  border-color: var(--app-border-subtle);
  background: var(--app-settings-card);
}

.agent-config-tool-badge {
  background: color-mix(in srgb, var(--app-accent) 12%, transparent);
  color: var(--app-accent);
}
</style>
