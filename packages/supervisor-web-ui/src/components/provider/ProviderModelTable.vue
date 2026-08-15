<template>
  <section class="provider-model-table">
    <div class="provider-model-table__header">
      <div>
        <div class="provider-model-table__title">模型</div>
        <div class="provider-model-table__subtitle">
          {{ editable ? "增删改查" : "查看模型能力标签与启用状态" }}
        </div>
      </div>
      <button
        v-if="editable"
        type="button"
        class="provider-model-table__add"
        @click="openCreate"
      >
        添加模型
      </button>
    </div>

    <div class="provider-model-table__scroll">
      <table class="provider-model-table__grid">
        <thead class="provider-model-table__head">
          <tr>
            <th class="provider-model-table__cell provider-model-table__cell--center">Provider</th>
            <th class="provider-model-table__cell provider-model-table__cell--left">Model ID</th>
            <th class="provider-model-table__cell provider-model-table__cell--left">名称</th>
            <th class="provider-model-table__cell provider-model-table__cell--right">上下文</th>
            <th class="provider-model-table__cell provider-model-table__cell--center">图像</th>
            <th v-if="editable" class="provider-model-table__cell provider-model-table__cell--right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="model in models"
            :key="model.id"
            class="provider-model-table__row"
          >
            <td class="provider-model-table__cell provider-model-table__cell--center">
              <ProviderAvatar
                :provider-id="provider?.id ?? 'provider'"
                :provider-name="provider?.name ?? 'Provider'"
                :icon="provider?.icon ?? null"
                class="provider-model-table__avatar"
              />
            </td>
            <td class="provider-model-table__cell provider-model-table__cell--left provider-model-table__mono provider-model-table__title">{{ model.id }}</td>
            <td class="provider-model-table__cell provider-model-table__cell--left provider-model-table__title">{{ model.name }}</td>
            <td class="provider-model-table__cell provider-model-table__cell--right provider-model-table__mono provider-model-table__subtitle">
              {{ formatTokenCount(model.contextWindow) }}
            </td>
            <td class="provider-model-table__cell provider-model-table__cell--center">
              <ModelMultimodalIcon :supports-multimodal="model.supportsVision" />
            </td>
            <td v-if="editable" class="provider-model-table__cell provider-model-table__cell--right provider-model-table__actions">
              <button
                type="button"
                class="provider-model-table__link provider-model-table__link--edit"
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
      class="provider-model-table__empty provider-model-table__subtitle"
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
import ModelMultimodalIcon from "@/components/provider/ModelMultimodalIcon.vue";
import ProviderModelEditor from "@/components/provider/ProviderModelEditor.vue";
import ProviderAvatar from "@/components/provider/ProviderAvatar.vue";
import type { UIProvider, UIProviderModel } from "@/types/ui";
import { formatTokenCount } from "../../utils/format-tokens";
import { requestUiDeleteConfirm } from "@/composables/use-ui-confirm";

const props = withDefaults(
  defineProps<{
    models: UIProviderModel[];
    provider?: Pick<UIProvider, "id" | "name" | "icon">;
    editable?: boolean;
  }>(),
  { editable: false },
);

const emit = defineEmits<{
  "update:models": [models: UIProviderModel[]];
}>();

const editorOpen = ref(false);
const editorMode = ref<"create" | "edit">("create");
const editingModel = ref<UIProviderModel | null>(null);

function openCreate() {
  editorMode.value = "create";
  editingModel.value = null;
  editorOpen.value = true;
}

function openEdit(model: UIProviderModel) {
  editorMode.value = "edit";
  editingModel.value = model;
  editorOpen.value = true;
}

function closeEditor() {
  editorOpen.value = false;
  editingModel.value = null;
}

function onEditorSave(model: UIProviderModel) {
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

async function removeModel(modelId: string) {
  if (!(await requestUiDeleteConfirm({ title: "删除模型", message: `确定删除模型 ${modelId}？` }))) {
    return;
  }
  emit(
    "update:models",
    props.models.filter((m) => m.id !== modelId),
  );
}
</script>

<style scoped>
.provider-model-table {
  overflow: hidden;
  border-radius: var(--app-radius-control);
  background: var(--app-settings-card);
}

.provider-model-table__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
  padding: 0.75rem 1rem;
  background: var(--app-settings-bg);
}

.provider-model-table__scroll {
  overflow-x: auto;
}

.provider-model-table__grid {
  width: 100%;
  min-width: 40rem;
  font-size: var(--app-font-control);
}

.provider-model-table__cell {
  padding: 0.625rem 1rem;
  font-weight: var(--app-font-weight-medium);
}

.provider-model-table__cell--center {
  width: 4rem;
  text-align: center;
}

.provider-model-table__cell--left {
  text-align: left;
}

.provider-model-table__cell--right {
  text-align: right;
}

.provider-model-table__avatar {
  width: 1.75rem;
  height: 1.75rem;
  margin: 0 auto;
}

.provider-model-table__mono {
  font-family: var(--app-font-mono);
}

.provider-model-table__actions {
  white-space: nowrap;
}

.provider-model-table__actions .provider-model-table__link + .provider-model-table__link {
  margin-left: 0.75rem;
}

.provider-model-table__title {
  font-size: var(--app-font-body);
}

.provider-model-table__subtitle {
  font-size: var(--app-font-caption);
}

.provider-model-table__add {
  flex-shrink: 0;
  padding: 0.375rem 0.75rem;
  border-radius: var(--app-radius-control);
  color: #fff;
  background: var(--app-accent);
  font-size: var(--app-font-control);
}

.provider-model-table__add:hover {
  background: var(--app-accent-hover);
}

.provider-model-table__empty {
  padding: 2.5rem 1rem;
  text-align: center;
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
  transition: color var(--app-motion-fast);
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
