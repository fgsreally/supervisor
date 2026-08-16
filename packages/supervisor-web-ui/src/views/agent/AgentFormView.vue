<template>
  <div class="agent-form-view flex flex-col flex-1 min-w-0 basis-0 h-full w-full overflow-hidden">
    <div
      class="agent-form-header h-14 md:h-16 border-b flex items-center px-3 md:px-6 shrink-0 gap-3"
    >
      <button
        v-if="showBack"
        type="button"
        class="mr-1 p-1.5 rounded-md agent-form-back-btn"
        @click="emit('cancel')"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>
      <div class="flex-1 min-w-0">
        <div class="text-[16px] font-medium agent-form-title">{{ t("agent.add") }}</div>
      </div>
      <button
        type="button"
        class="agent-form-cancel-btn shrink-0 px-3 py-1.5 rounded-md border text-[13px]"
        @click="emit('cancel')"
      >
        {{ t("common.cancel") }}
      </button>
      <UiActionButton :disabled="!canSave" :loading="saving" @click="save">{{ t("agent.create") }}</UiActionButton>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
      <section class="agent-form-card mx-auto max-w-xl rounded-lg p-4 space-y-4">
        <div class="flex items-center gap-3">
          <AgentAvatar
            agent-id="native"
            :agent-name="draft.name || 'Agent'"
            :icon="avatarPreview"
            class="w-12 h-12 text-lg"
          />
          <label class="block flex-1 text-[13px]">
            <span class="agent-form-label mb-1 block">{{ t("agent.avatar") }}</span>
            <div class="flex gap-2">
              <input
                v-model="draft.icon"
                type="text"
                :placeholder="t('agent.avatarPlaceholder')"
                class="agent-form-input flex-1 min-w-0 px-3 py-2 rounded-md"
              />
              <input
                ref="iconInput"
                type="file"
                accept="image/*,.svg"
                class="hidden"
                @change="onIconSelected"
              />
              <button
                type="button"
                class="agent-form-upload"
                :disabled="uploading"
                :title="t('agent.uploadAvatar')"
                @click="iconInput?.click()"
              >
                <Upload class="w-4 h-4" />
              </button>
            </div>
          </label>
        </div>
        <label class="block text-[13px]">
          <span class="agent-form-label mb-1 block">{{ t("agent.name") }}</span>
          <input
            v-model="draft.name"
            type="text"
            :placeholder="t('agent.namePlaceholder')"
            class="agent-form-input w-full px-3 py-2 rounded-md"
          />
        </label>

        <label class="block text-[13px]">
          <span class="agent-form-label mb-1 block">{{ t("agent.description") }}</span>
          <textarea
            v-model="draft.description"
            rows="2"
            class="agent-form-input w-full px-3 py-2 rounded-md resize-y min-h-[4rem]"
          />
        </label>

        <label class="block text-[13px]">
          <span class="agent-form-label mb-1 block">{{ t("agent.model") }}</span>
          <ModelTreeSelect
            v-model="draft.modelId"
            :groups="modelGroups"
            :placeholder="t('agent.configureLater')"
            @change="onModelChange"
          />
        </label>

        <AgentPermissionEditor v-model="draft.permissionRules" />
        <section class="text-[13px]">
          <div class="agent-form-label mb-2">{{ t("agent.defaultSubagents") }}</div>
          <div v-if="subagentCandidates.length" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label
              v-for="agent in subagentCandidates"
              :key="agent.id"
              class="agent-form-subagent flex items-center gap-2.5 rounded-md border px-3 py-2.5"
            >
              <input v-model="draft.subagentIds" type="checkbox" :value="Number(agent.id)" />
              <AgentAvatar
                :agent-id="agent.id"
                :agent-name="agent.name"
                :icon="agent.avatar"
                class="h-7 w-7"
              />
              <span class="min-w-0 truncate">{{ agent.name }}</span>
            </label>
          </div>
          <div v-else class="agent-form-hint">{{ t("agent.noSubagents") }}</div>
        </section>
      </section>

      <p class="mx-auto mt-4 max-w-xl text-[12px] agent-form-hint leading-relaxed">
        <span class="block">{{ t("agent.resourceLinkHint") }}</span>
        <span class="mt-1 block"
          >{{ t("agent.globalResourcePath") }}<code class="font-mono">~/.pi/supervisor/global/</code></span
        >
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronLeft, Upload } from "lucide-vue-next";
import {
  DEFAULT_AGENT_PERMISSION_RULES,
  uploadIcon,
  type AgentPermissionRules,
  type ToolsPreset,
} from "@/api";
import { useAgentStore, useProviderStore } from "@/store";
import { providerToUI } from "@/utils/provider-ui";
import AgentAvatar from "../../components/agent/AgentAvatar.vue";
import ModelTreeSelect, { type ModelTreeGroup } from "../../components/provider/ModelTreeSelect.vue";
import AgentPermissionEditor from "../../components/agent/AgentPermissionEditor.vue";
import UiActionButton from "../../components/base/UiActionButton.vue";
import { showUiMessage } from "@/composables/use-ui-message";
import { useI18n } from "@/i18n";

