<template>
  <div
    class="provider-form-view flex flex-col flex-1 min-w-0 basis-0 h-full w-full overflow-hidden"
  >
    <div
      class="provider-form-header h-14 md:h-16 border-b flex items-center px-3 md:px-6 shrink-0 gap-3"
    >
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
      </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
      <template v-if="!modelsOnly">
        <section class="provider-form-card rounded-lg border p-4 space-y-4">
          <div class="text-[14px] font-medium provider-form-title">基本信息</div>

          <div v-if="isNew" class="provider-form-field">
            <div class="provider-form-subtitle text-[13px] md:pt-2">快速预设</div>
            <div class="flex flex-wrap gap-2 min-w-0">
              <button
                v-for="preset in PROVIDER_PRESETS"
                :key="preset.id"
                type="button"
                class="provider-form-preset-btn px-3 py-2.5 rounded-md text-[12px] inline-flex items-center gap-2"
                :class="{ 'provider-form-preset-btn--active': selectedPresetId === preset.id }"
                @click="applyProviderPreset(preset)"
              >
                <ProviderAvatar
                  :provider-id="preset.id"
                  :provider-name="preset.name"
                  :icon="preset.icon"
                  class="provider-form-preset-icon w-6 h-6"
                />
                <span>{{ preset.name }}</span>
              </button>
            </div>
          </div>

          <label class="provider-form-field text-[13px]">
            <span class="provider-form-subtitle md:pt-2">名称</span>
            <input
              v-model="draft.name"
              type="text"
              placeholder="例如 OpenAI"
              class="provider-form-input w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-[#07c160]/50"
            />
          </label>

          <div class="provider-form-field">
            <div class="provider-form-subtitle text-[13px] md:pt-2">图标</div>
            <div class="flex items-center min-w-0">
              <input
                ref="iconInput"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                class="hidden"
                @change="onIconSelected"
              />
              <button
                type="button"
                class="provider-form-avatar-upload relative w-14 h-14 rounded-md overflow-hidden"
                :disabled="uploading"
                title="上传图标"
                @click="iconInput?.click()"
              >
                <ProviderAvatar
                  v-if="draft.icon"
                  :provider-id="draft.id"
                  :provider-name="draft.name || 'Provider'"
                  :icon="draft.icon"
                  class="provider-form-current-icon w-full h-full"
                />
                <span
                  class="provider-form-avatar-overlay absolute inset-0 flex items-center justify-center"
                  :class="{ 'provider-form-avatar-overlay--empty': !draft.icon }"
                >
                  <Upload class="w-5 h-5" />
                </span>
              </button>
            </div>
          </div>

          <label class="provider-form-field text-[13px]">
            <span class="provider-form-subtitle md:pt-2">启用</span>
            <span class="provider-form-switch-row">
              <input v-model="draft.isEnabled" type="checkbox" class="sr-only" />
              <span class="provider-form-toggle" aria-hidden="true"><span /></span>
              <span class="provider-form-title">允许绑定的智能代理使用此模型供应商</span>
            </span>
          </label>
        </section>

        <section class="provider-form-card rounded-lg border p-4 space-y-4">
          <div class="text-[14px] font-medium provider-form-title">连接配置</div>

          <div class="provider-form-field">
            <div class="provider-form-subtitle text-[13px] md:pt-2">API Type</div>
            <div class="flex flex-col sm:flex-row gap-2">
              <label
                v-for="opt in PROVIDER_API_TYPES"
                :key="opt.value"
                class="flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer text-[13px] transition-colors"
                :class="
                  draft.apiType === opt.value
                    ? 'provider-form-radio provider-form-radio--active'
                    : 'provider-form-radio provider-form-radio--idle'
                "
              >
                <input
                  v-model="draft.apiType"
                  type="radio"
                  :value="opt.value"
                  class="accent-[#07c160]"
                />
                <span class="font-mono">{{ opt.value }}</span>
              </label>
            </div>
          </div>

          <label class="provider-form-field text-[13px]">
            <span class="provider-form-subtitle md:pt-2">Base URL</span>
            <input
              v-model="baseUrlInput"
              type="text"
              placeholder="留空使用默认端点"
              class="provider-form-input w-full px-3 py-2 border rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-[#07c160]/50"
            />
          </label>

          <label class="provider-form-field text-[13px]">
            <span class="provider-form-subtitle md:pt-2">API Key</span>
            <span class="relative block min-w-0">
              <input
                v-model="apiKeyInput"
                :type="showApiKey ? 'text' : 'password'"
                :placeholder="isNew ? '输入供应商 API Key' : '留空则保留已有 API Key'"
                autocomplete="new-password"
                spellcheck="false"
                class="provider-form-input w-full pl-3 pr-10 py-2 border rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-[#07c160]/50"
              />
              <button
                type="button"
                class="provider-form-secret-toggle absolute inset-y-0 right-0 w-10 flex items-center justify-center"
                :title="showApiKey ? '隐藏 API Key' : '显示 API Key'"
                @click.prevent="showApiKey = !showApiKey"
              >
                <EyeOff v-if="showApiKey" class="w-4 h-4" />
                <Eye v-else class="w-4 h-4" />
              </button>
            </span>
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

    <footer
      class="provider-form-actions shrink-0 border-t px-4 md:px-6 py-3 flex justify-end gap-2"
    >
      <button
        type="button"
        class="provider-form-cancel-btn px-4 py-2 rounded-md border text-[13px]"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        type="button"
        class="provider-form-save-btn px-4 py-2 rounded-md text-[13px] disabled:opacity-50"
        :disabled="!canSave"
        @click="save"
      >
        {{ modelsOnly ? "完成" : "保存" }}
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronLeft, Eye, EyeOff, Upload } from "lucide-vue-next";
import ProviderModelTable from "../components/ProviderModelTable.vue";
import ProviderAvatar from "../components/ProviderAvatar.vue";
import type { UIProvider, UIProviderModel } from "@/types/ui";
import { PROVIDER_API_TYPES, PROVIDER_PRESETS } from "@/constants/providers";
import { useProviderStore } from "@/store";
import { providerToUI } from "@/utils/provider-ui";
import { uploadIcon } from "@/api";

