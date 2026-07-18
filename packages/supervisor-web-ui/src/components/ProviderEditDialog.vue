<template>
  <Teleport to="body">
    <div
      v-if="open && provider"
      class="provider-edit-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
      @click.self="close"
    >
      <section
        class="provider-edit-dialog w-full max-w-lg max-h-[90vh] overflow-hidden rounded-lg shadow-xl border flex flex-col"
      >
        <header class="h-14 px-5 border-b flex items-center shrink-0">
          <h2 class="text-[16px] font-medium flex-1">编辑模型供应商</h2>
          <button type="button" class="provider-edit-close" title="关闭" @click="close">
            <X class="w-5 h-5" />
          </button>
        </header>

        <div class="p-5 overflow-y-auto custom-scrollbar space-y-5">
          <section class="space-y-4">
            <div class="text-[14px] font-medium provider-edit-title">基本信息</div>

            <label class="provider-edit-field text-[13px]">
              <span class="provider-edit-label">名称</span>
              <input v-model="draft.name" type="text" class="provider-edit-input" />
            </label>

            <div class="provider-edit-field">
              <div class="provider-edit-label text-[13px]">图标</div>
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
                  class="provider-edit-avatar-upload relative w-14 h-14 rounded-md overflow-hidden"
                  :disabled="uploading"
                  title="上传图标"
                  @click="iconInput?.click()"
                >
                  <ProviderAvatar
                    v-if="draft.icon"
                    :provider-id="draft.id"
                    :provider-name="draft.name || 'Provider'"
                    :icon="draft.icon"
                    class="provider-edit-current-icon w-full h-full"
                  />
                  <span
                    class="provider-edit-avatar-overlay absolute inset-0 flex items-center justify-center"
                    :class="{ 'provider-edit-avatar-overlay--empty': !draft.icon }"
                  >
                    <Upload class="w-5 h-5" />
                  </span>
                </button>
              </div>
            </div>
          </section>

          <section class="space-y-4">
            <div class="text-[14px] font-medium provider-edit-title">连接配置</div>

            <div class="provider-edit-field">
              <div class="provider-edit-label text-[13px]">API Type</div>
              <div class="flex flex-col sm:flex-row gap-2">
                <label
                  v-for="opt in PROVIDER_API_TYPES"
                  :key="opt.value"
                  class="flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer text-[13px] transition-colors"
                  :class="
                    draft.apiType === opt.value
                      ? 'provider-edit-radio provider-edit-radio--active'
                      : 'provider-edit-radio provider-edit-radio--idle'
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

            <label class="provider-edit-field text-[13px]">
              <span class="provider-edit-label">Base URL</span>
              <input
                v-model="baseUrlInput"
                type="text"
                placeholder="留空使用默认端点"
                class="provider-edit-input font-mono"
              />
            </label>

            <label class="provider-edit-field text-[13px]">
              <span class="provider-edit-label">API Key</span>
              <span class="relative block min-w-0">
                <input
                  v-model="apiKeyInput"
                  :type="showApiKey ? 'text' : 'password'"
                  placeholder="留空则保留已有 API Key"
                  autocomplete="new-password"
                  spellcheck="false"
                  class="provider-edit-input font-mono pr-10"
                />
                <button
                  type="button"
                  class="provider-edit-secret-toggle absolute inset-y-0 right-0 w-10 flex items-center justify-center"
                  :title="showApiKey ? '隐藏 API Key' : '显示 API Key'"
                  @click.prevent="showApiKey = !showApiKey"
                >
                  <EyeOff v-if="showApiKey" class="w-4 h-4" />
                  <Eye v-else class="w-4 h-4" />
                </button>
              </span>
            </label>
          </section>
        </div>

        <footer class="px-5 py-3 border-t flex justify-end gap-2 shrink-0">
          <button type="button" class="wechat-btn wechat-btn--secondary" @click="close">
            取消
          </button>
          <button
            type="button"
            class="wechat-btn wechat-btn--primary"
            :disabled="!canSave || saving"
            @click="save"
          >
            保存
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Eye, EyeOff, Upload, X } from "lucide-vue-next";
import ProviderAvatar from "./ProviderAvatar.vue";
import { PROVIDER_API_TYPES } from "@/constants/providers";
import { useProviderStore } from "@/store";
import { providerToUI } from "@/utils/provider-ui";
import { uploadIcon } from "@/api";
import type { UIProvider } from "@/types/ui";

const props = defineProps<{ open: boolean; providerId: string }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const providerStore = useProviderStore();
const saving = ref(false);
const uploading = ref(false);
const iconInput = ref<HTMLInputElement | null>(null);
const apiKeyInput = ref("");
const showApiKey = ref(false);

const draft = ref<Pick<UIProvider, "id" | "name" | "icon" | "apiType" | "baseUrl">>({
  id: "",
  name: "",
  icon: null,
  apiType: "openai-compatible",
  baseUrl: null,
});

