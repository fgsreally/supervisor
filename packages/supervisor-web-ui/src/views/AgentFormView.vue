<template>
  <div class="agent-form-view flex flex-col flex-1 min-w-0 basis-0 h-full w-full overflow-hidden">
    <div class="agent-form-header h-14 md:h-16 border-b flex items-center px-3 md:px-6 shrink-0 gap-3">
      <button
        v-if="showBack"
        type="button"
        class="mr-1 p-1.5 rounded-md agent-form-back-btn"
        @click="emit('cancel')"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>
      <div class="flex-1 min-w-0">
        <div class="text-[16px] font-medium agent-form-title">添加智能代理</div>
      </div>
      <button type="button" class="agent-form-cancel-btn shrink-0 px-3 py-1.5 rounded-md border text-[13px]" @click="emit('cancel')">
        取消
      </button>
      <button
        type="button"
        class="shrink-0 px-3 py-1.5 rounded-md bg-[#07c160] text-white text-[13px] hover:bg-[#06ad56] disabled:opacity-50"
        :disabled="!canSave || saving"
        @click="save"
      >
        创建
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
      <section class="agent-form-card rounded-lg p-4 space-y-4 max-w-xl">
        <label class="block text-[13px]">
          <span class="agent-form-label mb-1 block">名称</span>
          <input v-model="draft.name" type="text" placeholder="例如 文档助手" class="agent-form-input w-full px-3 py-2 rounded-md" />
        </label>

        <label class="block text-[13px]">
          <span class="agent-form-label mb-1 block">ID（可选）</span>
          <input v-model="draft.id" type="text" placeholder="留空则自动生成" class="agent-form-input w-full px-3 py-2 rounded-md font-mono" />
        </label>

        <label class="block text-[13px]">
          <span class="agent-form-label mb-1 block">描述</span>
          <textarea v-model="draft.description" rows="2" class="agent-form-input w-full px-3 py-2 rounded-md resize-y min-h-[4rem]" />
        </label>

        <label class="block text-[13px]">
          <span class="agent-form-label mb-1 block">模型服务</span>
          <select v-model="draft.providerId" class="agent-form-input w-full px-3 py-2 rounded-md" @change="onProviderChange">
            <option v-for="p in providerOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>

        <label class="block text-[13px]">
          <span class="agent-form-label mb-1 block">模型</span>
          <select v-model="draft.modelId" class="agent-form-input w-full px-3 py-2 rounded-md font-mono text-[12px]">
            <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.id }}</option>
          </select>
        </label>

        <label class="block text-[13px]">
          <span class="agent-form-label mb-1 block">工具集</span>
          <select v-model="draft.toolsPreset" class="agent-form-input w-full px-3 py-2 rounded-md">
            <option value="coding">coding</option>
            <option value="readonly">readonly</option>
            <option value="none">none</option>
          </select>
        </label>
      </section>

      <p class="mt-4 text-[12px] max-w-xl agent-form-hint leading-relaxed">
        创建后可在 Skills / Extensions / Prompts 页从全局库关联资源。全局资源目录：
        <code class="font-mono">~/.pi/supervisor/global/</code>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronLeft } from 'lucide-vue-next'
import type { ToolsPreset } from '@/api'
import { useAgentStore, useProviderStore } from '@/store'
import { providerToUI } from '@/utils/provider-ui'

defineProps<{ showBack?: boolean }>()

const emit = defineEmits<{ cancel: []; saved: [id: string] }>()

const agentStore = useAgentStore()
const providerStore = useProviderStore()
const saving = ref(false)

const draft = ref({
  id: '',
  name: '',
  description: '',
  providerId: '',
  modelId: '',
  toolsPreset: 'coding' as ToolsPreset,
})

const providerOptions = computed(() =>
  providerStore.providers.map((p) => providerToUI(p, providerStore.models[p.id] ?? [])),
)

const modelOptions = computed(() => {
  const p = providerOptions.value.find((x) => x.id === draft.value.providerId)
  return p?.models ?? []
})

watch(
  providerOptions,
  (list) => {
    if (!draft.value.providerId && list[0]) {
      draft.value.providerId = list[0].id
      draft.value.modelId = list[0].models[0]?.id || ''
    }
  },
  { immediate: true },
)

const canSave = computed(
  () => !!draft.value.name.trim() && !!draft.value.providerId && !!draft.value.modelId,
)

function onProviderChange() {
  const p = providerOptions.value.find((x) => x.id === draft.value.providerId)
  if (!p) return
  if (!p.models.some((m) => m.id === draft.value.modelId)) {
    draft.value.modelId = p.models[0]?.id || ''
  }
}

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  try {
    const agent = await agentStore.createAgent({
      id: draft.value.id.trim() || undefined,
      name: draft.value.name.trim(),
      description: draft.value.description.trim() || undefined,
      providerId: draft.value.providerId,
      modelId: draft.value.modelId,
      toolsPreset: draft.value.toolsPreset,
    })
    emit('saved', agent.id)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.agent-form-view {
  background: var(--app-settings-bg);
}

.agent-form-header {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
}

.agent-form-back-btn {
  color: var(--app-text-secondary);
}

.agent-form-back-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.agent-form-title {
  color: var(--app-text-primary);
}

.agent-form-cancel-btn {
  border-color: var(--app-btn-secondary-border);
  color: var(--app-btn-secondary-text);
  background: transparent;
}

.agent-form-cancel-btn:hover {
  background: var(--app-btn-secondary-hover-bg);
  color: var(--app-text-primary);
}

.agent-form-card {
  background: var(--app-settings-card);
}

.agent-form-label {
  color: var(--app-text-secondary);
}

.agent-form-input {
  border: 1px solid var(--app-border);
  background: var(--app-settings-bg);
  color: var(--app-text-primary);
}

.agent-form-hint {
  color: var(--app-text-muted);
}
</style>