const props = defineProps<{
  providerId?: string | null;
  showBack?: boolean;
  modelsOnly?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  saved: [id: string];
}>();

const providerStore = useProviderStore();
const isNew = computed(() => !props.providerId);
const iconInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const apiKeyInput = ref("");
const showApiKey = ref(false);
const selectedPresetId = ref<string | null>(null);

const title = computed(() => {
  if (props.modelsOnly) return "管理模型";
  return isNew.value ? "添加模型供应商" : "编辑模型供应商";
});

function emptyDraft(): UIProvider {
  return {
    id: "",
    slug: null,
    name: "",
    icon: null,
    apiType: "openai-compatible",
    baseUrl: null,
    isEnabled: true,
    models: [],
  };
}

async function onIconSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    draft.value.icon = (await uploadIcon(file)).path;
    selectedPresetId.value = null;
  } finally {
    uploading.value = false;
    input.value = "";
  }
}

function cloneProvider(p: UIProvider): UIProvider {
  return JSON.parse(JSON.stringify(p)) as UIProvider;
}

const draft = ref<UIProvider>(emptyDraft());

async function loadDraft(id: string) {
  await providerStore.fetchProvider(id);
  await providerStore.fetchModels(id);
  const p = providerStore.getProviderById(id);
  if (p) draft.value = cloneProvider(providerToUI(p, providerStore.models[id] ?? []));
}

watch(
  () => props.providerId,
  (id) => {
    if (id) {
      selectedPresetId.value = null;
      apiKeyInput.value = "";
      showApiKey.value = false;
      void loadDraft(id);
    } else {
      draft.value = emptyDraft();
      apiKeyInput.value = "";
      showApiKey.value = false;
      selectedPresetId.value = null;
    }
  },
  { immediate: true },
);

const baseUrlInput = computed({
  get: () => draft.value.baseUrl ?? "",
  set: (v: string) => {
    draft.value.baseUrl = v.trim() ? v.trim() : null;
  },
});

const canSave = computed(() => {
  if (props.modelsOnly) {
    return !draft.value.models.some((m) => !m.id.trim());
  }
  if (!draft.value.name.trim()) return false;
  const modelIds = draft.value.models.map((model) => model.id.trim());
  return (
    modelIds.every(Boolean) &&
    new Set(modelIds).size === modelIds.length &&
    draft.value.models.every((model) => model.contextWindow > 0 && model.maxTokens > 0)
  );
});

function onModelsUpdate(models: UIProviderModel[]) {
  draft.value.models = models;
}

function applyProviderPreset(preset: (typeof PROVIDER_PRESETS)[number]) {
  if (selectedPresetId.value === preset.id) {
    selectedPresetId.value = null;
    draft.value.id = "";
    draft.value.name = "";
    draft.value.icon = null;
    draft.value.apiType = "openai-compatible";
    draft.value.baseUrl = null;
    draft.value.models = [];
    apiKeyInput.value = "";
    return;
  }
  selectedPresetId.value = preset.id;
  if (preset.id === "custom") {
    draft.value.id = "";
    draft.value.name = "";
    draft.value.icon = preset.icon;
    draft.value.apiType = preset.apiType;
    draft.value.baseUrl = null;
    draft.value.models = preset.models.map((model) => ({ ...model, tags: [...model.tags] }));
    apiKeyInput.value = "";
    return;
  }
  draft.value.id = preset.id;
  draft.value.name = preset.name;
  draft.value.icon = preset.icon;
  draft.value.apiType = preset.apiType;
  draft.value.baseUrl = preset.baseUrl;
  draft.value.models = preset.models.map((model) => ({ ...model, tags: [...model.tags] }));
  apiKeyInput.value = "";
}

