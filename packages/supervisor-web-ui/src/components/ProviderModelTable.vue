<template>
  <section class="provider-model-table rounded-lg overflow-hidden">
    <div class="px-4 py-3 provider-model-table__header flex items-center justify-between gap-3">
      <div>
        <div class="text-[14px] font-medium provider-model-table__title">模型</div>
        <div class="text-[12px] provider-model-table__subtitle mt-0.5">
          {{ editable ? '增删改查' : '查看模型能力标签与启用状态' }}
        </div>
      </div>
      <button
        v-if="editable"
        type="button"
        class="shrink-0 px-3 py-1.5 text-[13px] rounded-md bg-[#07c160] text-white hover:bg-[#06ad56]"
        @click="openCreate"
      >
        添加模型
      </button>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full min-w-[640px] text-[13px]">
        <thead class="provider-model-table__head">
          <tr>
            <th class="text-center font-medium px-3 py-2.5 w-16">Provider</th>
            <th class="text-left font-medium px-4 py-2.5">Model ID</th>
            <th class="text-left font-medium px-4 py-2.5">名称</th>
            <th class="text-left font-medium px-4 py-2.5">标签</th>
            <th class="text-right font-medium px-4 py-2.5">上下文</th>
            <th class="text-right font-medium px-4 py-2.5">最大输出</th>
            <th class="text-center font-medium px-3 py-2.5 w-16">图像</th>
            <th v-if="editable" class="text-right font-medium px-4 py-2.5 w-28">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="model in models"
            :key="model.id"
            class="provider-model-table__row transition-colors"
          >
            <td class="px-3 py-2.5 text-center">
              <ProviderAvatar
                :provider-id="provider?.id ?? 'provider'"
                :provider-name="provider?.name ?? 'Provider'"
                :icon="provider?.icon ?? null"
                class="w-7 h-7 mx-auto"
              />
            </td>
            <td class="px-4 py-2.5 font-mono provider-model-table__title">{{ model.id }}</td>
            <td class="px-4 py-2.5 provider-model-table__title">{{ model.name }}</td>
            <td class="px-4 py-2.5">
              <span
                v-if="model.tags.length === 0"
                class="provider-model-table__subtitle"
              >
                —
              </span>
              <span
                v-else
                class="provider-model-table__subtitle font-mono"
              >
                {{ model.tags.join(', ') }}
              </span>
            </td>
            <td class="px-4 py-2.5 text-right font-mono provider-model-table__subtitle">
              {{ formatTokenCount(model.contextWindow) }}
            </td>
            <td class="px-4 py-2.5 text-right font-mono provider-model-table__subtitle">
              {{ formatTokenCount(model.maxTokens) }}
            </td>
            <td class="px-3 py-2.5 text-center">
              <ModelMultimodalIcon :supports-multimodal="model.supportsMultimodal" />
            </td>
            <td v-if="editable" class="px-4 py-2.5 text-right whitespace-nowrap">
              <button
                type="button"
                class="provider-model-table__link provider-model-table__link--edit mr-3"
                @click.stop="openEdit(model)"
              >
                编辑
              </button>
              <button
                type="button"
                class="provider-model-table__link provider-model-table__link--danger"
                @click.stop="removeModel(model.id)"
              >
                删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="models.length === 0" class="px-4 py-10 text-center text-[13px] provider-model-table__subtitle">
      暂无模型，请添加
    </div>

    <ProviderModelEditor
      :open="editorOpen"
      :mode="editorMode"
      :model="editingModel"
      :existing-ids="models.map((m) => m.id)"
      @cancel="closeEditor"
      @save="onEditorSave"
    />
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ModelMultimodalIcon from './ModelMultimodalIcon.vue'
import ProviderModelEditor from './ProviderModelEditor.vue'
import ProviderAvatar from './ProviderAvatar.vue'
import type { UIProvider, UIProviderModel } from '@/types/ui'
import { formatTokenCount } from '../utils/format-tokens'

const props = withDefaults(
  defineProps<{
    models: UIProviderModel[]
    provider?: Pick<UIProvider, 'id' | 'name' | 'icon'>
    editable?: boolean
  }>(),
  { editable: false },
)

const emit = defineEmits<{
  'update:models': [models: UIProviderModel[]]
}>()

const editorOpen = ref(false)
const editorMode = ref<'create' | 'edit'>('create')
const editingModel = ref<UIProviderModel | null>(null)

function openCreate() {
  editorMode.value = 'create'
  editingModel.value = null
  editorOpen.value = true
}

function openEdit(model: UIProviderModel) {
  editorMode.value = 'edit'
  editingModel.value = model
  editorOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
  editingModel.value = null
}

function onEditorSave(model: UIProviderModel) {
  if (editorMode.value === 'create') {
    emit('update:models', [...props.models, model])
  } else {
    emit(
      'update:models',
      props.models.map((m) => (m.id === editingModel.value?.id ? model : m)),
    )
  }
  closeEditor()
}

function removeModel(modelId: string) {
  if (!confirm(`删除模型 ${modelId}？`)) return
  emit(
    'update:models',
    props.models.filter((m) => m.id !== modelId),
  )
}
</script>

<style scoped>
.provider-model-table {
  background: var(--app-settings-card);
}

.provider-model-table__header {
  background: var(--app-settings-bg);
}

.provider-model-table__head {
  background: color-mix(in srgb, var(--app-list-bg) 70%, var(--app-settings-card));
  color: var(--app-text-secondary);
}

.provider-model-table__title {
  color: var(--app-text-primary);
}

.provider-model-table__subtitle {
  color: var(--app-text-secondary);
}

.provider-model-table__row:nth-child(even) {
  background: color-mix(in srgb, var(--app-settings-bg) 35%, transparent);
}

.provider-model-table__row--hover:hover {
  background: var(--app-hover);
}

.provider-model-table__link {
  transition: color 0.15s;
}

.provider-model-table__link--edit {
  color: var(--app-text-link);
}

.provider-model-table__link--danger {
  color: #ff6b6b;
}

.provider-model-table__link:hover {
  text-decoration: underline;
}
</style>
