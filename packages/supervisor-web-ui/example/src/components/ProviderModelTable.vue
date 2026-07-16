<template>
  <section class="provider-model-table rounded-lg border overflow-hidden">
    <div
      class="px-4 py-3 border-b provider-model-table__divider flex items-center justify-between gap-3"
    >
      <div>
        <div class="text-[14px] font-medium provider-model-table__title">模型</div>
        <div class="text-[12px] provider-model-table__subtitle mt-0.5">
          {{ editable ? "增删改查（mock 内存）" : "点击行设为 active" }}
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
        <thead class="provider-model-table__head border-b provider-model-table__divider">
          <tr>
            <th class="text-left font-medium px-4 py-2.5">Model ID</th>
            <th class="text-left font-medium px-4 py-2.5">名称</th>
            <th class="text-right font-medium px-4 py-2.5">上下文</th>
            <th class="text-right font-medium px-4 py-2.5">最大输出</th>
            <th class="text-center font-medium px-3 py-2.5 w-16">图像</th>
            <th v-if="showActive" class="text-center font-medium px-3 py-2.5 w-20">Active</th>
            <th v-if="editable" class="text-right font-medium px-4 py-2.5 w-28">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y provider-model-table__divider">
          <tr
            v-for="model in models"
            :key="model.id"
            class="transition-colors"
            :class="[
              showActive && model.id === activeModelId ? 'provider-model-table__row--active' : '',
              showActive && !editable ? 'cursor-pointer provider-model-table__row--hover' : '',
            ]"
            @click="onRowClick(model.id)"
          >
            <td class="px-4 py-2.5 font-mono provider-model-table__title">{{ model.id }}</td>
            <td class="px-4 py-2.5 provider-model-table__title">{{ model.name }}</td>
            <td class="px-4 py-2.5 text-right font-mono provider-model-table__subtitle">
              {{ formatTokenCount(model.contextWindow) }}
            </td>
            <td class="px-4 py-2.5 text-right font-mono provider-model-table__subtitle">
              {{ formatTokenCount(model.maxTokens) }}
            </td>
            <td class="px-3 py-2.5 text-center">
              <ModelMultimodalIcon :supports-multimodal="model.supportsMultimodal" />
            </td>
            <td v-if="showActive" class="px-3 py-2.5 text-center">
              <span
                v-if="model.id === activeModelId"
                class="px-1.5 py-0.5 rounded text-[10px] font-medium provider-model-table__active-badge"
              >
                active
              </span>
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

    <div
      v-if="models.length === 0"
      class="px-4 py-10 text-center text-[13px] provider-model-table__subtitle"
    >
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
import { ref } from "vue";
import ModelMultimodalIcon from "./ModelMultimodalIcon.vue";
import ProviderModelEditor from "./ProviderModelEditor.vue";
import type { MockProviderModel } from "../mock/providers";
import { formatTokenCount } from "../utils/format-tokens";

const props = withDefaults(
  defineProps<{
    models: MockProviderModel[];
    activeModelId?: string;
    editable?: boolean;
    showActive?: boolean;
  }>(),
  { editable: false, showActive: true },
);

const emit = defineEmits<{
  "update:models": [models: MockProviderModel[]];
  "set-active": [modelId: string];
}>();

const editorOpen = ref(false);
const editorMode = ref<"create" | "edit">("create");
const editingModel = ref<MockProviderModel | null>(null);

function onRowClick(modelId: string) {
  if (!props.showActive || props.editable) return;
  emit("set-active", modelId);
}

function openCreate() {
  editorMode.value = "create";
  editingModel.value = null;
  editorOpen.value = true;
}

function openEdit(model: MockProviderModel) {
  editorMode.value = "edit";
  editingModel.value = model;
  editorOpen.value = true;
}

function closeEditor() {
  editorOpen.value = false;
  editingModel.value = null;
}

function onEditorSave(model: MockProviderModel) {
  if (editorMode.value === "create") {
    emit("update:models", [...props.models, model]);
  } else {
    emit(
      "update:models",
      props.models.map((m) => (m.id === editingModel.value?.id ? model : m)),
    );
  }
  closeEditor();
}

function removeModel(modelId: string) {
  if (!confirm(`删除模型 ${modelId}？`)) return;
  emit(
    "update:models",
    props.models.filter((m) => m.id !== modelId),
  );
}
</script>

<style scoped>
.provider-model-table {
  background: var(--app-settings-card);
  border-color: var(--app-border-subtle);
}

.provider-model-table__divider {
  border-color: var(--app-border-subtle);
}

.provider-model-table__head {
  background: color-mix(in srgb, var(--app-settings-bg) 86%, transparent);
  color: var(--app-text-secondary);
}

.provider-model-table__title {
  color: var(--app-text-primary);
}

.provider-model-table__subtitle {
  color: var(--app-text-secondary);
}

.provider-model-table__row--active {
  background: color-mix(in srgb, var(--app-accent) 10%, transparent);
}

.provider-model-table__row--hover:hover {
  background: var(--app-hover);
}

.provider-model-table__active-badge {
  background: color-mix(in srgb, var(--app-accent) 20%, transparent);
  color: var(--app-accent);
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
