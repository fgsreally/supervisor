<template>
  <div class="model-form-view flex flex-col flex-1 min-w-0 h-full overflow-hidden">
    <header class="model-form-header h-16 px-6 border-b flex items-center shrink-0">
      <div class="flex-1 min-w-0">
        <h1 class="model-form-title text-[16px] font-medium">
          {{ mode === "create" ? "添加模型" : "编辑模型" }}
        </h1>
        <p class="model-form-muted text-[12px] mt-0.5 truncate">{{ providerName }}</p>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <form class="model-form-content max-w-5xl" @submit.prevent="save">
        <section class="model-form-section">
          <h2 class="model-form-title text-[14px] font-medium mb-5">基本信息</h2>
          <div class="space-y-4">
            <label class="model-form-field">
              <span>Model ID</span>
              <input
                v-model="draft.id"
                type="text"
                :disabled="mode === 'edit'"
                placeholder="例如 gpt-4o"
                class="model-form-input font-mono"
              />
            </label>
            <label class="model-form-field">
              <span>显示名称</span>
              <input
                v-model="draft.name"
                type="text"
                placeholder="默认使用 Model ID"
                class="model-form-input"
              />
            </label>
            <label class="model-form-field">
              <span>标签</span>
              <input
                v-model="tagsInput"
                type="text"
                placeholder="用逗号分隔，例如 summary, review"
                class="model-form-input font-mono"
              />
            </label>
          </div>
        </section>

        <section class="model-form-section">
          <h2 class="model-form-title text-[14px] font-medium mb-5">能力与限制</h2>
          <div class="space-y-4">
            <label class="model-form-field">
              <span>上下文上限</span>
              <input
                v-model.number="draft.contextWindow"
                type="number"
                min="1"
                step="1000"
                class="model-form-input font-mono"
              />
            </label>
            <label class="model-form-field">
              <span>最大输出</span>
              <input
                v-model.number="draft.maxTokens"
                type="number"
                min="1"
                step="256"
                class="model-form-input font-mono"
              />
            </label>
            <label class="model-form-field">
              <span>图像输入</span>
              <span class="model-form-switch-row">
                <input
                  v-model="draft.supportsMultimodal"
                  type="checkbox"
                  class="accent-[#07c160]"
                />
                <span class="model-form-title">支持多模态输入</span>
              </span>
            </label>
          </div>
        </section>
      </form>
    </div>

    <footer class="model-form-actions border-t px-6 py-3 flex justify-end gap-2 shrink-0">
      <button type="button" class="model-form-btn" @click="emit('cancel')">取消</button>
      <button
        type="button"
        class="model-form-btn model-form-btn--primary"
        :disabled="!canSave || saving"
        @click="save"
      >
        {{ saving ? "保存中…" : "保存" }}
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { UIProviderModel } from "@/types/ui";
import { createEmptyProviderModel } from "@/constants/providers";
import { useProviderStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";

const props = defineProps<{
  providerId: string;
  providerName: string;
  mode: "create" | "edit";
  model?: UIProviderModel | null;
}>();
const emit = defineEmits<{ cancel: []; saved: [modelId: string] }>();
const providerStore = useProviderStore();
const draft = ref<UIProviderModel>(createEmptyProviderModel());
const tagsInput = ref("");
const saving = ref(false);

watch(
  () => [props.mode, props.model, props.providerId] as const,
  ([mode, model]) => {
    draft.value = mode === "edit" && model ? { ...model } : createEmptyProviderModel();
    tagsInput.value = mode === "edit" && model ? model.tags.join(", ") : "";
  },
  { immediate: true },
);

const canSave = computed(() => {
  const id = draft.value.id.trim();
  if (!id || draft.value.contextWindow <= 0 || draft.value.maxTokens <= 0) return false;
  if (props.mode === "create") {
    return !(providerStore.models[props.providerId] ?? []).some((model) => model.modelId === id);
  }
  return true;
});

async function save() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  try {
    const modelId = draft.value.id.trim();
    const payload = {
      name: draft.value.name.trim() || modelId,
      contextWindow: draft.value.contextWindow,
      maxTokens: draft.value.maxTokens,
      supportsMultimodal: draft.value.supportsMultimodal,
      tags: tagsInput.value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    if (props.mode === "create") {
      await providerStore.createModel(props.providerId, { modelId, ...payload });
    } else {
      await providerStore.updateModel(props.providerId, modelId, payload);
    }
    emit("saved", modelId);
    showUiMessage(props.mode === "create" ? "模型创建成功" : "模型保存成功", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "模型保存失败", "error");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.model-form-view,
.model-form-header,
.model-form-actions {
  background: var(--app-chat-bg);
}

.model-form-header,
.model-form-actions,
.model-form-section {
  border-color: var(--app-border);
}

.model-form-content {
  padding: 8px 24px 48px;
}

.model-form-section {
  padding: 24px 0;
  border-bottom: 1px solid var(--app-border-subtle);
}

.model-form-title {
  color: var(--app-text-primary);
}

.model-form-muted,
.model-form-field > span:first-child {
  color: var(--app-text-secondary);
}

.model-form-field {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  font-size: 13px;
}

.model-form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  outline: none;
  background: var(--app-chat-bg);
  color: var(--app-text-primary);
}

.model-form-input:focus {
  border-color: var(--app-accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-accent) 35%, transparent);
}

.model-form-input:disabled {
  background: var(--app-hover);
  color: var(--app-text-secondary);
}

.model-form-switch-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.model-form-btn {
  padding: 8px 16px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.model-form-btn:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.model-form-btn--primary {
  border-color: var(--app-accent);
  background: var(--app-accent);
  color: #ffffff;
}

.model-form-btn--primary:hover:not(:disabled) {
  background: #06ad56;
  color: #ffffff;
}

.model-form-btn:disabled {
  opacity: 0.5;
}

@media (max-width: 767px) {
  .model-form-content {
    padding-inline: 16px;
  }

  .model-form-field {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
}
</style>
