<template>
  <Teleport to="body">
    <div
      v-if="open && provider"
      class="provider-edit-overlay"
      @click.self="close"
    >
      <section
        class="provider-edit-dialog"
      >
        <header class="provider-edit-dialog__header">
          <h2 class="provider-edit-dialog__title">编辑模型供应商</h2>
          <button type="button" class="provider-edit-close" title="关闭" @click="close">
            <X class="provider-edit-dialog__icon" />
          </button>
        </header>

        <div class="provider-edit-dialog__body custom-scrollbar">
          <section class="provider-edit-dialog__section">
            <div class="provider-edit-title">基本信息</div>

            <label class="provider-edit-field">
              <span class="provider-edit-label">名称</span>
              <UiField v-model="draft.name" type="text" />
            </label>

            <div class="provider-edit-field">
              <div class="provider-edit-label text-[13px]">图标</div>
              <div class="provider-edit-icon-row">
                <input
                  ref="iconInput"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  class="provider-edit-hidden-input"
                  @change="onIconSelected"
                />
                <button
                  type="button"
                  class="provider-edit-avatar-upload"
                  :disabled="uploading"
                  title="上传图标"
                  @click="iconInput?.click()"
                >
                  <ProviderAvatar
                    v-if="draft.icon"
                    :provider-id="draft.id"
                    :provider-name="draft.name || 'Provider'"
                    :icon="draft.icon"
                    class="provider-edit-current-icon"
                  />
                  <span
                    class="provider-edit-avatar-overlay"
                    :class="{ 'provider-edit-avatar-overlay--empty': !draft.icon }"
                  >
                    <Upload class="provider-edit-dialog__icon" />
                  </span>
                </button>
              </div>
            </div>
          </section>

          <section class="provider-edit-dialog__section">
            <div class="provider-edit-title">连接配置</div>

            <div class="provider-edit-field">
              <div class="provider-edit-label text-[13px]">API Type</div>
              <div class="provider-edit-protocols">
                <label
                  v-for="opt in WIRE_PROTOCOLS"
                  :key="opt.value"
                  class="provider-edit-radio"
                  :class="
                    draft.protocol === opt.value
                      ? 'provider-edit-radio provider-edit-radio--active'
                      : 'provider-edit-radio provider-edit-radio--idle'
                  "
                >
                  <input
                    v-model="draft.protocol"
                    type="radio"
                    :value="opt.value"
                    class="provider-edit-radio-input"
                  />
                  <span class="provider-edit-mono">{{ opt.value }}</span>
                </label>
              </div>
            </div>

            <label class="provider-edit-field">
              <span class="provider-edit-label">Base URL</span>
              <UiField
                v-model="baseUrlInput"
                type="text"
                placeholder="留空使用默认端点"
                class="provider-edit-mono-field"
              />
            </label>

            <label class="provider-edit-field">
              <span class="provider-edit-label">API Key</span>
              <span class="provider-edit-secret-field">
                <UiField
                  v-model="apiKeyInput"
                  :type="showApiKey ? 'text' : 'password'"
                  placeholder="留空则保留已有 API Key"
                  autocomplete="new-password"
                  spellcheck="false"
                  class="provider-edit-mono-field provider-edit-secret-input"
                />
                <button
                  type="button"
                  class="provider-edit-secret-toggle"
                  :title="showApiKey ? '隐藏 API Key' : '显示 API Key'"
                  @click.prevent="showApiKey = !showApiKey"
                >
                  <EyeOff v-if="showApiKey" class="provider-edit-small-icon" />
                  <Eye v-else class="provider-edit-small-icon" />
                </button>
              </span>
            </label>
          </section>
        </div>

        <footer class="provider-edit-dialog__footer">
          <UiActionButton variant="secondary" @click="close"> 取消 </UiActionButton>
          <UiActionButton variant="primary" :disabled="!canSave || saving" @click="save"> 保存 </UiActionButton>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Eye, EyeOff, Upload, X } from "lucide-vue-next";
import ProviderAvatar from "@/components/provider/ProviderAvatar.vue";
import { UiActionButton, UiField } from "@/components/base";
import { WIRE_PROTOCOLS } from "@/constants/providers";
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

const draft = ref<Pick<UIProvider, "id" | "name" | "icon" | "protocol" | "baseUrl">>({
  id: "",
  name: "",
  icon: null,
  protocol: "chat-completions",
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
    protocol: ui.protocol,
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
      protocol: draft.value.protocol,
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
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgb(0 0 0 / 42%);
}

.provider-edit-dialog {
  display: flex;
  width: 100%;
  max-width: 32rem;
  max-height: 90vh;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-panel);
  box-shadow: var(--app-shadow-floating);
  background: var(--app-settings-bg);
  border-color: var(--app-border);
  color: var(--app-text-primary);
}

.provider-edit-dialog__header,
.provider-edit-dialog__footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-settings-card);
}

.provider-edit-dialog__title {
  flex: 1;
  font-size: var(--app-font-body-strong);
  font-weight: var(--app-font-weight-medium);
}

.provider-edit-dialog__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.provider-edit-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  overflow-y: auto;
  padding: 1.25rem;
}

.provider-edit-dialog__section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.provider-edit-icon-row,
.provider-edit-protocols {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--app-space-2);
}

.provider-edit-protocols {
  flex-direction: column;
  align-items: stretch;
}

.provider-edit-hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.provider-edit-mono,
.provider-edit-mono-field {
  font-family: var(--app-font-mono);
}

.provider-edit-radio {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-control);
  cursor: pointer;
  font-size: var(--app-font-control);
  transition: background-color var(--app-motion-fast), border-color var(--app-motion-fast);
}

.provider-edit-radio-input {
  accent-color: var(--app-accent);
}

.provider-edit-secret-field {
  position: relative;
  display: block;
  min-width: 0;
}

.provider-edit-mono-field {
  font-family: var(--app-font-mono);
}

.provider-edit-secret-input {
  padding-right: 2.5rem;
}

.provider-edit-secret-toggle {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  width: 2.5rem;
  align-items: center;
  justify-content: center;
}

.provider-edit-small-icon {
  width: 1rem;
  height: 1rem;
}

.provider-edit-dialog__footer {
  justify-content: flex-end;
  gap: var(--app-space-2);
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
  border-top: 1px solid var(--app-border);
  border-bottom: 0;
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
  position: relative;
  width: 3.5rem;
  height: 3.5rem;
  overflow: hidden;
  border-radius: var(--app-radius-control);
  border: 1px solid var(--app-border);
  background: var(--app-settings-bg);
}

.provider-edit-current-icon {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.provider-edit-current-icon :deep(.provider-avatar__img) {
  width: 30px;
  height: 30px;
}

.provider-edit-avatar-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
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

@media (max-width: 767px) {
  .provider-edit-field {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
}

@media (min-width: 640px) {
  .provider-edit-protocols {
    flex-direction: row;
  }
}
</style>