const provider = computed(() => providerStore.getProviderById(props.providerId));

const baseUrlInput = computed({
  get: () => draft.value.baseUrl ?? "",
  set: (v: string) => {
    draft.value.baseUrl = v.trim() ? v.trim() : null;
  },
});

const canSave = computed(() => Boolean(draft.value.name.trim()));

watch(
  () => [props.open, props.providerId] as const,
  ([open, id]) => {
    if (!open || !id) return;
    const p = providerStore.getProviderById(id);
    if (!p) {
      void providerStore.fetchProvider(id).then(() => {
        const loaded = providerStore.getProviderById(id);
        if (loaded) applyDraft(loaded);
      });
      return;
    }
    applyDraft(p);
  },
  { immediate: true },
);

function applyDraft(p: NonNullable<ReturnType<typeof providerStore.getProviderById>>) {
  const ui = providerToUI(p, providerStore.models[p.id] ?? []);
  draft.value = {
    id: ui.id,
    name: ui.name,
    icon: ui.icon,
    apiType: ui.apiType,
    baseUrl: ui.baseUrl,
  };
  apiKeyInput.value = "";
  showApiKey.value = false;
}

async function onIconSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    draft.value.icon = (await uploadIcon(file)).path;
  } finally {
    uploading.value = false;
    input.value = "";
  }
}

function close() {
  if (!saving.value) emit("close");
}

async function save() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  try {
    const patch: import("@/api").UpdateProviderRequest = {
      name: draft.value.name.trim(),
      icon: draft.value.icon,
      apiType: draft.value.apiType,
      baseUrl: draft.value.baseUrl,
    };
    if (apiKeyInput.value.trim()) patch.apiKey = apiKeyInput.value.trim();
    await providerStore.updateProvider(draft.value.id, patch);
    emit("saved");
    emit("close");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.provider-edit-overlay {
  background: rgb(0 0 0 / 42%);
}

.provider-edit-dialog {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
  color: var(--app-text-primary);
}

.provider-edit-dialog header,
.provider-edit-dialog footer {
  background: var(--app-settings-card);
  border-color: var(--app-border);
}

.provider-edit-close {
  padding: 6px;
  border-radius: 6px;
  color: var(--app-text-secondary);
}

.provider-edit-close:hover {
  background: var(--app-hover);
}

.provider-edit-title {
  color: var(--app-text-primary);
}

.provider-edit-label {
  color: var(--app-text-secondary);
}

.provider-edit-field {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.provider-edit-input {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  outline: none;
}

.provider-edit-input:focus {
  border-color: #07c160;
  box-shadow: 0 0 0 2px rgb(7 193 96 / 12%);
}

.provider-edit-secret-toggle {
  color: var(--app-text-secondary);
}

.provider-edit-secret-toggle:hover {
  color: var(--app-text-primary);
}

.provider-edit-radio--active {
  border-color: var(--app-accent);
  background: color-mix(in srgb, var(--app-accent) 14%, transparent);
  color: var(--app-text-primary);
}

.provider-edit-radio--idle {
  border-color: var(--app-border);
  color: var(--app-text-secondary);
}

.provider-edit-radio--idle:hover {
  background: var(--app-hover);
}

.provider-edit-avatar-upload {
  border: 1px solid var(--app-border);
  background: var(--app-settings-bg);
}

.provider-edit-current-icon {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.provider-edit-current-icon :deep(.provider-avatar__img) {
  width: 30px;
  height: 30px;
}

.provider-edit-avatar-overlay {
  background: rgb(0 0 0 / 52%);
  color: #ffffff;
  opacity: 0;
  transition: opacity 150ms ease;
}

.provider-edit-avatar-overlay--empty {
  background: transparent;
  color: var(--app-text-secondary);
  opacity: 1;
}

.provider-edit-avatar-upload:hover .provider-edit-avatar-overlay--empty,
.provider-edit-avatar-upload:focus-visible .provider-edit-avatar-overlay--empty {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.provider-edit-avatar-upload:hover .provider-edit-avatar-overlay,
.provider-edit-avatar-upload:focus-visible .provider-edit-avatar-overlay {
  opacity: 1;
}

.wechat-btn {
  min-width: 72px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
}

.wechat-btn--secondary {
  border: 1px solid var(--app-border);
  background: var(--app-settings-card);
  color: var(--app-text-primary);
}

.wechat-btn--secondary:hover {
  background: var(--app-hover);
}

.wechat-btn--primary {
  border: 1px solid #07c160;
  background: #07c160;
  color: #ffffff;
}

.wechat-btn--primary:hover {
  background: #06ad56;
  border-color: #06ad56;
}

.wechat-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 767px) {
  .provider-edit-field {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
}
</style>
