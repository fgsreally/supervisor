<template>
  <div
    v-if="open"
    class="provider-model-editor fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    @click.self="emit('cancel')"
  >
    <div
      class="provider-model-editor__dialog w-full sm:max-w-lg rounded-t-lg sm:rounded-lg shadow-xl overflow-hidden"
    >
      <div
        class="provider-model-editor__header px-5 py-4 border-b flex items-center justify-between"
      >
        <div class="provider-model-editor__title text-[16px] font-medium">
          {{ mode === "create" ? "添加模型" : "编辑模型" }}
        </div>
        <button
          type="button"
          class="provider-model-editor__close p-1 rounded-md"
          @click="emit('cancel')"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
        <label class="block text-[13px]">
          <span class="provider-model-editor__muted mb-1 block">Model ID</span>
          <input
            v-model="draft.id"
            type="text"
            :disabled="mode === 'edit'"
            placeholder="例如 gpt-4o"
            class="provider-model-editor__input w-full px-3 py-2 border rounded-md font-mono focus:outline-none"
          />
        </label>

        <label class="block text-[13px]">
          <span class="provider-model-editor__muted mb-1 block">显示名称</span>
          <input
            v-model="draft.name"
            type="text"
            placeholder="可选，默认同 Model ID"
            class="provider-model-editor__input w-full px-3 py-2 border rounded-md focus:outline-none"
          />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="block text-[13px]">
            <span class="provider-model-editor__muted mb-1 block">上下文上限 (tokens)</span>
            <input
              v-model.number="draft.contextWindow"
              type="number"
              min="1"
              step="1000"
              class="provider-model-editor__input w-full px-3 py-2 border rounded-md font-mono focus:outline-none"
            />
            <span class="provider-model-editor__muted text-[11px] mt-1 block"
              >≈ {{ formatTokenCount(draft.contextWindow) }}</span
            >
          </label>
          <label class="block text-[13px]">
            <span class="provider-model-editor__muted mb-1 block">最大输出 (tokens)</span>
            <input
              v-model.number="draft.maxTokens"
              type="number"
              min="1"
              step="256"
              class="provider-model-editor__input w-full px-3 py-2 border rounded-md font-mono focus:outline-none"
            />
            <span class="provider-model-editor__muted text-[11px] mt-1 block"
              >≈ {{ formatTokenCount(draft.maxTokens) }}</span
            >
          </label>
        </div>

        <label
          class="provider-model-editor__option flex items-center gap-3 px-3 py-3 rounded-md border cursor-pointer"
        >
          <input
            v-model="draft.supportsMultimodal"
            type="checkbox"
            class="rounded border-gray-300"
          />
          <ModelMultimodalIcon :supports-multimodal="draft.supportsMultimodal" />
          <div>
            <div class="provider-model-editor__title text-[13px]">支持图像输入</div>
            <div class="provider-model-editor__muted text-[11px]">对应 pi Model.input 含 image</div>
          </div>
        </label>

        <label class="block text-[13px]">
          <span class="provider-model-editor__muted mb-1 block">标签（逗号分隔）</span>
          <input
            v-model="tagsInput"
            type="text"
            placeholder="例如 summary,review,commit-message"
            class="provider-model-editor__input w-full px-3 py-2 border rounded-md font-mono focus:outline-none"
          />
        </label>
      </div>

      <div class="provider-model-editor__footer px-5 py-4 border-t flex justify-end gap-2">
        <button
          type="button"
          class="provider-model-editor__cancel px-4 py-2 text-[13px] rounded-md border"
          @click="emit('cancel')"
        >
          取消
        </button>
        <button
          type="button"
          class="px-4 py-2 text-[13px] rounded-md bg-[#07c160] text-white hover:bg-[#06ad56] disabled:opacity-50"
          :disabled="!canSave"
          @click="save"
        >
          保存
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import ModelMultimodalIcon from "./ModelMultimodalIcon.vue";
import type { UIProviderModel } from "@/types/ui";
import { createEmptyProviderModel } from "@/constants/providers";
import { formatTokenCount } from "../utils/format-tokens";

const props = defineProps<{
  open: boolean;
  mode: "create" | "edit";
  model?: UIProviderModel | null;
  existingIds?: string[];
}>();

const emit = defineEmits<{
  cancel: [];
  save: [model: UIProviderModel];
}>();

const draft = ref<UIProviderModel>(createEmptyProviderModel());
const tagsInput = ref("");

watch(
  () => [props.open, props.mode, props.model] as const,
  ([open, mode, model]) => {
    if (!open) return;
    if (mode === "edit" && model) {
      draft.value = { ...model };
      tagsInput.value = model.tags.join(",");
    } else {
      draft.value = createEmptyProviderModel();
      tagsInput.value = "";
    }
  },
  { immediate: true },
);

const canSave = computed(() => {
  const id = draft.value.id.trim();
  if (!id) return false;
  if (draft.value.contextWindow <= 0 || draft.value.maxTokens <= 0) return false;
  if (props.mode === "create" && props.existingIds?.includes(id)) return false;
  return true;
});

function save() {
  if (!canSave.value) return;
  const id = draft.value.id.trim();
  const tags = tagsInput.value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  emit("save", {
    id,
    name: draft.value.name.trim() || id,
    contextWindow: draft.value.contextWindow,
    maxTokens: draft.value.maxTokens,
    supportsMultimodal: draft.value.supportsMultimodal,
    tags,
  });
}
</script>

<style scoped>
.provider-model-editor {
  background: rgb(0 0 0 / 42%);
}

.provider-model-editor__dialog {
  background: var(--app-settings-card);
  color: var(--app-text-primary);
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
</style>