defineProps<{ showBack?: boolean }>();
const { t } = useI18n();

const emit = defineEmits<{ cancel: []; saved: [id: string] }>();

const agentStore = useAgentStore();
const providerStore = useProviderStore();
const saving = ref(false);
const uploading = ref(false);
const iconInput = ref<HTMLInputElement | null>(null);

const draft = ref({
  name: "",
  description: "",
  icon: "",
  providerId: "",
  modelId: "",
  toolsPreset: "coding" as ToolsPreset,
  permissionRules: structuredClone(DEFAULT_AGENT_PERMISSION_RULES) as AgentPermissionRules,
  subagentIds: [] as number[],
});

const subagentCandidates = computed(() => agentStore.agents);
const avatarPreview = computed(() => {
  const value = draft.value.icon.trim();
  return /^(https?:\/\/|\/)/i.test(value) ? value : null;
});

const providerOptions = computed(() =>
  providerStore.providers
    .filter((provider) => provider.isEnabled)
    .map((p) => providerToUI(p, providerStore.models[p.id] ?? [])),
);

const modelGroups = computed<ModelTreeGroup[]>(() =>
  providerOptions.value.map((provider) => ({
    id: provider.id,
    name: provider.name,
    icon: provider.icon,
    models: provider.models.map((model) => ({ value: model.id, name: model.name })),
  })),
);

watch(
  providerOptions,
  (list) => {
    if (!draft.value.providerId && list[0]) {
      draft.value.providerId = list[0].id;
      draft.value.modelId = list[0].models[0]?.id || "";
    }
  },
  { immediate: true },
);

watch(
  () => providerStore.providers.map((provider) => provider.id),
  (providerIds) => {
    for (const providerId of providerIds) {
      if (!providerStore.models[providerId]) void providerStore.fetchModels(providerId);
    }
  },
  { immediate: true },
);

const canSave = computed(() => {
  if (!draft.value.name.trim()) return false;
  const avatar = draft.value.icon.trim();
  if (avatar && !/^(https?:\/\/|\/)/i.test(avatar)) return false;
  return true;
});

function onModelChange(modelId: string) {
  draft.value.providerId =
    modelGroups.value.find((group) => group.models.some((model) => model.value === modelId))?.id ??
    "";
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

async function save() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  try {
    const agent = await agentStore.createAgent({
      name: draft.value.name.trim(),
      description: draft.value.description.trim() || undefined,
      avatar: draft.value.icon.trim() || null,
      backendType: "native",
      modelId: draft.value.modelId || undefined,
      toolsPreset: draft.value.toolsPreset,
      permissionRules: draft.value.permissionRules,
      meta: { subagentIds: draft.value.subagentIds },
    });
    showUiMessage(t("agent.createSuccess"), "success");
    emit("saved", agent.id);
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("agent.createFailed"), "error");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.agent-form-view {
  background: var(--app-settings-bg);
}

.agent-form-header {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
}

.agent-form-back-btn {
  color: var(--app-text-secondary);
}

.agent-form-back-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.agent-form-title {
  color: var(--app-text-primary);
}

.agent-form-cancel-btn {
  border-color: var(--app-btn-secondary-border);
  color: var(--app-btn-secondary-text);
  background: transparent;
}

.agent-form-cancel-btn:hover {
  background: var(--app-btn-secondary-hover-bg);
  color: var(--app-text-primary);
}

.agent-form-card {
  background: var(--app-settings-card);
}

.agent-form-label {
  color: var(--app-text-secondary);
}

.agent-form-input {
  border: 1px solid var(--app-border);
  background: var(--app-settings-bg);
  color: var(--app-text-primary);
}

.agent-form-hint {
  color: var(--app-text-muted);
}

.agent-form-subagent {
  border-color: var(--app-border);
  color: var(--app-text-primary);
}
.agent-form-subagent:hover {
  background: var(--app-hover);
}

.agent-form-upload {
  flex: none;
  width: 38px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-secondary);
  background: var(--app-settings-bg);
}

.agent-form-upload:hover:not(:disabled) {
  border-color: #07c160;
  color: #07c160;
}
</style>
