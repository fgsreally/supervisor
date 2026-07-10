<template>
  <div class="provider-form-view flex flex-col flex-1 min-w-0 basis-0 h-full w-full overflow-hidden">
    <div class="provider-form-header h-14 md:h-16 border-b flex items-center px-3 md:px-6 shrink-0 gap-3">
      <button
        v-if="showBack"
        type="button"
        class="mr-1 p-1.5 rounded-md provider-form-back-btn"
        @click="emit('cancel')"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>
      <div class="flex-1 min-w-0">
        <div class="text-[16px] font-medium provider-form-title">{{ title }}</div>
        <div v-if="providerId && !modelsOnly" class="text-[12px] provider-form-subtitle font-mono mt-0.5">{{ providerId }}</div>
      </div>
      <button
        type="button"
        class="provider-form-cancel-btn shrink-0 px-3 py-1.5 rounded-md border text-[13px]"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        v-if="!modelsOnly"
        type="button"
        class="shrink-0 px-3 py-1.5 rounded-md bg-[#07c160] text-white text-[13px] hover:bg-[#06ad56] disabled:opacity-50"
        :disabled="!canSave"
        @click="save"
      >
        保存
      </button>
      <button
        v-else
        type="button"
        class="shrink-0 px-3 py-1.5 rounded-md bg-[#07c160] text-white text-[13px] hover:bg-[#06ad56] disabled:opacity-50"
        :disabled="!canSave"
        @click="save"
      >
        完成
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
      <template v-if="!modelsOnly">
        <section class="provider-form-card rounded-lg border p-4 space-y-4">
          <div class="text-[14px] font-medium provider-form-title">基本信息</div>

          <div v-if="isNew" class="space-y-2">
            <div class="provider-form-subtitle text-[13px]">快速预设</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="preset in PROVIDER_PRESETS"
                :key="preset.id"
                type="button"
                class="provider-form-preset-btn px-2.5 py-2 rounded-md border text-[12px] inline-flex items-center gap-2"
                @click="applyProviderPreset(preset)"
              >
                <ProviderAvatar
                  :provider-id="preset.id"
                  :provider-name="preset.name"
                  :icon="preset.icon"
                  class="w-5 h-5"
                />
                <span>{{ preset.name }}</span>
              </button>
            </div>
          </div>

          <label class="block text-[13px]">
            <span class="provider-form-subtitle mb-1 block">名称</span>
            <input
              v-model="draft.name"
              type="text"
              placeholder="例如 OpenAI"
              class="provider-form-input w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-[#07c160]/50"
            />
          </label>

          <label v-if="isNew" class="block text-[13px]">
            <span class="provider-form-subtitle mb-1 block">ID</span>
            <input
              v-model="draft.id"
              type="text"
              placeholder="例如 openai"
              class="provider-form-input w-full px-3 py-2 border rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-[#07c160]/50"
            />
          </label>

          <label class="block text-[13px]">
            <span class="provider-form-subtitle mb-1 block">Icon（Iconify ID）</span>
            <input
              v-model="iconInput"
              type="text"
              placeholder="例如 simple-icons:openai"
              class="provider-form-input w-full px-3 py-2 border rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-[#07c160]/50"
            />
          </label>

          <label class="flex items-center gap-2 text-[13px] cursor-pointer w-fit">
            <input v-model="draft.isEnabled" type="checkbox" class="rounded border-gray-300" />
            <span class="provider-form-title">启用</span>
          </label>
        </section>

        <section class="provider-form-card rounded-lg border p-4 space-y-4">
          <div class="text-[14px] font-medium provider-form-title">连接配置</div>

          <div>
            <div class="provider-form-subtitle text-[13px] mb-2">API Type</div>
            <div class="flex flex-col sm:flex-row gap-2">
              <label
                v-for="opt in PROVIDER_API_TYPES"
                :key="opt.value"
                class="flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer text-[13px] transition-colors"
                :class="draft.apiType === opt.value ? 'provider-form-radio provider-form-radio--active' : 'provider-form-radio provider-form-radio--idle'"
              >
                <input v-model="draft.apiType" type="radio" :value="opt.value" class="accent-[#07c160]" />
                <span class="font-mono">{{ opt.value }}</span>
              </label>
            </div>
          </div>

          <label class="block text-[13px]">
            <span class="provider-form-subtitle mb-1 block">Base URL</span>
            <input
              v-model="baseUrlInput"
              type="text"
              placeholder="留空使用默认端点"
              class="provider-form-input w-full px-3 py-2 border rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-[#07c160]/50"
            />
          </label>
        </section>
      </template>

      <ProviderModelTable
        :models="draft.models"
        :provider="draft"
        :editable="true"
        @update:models="onModelsUpdate"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronLeft } from 'lucide-vue-next'
import ProviderModelTable from '../components/ProviderModelTable.vue'
import ProviderAvatar from '../components/ProviderAvatar.vue'
import type { UIProvider, UIProviderModel } from '@/types/ui'
import { PROVIDER_API_TYPES, PROVIDER_PRESETS } from '@/constants/providers'
import { useProviderStore } from '@/store'
import { providerToUI } from '@/utils/provider-ui'

const props = defineProps<{
  providerId?: string | null
  showBack?: boolean
  modelsOnly?: boolean
}>()

const emit = defineEmits<{
  cancel: []
  saved: [id: string]
}>()

const providerStore = useProviderStore()
const isNew = computed(() => !props.providerId)

