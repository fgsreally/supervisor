<template>
  <div
    v-if="open"
    class="provider-model-editor"
    @click.self="emit('cancel')"
  >
    <div
      class="provider-model-editor__dialog"
    >
      <div
        class="provider-model-editor__header"
      >
        <div class="provider-model-editor__title">
          {{ mode === "create" ? "添加模型" : "编辑模型" }}
        </div>
        <button
          type="button"
          class="provider-model-editor__close"
          @click="emit('cancel')"
        >
          <X class="provider-model-editor__icon" />
        </button>
      </div>

      <div class="provider-model-editor__body custom-scrollbar">
        <label class="provider-model-editor__field">
          <span class="provider-model-editor__muted">Model ID</span>
          <input
            v-model="draft.id"
            type="text"
            :disabled="mode === 'edit'"
            placeholder="例如 gpt-4o"
            class="provider-model-editor__input provider-model-editor__input--mono"
          />
        </label>

        <label class="provider-model-editor__field">
          <span class="provider-model-editor__muted">显示名称</span>
          <input
            v-model="draft.name"
            type="text"
            placeholder="可选，默认同 Model ID"
            class="provider-model-editor__input"
          />
        </label>

        <div>
          <label class="provider-model-editor__field">
            <span class="provider-model-editor__muted">上下文上限 (tokens)</span>
            <input
              v-model.number="draft.contextWindow"
              type="number"
              min="1"
              step="1000"
              class="provider-model-editor__input provider-model-editor__input--mono"
            />
            <span class="provider-model-editor__hint provider-model-editor__muted"
              >≈ {{ formatTokenCount(draft.contextWindow) }}</span
            >
          </label>
        </div>

        <label
          class="provider-model-editor__option"
        >
          <input v-model="draft.supportsVision" type="checkbox" class="provider-model-editor__checkbox" />
          <ModelMultimodalIcon :supports-multimodal="draft.supportsVision" />
          <div>
            <div class="provider-model-editor__title provider-model-editor__option-title">支持图像输入</div>
            <div class="provider-model-editor__muted provider-model-editor__hint">对应 pi Model.input 含 image</div>
          </div>
        </label>
      </div>

      <div class="provider-model-editor__footer">
        <button
          type="button"
          class="provider-model-editor__cancel"
          @click="emit('cancel')"
        >
          取消
        </button>
        <button
          type="button"
          class="provider-model-editor__save"
          :disabled="!canSave || saving"
          @click="save"
        >
          {{ saving ? "保存中..." : "保存" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import ModelMultimodalIcon from "@/components/provider/ModelMultimodalIcon.vue";
import type { UIProviderModel } from "@/types/ui";
import { createEmptyProviderModel } from "@/constants/providers";
import { formatTokenCount } from "../../utils/format-tokens";

const props = defineProps<{
  open: boolean;
  mode: "create" | "edit";
  model?: UIProviderModel | null;
  existingIds?: string[];
  saving?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  save: [model: UIProviderModel];
}>();

const draft = ref<UIProviderModel>(createEmptyProviderModel());

watch(
  () => [props.open, props.mode, props.model] as const,
  ([open, mode, model]) => {
    if (!open) return;
    if (mode === "edit" && model) {
      draft.value = { ...model };
    } else {
      draft.value = createEmptyProviderModel();
    }
  },
  { immediate: true },
);

const canSave = computed(() => {
  const id = draft.value.id.trim();
  if (!id) return false;
  if (draft.value.contextWindow <= 0) return false;
  if (props.mode === "create" && props.existingIds?.includes(id)) return false;
  return true;
});

function save() {
  if (!canSave.value) return;
  const id = draft.value.id.trim();
  emit("save", {
    id,
    name: draft.value.name.trim() || id,
    contextWindow: draft.value.contextWindow,
    supportsVision: draft.value.supportsVision,
  });
}
</script>

<style scoped>
.provider-model-editor {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
  background: rgb(0 0 0 / 42%);
}

.provider-model-editor__dialog {
  width: 100%;
  overflow: hidden;
  border-radius: var(--app-radius-panel) var(--app-radius-panel) 0 0;
  box-shadow: var(--app-shadow-floating);
  background: var(--app-settings-card);
  color: var(--app-text-primary);
}

.provider-model-editor__header,
.provider-model-editor__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--app-border);
}

.provider-model-editor__footer {
  justify-content: flex-end;
  gap: var(--app-space-2);
  border-top: 1px solid var(--app-border);
  border-bottom: 0;
}

.provider-model-editor__body {
  display: flex;
  max-height: 70vh;
  flex-direction: column;
  gap: var(--app-space-4);
  overflow-y: auto;
  padding: 1rem 1.25rem;
}

.provider-model-editor__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: var(--app-font-control);
}

.provider-model-editor__input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-control);
  outline: none;
}

.provider-model-editor__input--mono {
  font-family: var(--app-font-mono);
}

.provider-model-editor__hint {
  display: block;
  margin-top: 0.25rem;
  font-size: var(--app-font-micro);
}

.provider-model-editor__option {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  padding: 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-control);
  cursor: pointer;
}

.provider-model-editor__option-title {
  font-size: var(--app-font-control);
}

.provider-model-editor__checkbox {
  border-color: var(--app-border);
}

.provider-model-editor__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.provider-model-editor__close,
.provider-model-editor__cancel,
.provider-model-editor__save {
  padding: 0.5rem 1rem;
  border-radius: var(--app-radius-control);
  font-size: var(--app-font-control);
}

.provider-model-editor__close {
  padding: 0.25rem;
}

.provider-model-editor__cancel {
  border: 1px solid var(--app-border);
}

.provider-model-editor__save {
  color: #fff;
  background: var(--app-accent);
}

.provider-model-editor__save:hover:not(:disabled) {
  background: var(--app-accent-hover);
}

.provider-model-editor__save:disabled {
  opacity: 0.5;
}

.provider-model-editor__header,
.provider-model-editor__footer,
.provider-model-editor__option,
.provider-model-editor__input {
  border-color: var(--app-border);
}

.provider-model-editor__title {
  color: var(--app-text-primary);
}

.provider-model-editor__muted,
.provider-model-editor__close {
  color: var(--app-text-secondary);
}

.provider-model-editor__close:hover,
.provider-model-editor__option:hover,
.provider-model-editor__cancel:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.provider-model-editor__input {
  background: var(--app-settings-card);
  color: var(--app-text-primary);
}

.provider-model-editor__input:focus {
  border-color: var(--app-accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-accent) 35%, transparent);
}

.provider-model-editor__input:disabled {
  background: var(--app-hover);
  color: var(--app-text-secondary);
}

.provider-model-editor__cancel {
  border-color: var(--app-border);
  color: var(--app-text-secondary);
}

@media (min-width: 640px) {
  .provider-model-editor {
    align-items: center;
    padding: 1rem;
  }

  .provider-model-editor__dialog {
    max-width: 32rem;
    border-radius: var(--app-radius-panel);
  }
}
</style>