async function syncModels(providerId: string, models: UIProviderModel[]) {
  const existing = providerStore.models[providerId] ?? [];
  const existingIds = new Set(existing.map((m: import("@/api").Model) => m.modelId));
  const nextIds = new Set(models.map((m) => m.id.trim()));

  for (const m of existing) {
    if (!nextIds.has(m.modelId)) {
      await providerStore.deleteModel(providerId, m.modelId);
    }
  }
  for (const m of models) {
    const modelId = m.id.trim();
    const payload = {
      modelId,
      name: m.name.trim() || modelId,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      supportsMultimodal: m.supportsMultimodal,
      tags: m.tags,
    };
    if (existingIds.has(modelId)) {
      await providerStore.updateModel(providerId, modelId, payload);
    } else {
      await providerStore.createModel(providerId, payload);
    }
  }
}

async function save() {
  if (props.modelsOnly) {
    const id = props.providerId;
    if (!id || !canSave.value) return;
    await syncModels(id, draft.value.models);
    emit("saved", id);
    return;
  }

  if (!canSave.value) return;
  const payload = cloneProvider(draft.value);
  payload.name = payload.name.trim();

  if (isNew.value) {
    const slug = payload.id.trim() || providerSlug(payload.name);
    const created = await providerStore.createProvider({
      slug,
      name: payload.name,
      icon: payload.icon,
      apiType: payload.apiType,
      baseUrl: payload.baseUrl,
      apiKey: apiKeyInput.value.trim() || null,
      isEnabled: payload.isEnabled,
    });
    await syncModels(created.id, payload.models);
    emit("saved", created.id);
  } else {
    const patch: import("@/api").UpdateProviderRequest = {
      name: payload.name,
      isEnabled: payload.isEnabled,
      icon: payload.icon,
      apiType: payload.apiType,
      baseUrl: payload.baseUrl,
    };
    if (apiKeyInput.value.trim()) patch.apiKey = apiKeyInput.value.trim();
    await providerStore.updateProvider(payload.id, patch);
    await syncModels(payload.id, payload.models);
    emit("saved", payload.id);
  }
}

function providerSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `provider-${Date.now()}`;
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

.provider-form-actions {
  background: var(--app-settings-card);
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

.provider-form-field {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.provider-form-input {
  border-color: var(--app-border);
  background: var(--app-settings-card);
  color: var(--app-text-primary);
}

.provider-form-secret-toggle {
  color: var(--app-text-secondary);
}

.provider-form-secret-toggle:hover {
  color: var(--app-text-primary);
}

.provider-form-switch-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
}

.provider-form-toggle {
  position: relative;
  width: 36px;
  height: 20px;
  flex: none;
  border-radius: 10px;
  background: var(--app-border);
  transition: background 150ms ease;
}

.provider-form-toggle > span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 22%);
  transition: transform 150ms ease;
}

.provider-form-switch-row input:checked + .provider-form-toggle {
  background: var(--app-accent);
}

.provider-form-switch-row input:checked + .provider-form-toggle > span {
  transform: translateX(16px);
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
  border: 1px solid transparent;
  background: transparent;
  color: var(--app-text-secondary);
}

.provider-form-preset-btn:hover {
  background: color-mix(in srgb, var(--app-hover) 76%, transparent);
  color: var(--app-text-primary);
}

.provider-form-preset-btn--active {
  border-color: #07c160;
  background: rgb(7 193 96 / 7%);
  color: var(--app-text-primary);
}

.provider-form-preset-icon {
  border: 0;
  background: transparent;
  box-shadow: none;
}

.provider-form-preset-icon :deep(.provider-avatar__img) {
  width: 22px;
  height: 22px;
}

.provider-form-preset-icon :deep(.provider-avatar__icon) {
  width: 22px;
  height: 22px;
}

.provider-form-avatar-upload {
  border: 1px solid var(--app-border);
  background: var(--app-settings-bg);
}

.provider-form-current-icon {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.provider-form-current-icon :deep(.provider-avatar__img) {
  width: 30px;
  height: 30px;
}

.provider-form-avatar-overlay {
  background: rgb(0 0 0 / 52%);
  color: #ffffff;
  opacity: 0;
  transition: opacity 150ms ease;
}

.provider-form-avatar-overlay--empty {
  background: transparent;
  color: var(--app-text-secondary);
  opacity: 1;
}

.provider-form-avatar-upload:hover .provider-form-avatar-overlay--empty,
.provider-form-avatar-upload:focus-visible .provider-form-avatar-overlay--empty {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.provider-form-avatar-upload:hover .provider-form-avatar-overlay,
.provider-form-avatar-upload:focus-visible .provider-form-avatar-overlay {
  opacity: 1;
}

.provider-form-save-btn {
  border: 1px solid #07c160;
  background: #07c160;
  color: #ffffff;
}

.provider-form-save-btn:hover:not(:disabled) {
  border-color: #06ad56;
  background: #06ad56;
}

@media (max-width: 767px) {
  .provider-form-field {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
}
</style>