const title = computed(() => {
  if (props.modelsOnly) return '管理模型'
  return isNew.value ? '添加 Provider' : '编辑 Provider'
})

function emptyDraft(): UIProvider {
  return {
    id: '',
    slug: null,
    name: '',
    icon: null,
    apiType: 'openai-compatible',
    baseUrl: null,
    isEnabled: true,
    models: [],
  }
}

function cloneProvider(p: UIProvider): UIProvider {
  return JSON.parse(JSON.stringify(p)) as UIProvider
}

const draft = ref<UIProvider>(emptyDraft())

async function loadDraft(id: string) {
  await providerStore.fetchProvider(id)
  await providerStore.fetchModels(id)
  const p = providerStore.getProviderById(id)
  if (p) draft.value = cloneProvider(providerToUI(p, providerStore.models[id] ?? []))
}

watch(
  () => props.providerId,
  (id) => {
    if (id) void loadDraft(id)
    else draft.value = emptyDraft()
  },
  { immediate: true },
)

const baseUrlInput = computed({
  get: () => draft.value.baseUrl ?? '',
  set: (v: string) => {
    draft.value.baseUrl = v.trim() ? v.trim() : null
  },
})

const iconInput = computed({
  get: () => draft.value.icon ?? '',
  set: (v: string) => {
    draft.value.icon = v.trim() || null
  },
})

const canSave = computed(() => {
  if (props.modelsOnly) {
    return draft.value.models.length > 0 && !draft.value.models.some((m) => !m.id.trim())
  }
  if (!draft.value.name.trim()) return false
  if (isNew.value && !draft.value.id.trim()) return false
  if (draft.value.models.length === 0) return false
  if (draft.value.models.some((m) => !m.id.trim())) return false
  return true
})

function onModelsUpdate(models: UIProviderModel[]) {
  draft.value.models = models
}

function applyProviderPreset(preset: (typeof PROVIDER_PRESETS)[number]) {
  draft.value.id = preset.id
  draft.value.name = preset.name
  draft.value.icon = preset.icon
  draft.value.apiType = preset.apiType
  draft.value.baseUrl = preset.baseUrl
}

async function syncModels(providerId: string, models: UIProviderModel[]) {
  const existing = providerStore.models[providerId] ?? []
  const existingIds = new Set(existing.map((m: import('@/api').Model) => m.modelId))
  const nextIds = new Set(models.map((m) => m.id.trim()))

  for (const m of existing) {
    if (!nextIds.has(m.modelId)) {
      await providerStore.deleteModel(providerId, m.modelId)
    }
  }
  for (const m of models) {
    const modelId = m.id.trim()
    const payload = {
      modelId,
      name: m.name.trim() || modelId,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      supportsMultimodal: m.supportsMultimodal,
      tags: m.tags,
    }
    if (existingIds.has(modelId)) {
      await providerStore.updateModel(providerId, modelId, payload)
    } else {
      await providerStore.createModel(providerId, payload)
    }
  }
}

async function save() {
  if (props.modelsOnly) {
    const id = props.providerId
    if (!id || !canSave.value) return
    await syncModels(id, draft.value.models)
    emit('saved', id)
    return
  }

  if (!canSave.value) return
  const payload = cloneProvider(draft.value)
  payload.name = payload.name.trim()
  payload.id = payload.id.trim()
  payload.models = payload.models.map((m) => ({
    ...m,
    id: m.id.trim(),
    name: m.name.trim() || m.id.trim(),
  }))

  if (isNew.value) {
    if (providerStore.getProviderById(payload.id)) return
    await providerStore.createProvider({
      slug: payload.id,
      name: payload.name,
      icon: payload.icon,
      apiType: payload.apiType,
      baseUrl: payload.baseUrl,
      isEnabled: payload.isEnabled,
    })
  } else {
    await providerStore.updateProvider(payload.id, {
      name: payload.name,
      isEnabled: payload.isEnabled,
      icon: payload.icon,
      apiType: payload.apiType,
      baseUrl: payload.baseUrl,
    })
  }

  await syncModels(payload.id, payload.models)
  emit('saved', payload.id)
}
</script>

<style scoped>
.provider-form-view {
  background: var(--app-settings-bg);
}

.provider-form-header {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
}

.provider-form-back-btn {
  color: var(--app-text-secondary);
}

.provider-form-back-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.provider-form-title {
  color: var(--app-text-primary);
}

.provider-form-subtitle {
  color: var(--app-text-secondary);
}

.provider-form-cancel-btn {
  border-color: var(--app-border);
  background: var(--app-settings-card);
  color: var(--app-text-secondary);
}

.provider-form-cancel-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.provider-form-card {
  background: var(--app-settings-card);
  border-color: var(--app-border-subtle);
}

.provider-form-input {
  border-color: var(--app-border);
  background: var(--app-settings-card);
  color: var(--app-text-primary);
}

.provider-form-radio--active {
  border-color: var(--app-accent);
  background: color-mix(in srgb, var(--app-accent) 14%, transparent);
  color: var(--app-text-primary);
}

.provider-form-radio--idle {
  border-color: var(--app-border);
  color: var(--app-text-secondary);
}

.provider-form-radio--idle:hover {
  background: var(--app-hover);
}

.provider-form-preset-btn {
  border-color: var(--app-border);
  background: var(--app-settings-bg);
  color: var(--app-text-secondary);
}

.provider-form-preset-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}
</style>
