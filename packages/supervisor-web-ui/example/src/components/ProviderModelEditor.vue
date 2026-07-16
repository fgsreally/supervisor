<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4"
    @click.self="emit('cancel')"
  >
    <div class="w-full sm:max-w-lg bg-white rounded-t-xl sm:rounded-xl shadow-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div class="text-[16px] font-medium text-gray-900">
          {{ mode === "create" ? "添加模型" : "编辑模型" }}
        </div>
        <button
          type="button"
          class="p-1 rounded-md text-gray-500 hover:bg-gray-100"
          @click="emit('cancel')"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
        <label class="block text-[13px]">
          <span class="text-gray-500 mb-1 block">Model ID</span>
          <input
            v-model="draft.id"
            type="text"
            :disabled="mode === 'edit'"
            placeholder="例如 gpt-4o"
            class="w-full px-3 py-2 border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-[#07c160]/50 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </label>

        <label class="block text-[13px]">
          <span class="text-gray-500 mb-1 block">显示名称</span>
          <input
            v-model="draft.name"
            type="text"
            placeholder="可选，默认同 Model ID"
            class="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#07c160]/50"
          />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="block text-[13px]">
            <span class="text-gray-500 mb-1 block">上下文上限 (tokens)</span>
            <input
              v-model.number="draft.contextWindow"
              type="number"
              min="1"
              step="1000"
              class="w-full px-3 py-2 border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-[#07c160]/50"
            />
            <span class="text-[11px] text-gray-400 mt-1 block"
              >≈ {{ formatTokenCount(draft.contextWindow) }}</span
            >
          </label>
          <label class="block text-[13px]">
            <span class="text-gray-500 mb-1 block">最大输出 (tokens)</span>
            <input
              v-model.number="draft.maxTokens"
              type="number"
              min="1"
              step="256"
              class="w-full px-3 py-2 border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-[#07c160]/50"
            />
            <span class="text-[11px] text-gray-400 mt-1 block"
              >≈ {{ formatTokenCount(draft.maxTokens) }}</span
            >
          </label>
        </div>

        <label
          class="flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50"
        >
          <input
            v-model="draft.supportsMultimodal"
            type="checkbox"
            class="rounded border-gray-300"
          />
          <ModelMultimodalIcon :supports-multimodal="draft.supportsMultimodal" />
          <div>
            <div class="text-[13px] text-gray-900">支持图像输入</div>
            <div class="text-[11px] text-gray-500">对应 pi Model.input 含 image</div>
          </div>
        </label>
      </div>

      <div class="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
        <button
          type="button"
          class="px-4 py-2 text-[13px] rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
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
import type { MockProviderModel } from "../mock/providers";
import { createEmptyProviderModel } from "../mock/providers";
import { formatTokenCount } from "../utils/format-tokens";

const props = defineProps<{
  open: boolean;
  mode: "create" | "edit";
  model?: MockProviderModel | null;
  existingIds?: string[];
}>();

const emit = defineEmits<{
  cancel: [];
  save: [model: MockProviderModel];
}>();

const draft = ref<MockProviderModel>(createEmptyProviderModel());

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
  if (draft.value.contextWindow <= 0 || draft.value.maxTokens <= 0) return false;
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
    maxTokens: draft.value.maxTokens,
    supportsMultimodal: draft.value.supportsMultimodal,
  });
}
</script>
