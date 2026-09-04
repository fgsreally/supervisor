<template>
  <Teleport to="body">
    <div
      v-if="open && agent"
      class="agent-edit-overlay"
      @click.self="close"
    >
      <section
        class="agent-edit-dialog"
      >
        <header class="agent-edit-header">
          <h2 class="agent-edit-heading">{{ t("agent.editTitle") }}</h2>
          <button type="button" class="agent-edit-close" :title="t('common.close')" @click="close">
            <X class="w-5 h-5" />
          </button>
        </header>

        <div class="agent-edit-body custom-scrollbar">
          <div class="agent-edit-avatar-row">
            <AgentAvatar
              :agent-id="agent.id"
              :agent-name="draft.name || agent.name"
              :icon="draft.icon"
            class="agent-edit-avatar"
            />
            <label class="agent-edit-field agent-edit-field--grow">
              <span class="agent-edit-label">{{ t("agent.avatar") }}</span>
              <div class="agent-edit-inline">
                <UiField v-model="draft.icon" type="text" :placeholder="t('agent.avatarPlaceholder')" />
                <input
                  ref="iconInput"
                  type="file"
                  accept="image/*,.svg"
                  class="hidden"
                  @change="onIconSelected"
                />
                <button
                  type="button"
                  class="agent-edit-upload"
                  :disabled="uploading"
                  :title="t('agent.uploadAvatar')"
                  @click="iconInput?.click()"
                >
                  <Upload class="w-4 h-4" />
                </button>
              </div>
            </label>
          </div>

          <label class="agent-edit-field">
            <span class="agent-edit-label">{{ t("agent.name") }}</span>
            <UiField v-model="draft.name" type="text" />
          </label>

          <label class="agent-edit-field">
            <span class="agent-edit-label">{{ t("agent.description") }}</span>
            <UiField v-model="draft.description" as="textarea" rows="3" class="resize-y" />
          </label>

          <template v-if="agent.backendType === 'native'">
            <label class="agent-edit-field">
              <span class="agent-edit-label">{{ t("agent.model") }}</span>
              <ModelTreeSelect
                v-model="draft.modelId"
                :groups="modelGroups"
                :placeholder="t('agent.configureLater')"
                @change="onModelChange"
              />
            </label>
            <label class="agent-edit-field">
              <span class="agent-edit-label">{{ t("agent.toolset") }}</span>
              <UiField v-model="draft.toolsPreset" as="select">
                <option value="coding">coding</option>
                <option value="readonly">readonly</option>
                <option value="none">none</option>
              </UiField>
            </label>
            <AgentPermissionEditor v-model="draft.permissionRules" />
            <section class="agent-edit-subagents">
              <div class="agent-edit-label agent-edit-subagents-title">{{ t("agent.defaultSubagents") }}</div>
              <div v-if="subagentCandidates.length" class="agent-edit-subagent-list">
                <label
                  v-for="child in subagentCandidates"
                  :key="child.id"
                  class="agent-edit-subagent"
                >
                  <input v-model="draft.subagentIds" type="checkbox" :value="Number(child.id)" />
                  <span>{{ child.name }}</span>
                </label>
              </div>
              <div v-else class="agent-edit-label">{{ t("agent.noSubagents") }}</div>
            </section>
          </template>

          <template v-else>
            <label class="agent-edit-field">
              <span class="agent-edit-label">{{ t("agent.command") }}</span>
              <UiField v-model="draft.command" type="text" class="font-mono" />
            </label>
            <label class="agent-edit-field">
              <span class="agent-edit-label">{{ t("agent.arguments") }}</span>
              <UiField
                v-model="draft.args"
                as="textarea"
                rows="5"
                class="font-mono resize-y"
                :placeholder="t('agent.argumentsPlaceholder')"
              />
            </label>
          </template>
        </div>

        <footer class="agent-edit-footer">
          <UiActionButton variant="secondary" @click="close">{{ t("common.cancel") }}</UiActionButton>
          <UiActionButton :disabled="!canSave" :loading="saving" @click="save">
            {{ t("agent.save") }}
          </UiActionButton>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Upload, X } from "lucide-vue-next";
import { uploadIcon, type AgentPermissionRules, type ToolsPreset } from "@/api";
import { useAgentStore, useProviderStore } from "@/store";
import { providerToUI } from "@/utils/provider-ui";
import AgentAvatar from "@/components/agent/AgentAvatar.vue";
import ModelTreeSelect, { type ModelTreeGroup } from "@/components/provider/ModelTreeSelect.vue";
import AgentPermissionEditor from "@/components/agent/AgentPermissionEditor.vue";
import { UiActionButton, UiField } from "@/components/base";
import { useI18n } from "@/i18n";

const props = defineProps<{ open: boolean; agentId: string }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const agentStore = useAgentStore();
const providerStore = useProviderStore();
const { t } = useI18n();
const saving = ref(false);
const uploading = ref(false);
const iconInput = ref<HTMLInputElement | null>(null);
const draft = reactive({
  name: "",
  description: "",
  icon: "",
  providerId: "",
  modelId: "",
  toolsPreset: "coding" as ToolsPreset,
  command: "",
  args: "",
  permissionRules: {} as AgentPermissionRules,
  subagentIds: [] as number[],
});

const agent = computed(() => agentStore.getAgentById(props.agentId));
const subagentCandidates = computed(() =>
  agentStore.agents.filter((candidate) => candidate.id !== props.agentId),
);
const providers = computed(() =>
  providerStore.providers.map((provider) =>
    providerToUI(provider, providerStore.models[provider.id] ?? []),
  ),
);
const modelGroups = computed<ModelTreeGroup[]>(() =>
  providers.value
    .filter((provider) => provider.isEnabled)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      icon: provider.icon,
      models: provider.models.map((model) => ({ value: model.id, name: model.name })),
    })),
);
const canSave = computed(() =>
  Boolean(draft.name.trim() && (agent.value?.backendType === "native" || draft.command.trim())),
);

watch(
  () => [props.open, agent.value] as const,
  ([open, value]) => {
    if (!open || !value) return;
    const legacy = value.meta.external as { command?: string; args?: string[] } | undefined;
    const command =
      value.externalConfig?.command ??
      (typeof value.meta.command === "string" ? value.meta.command : legacy?.command);
    const args =
      value.externalConfig?.args ??
      (Array.isArray(value.meta.args) ? value.meta.args : legacy?.args);
    Object.assign(draft, {
      name: value.name,
      description: value.description ?? "",
      icon: value.avatar ?? "",
      providerId: value.providerId ?? "",
      modelId: value.modelId ?? "",
      toolsPreset: value.toolsPreset ?? "coding",
      command: command ?? "",
      args: (args ?? []).join("\n"),
      permissionRules: structuredClone(value.permissionRules ?? {}),
      subagentIds: Array.isArray(value.meta.subagentIds)
        ? value.meta.subagentIds.filter((id): id is number => Number.isSafeInteger(id))
        : [],
    });
  },
  { immediate: true },
);

function onModelChange(modelId: string) {
  draft.providerId =
    modelGroups.value.find((group) => group.models.some((model) => model.value === modelId))?.id ??
    "";
}

function close() {
  if (!saving.value) emit("close");
}

async function onIconSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    draft.icon = (await uploadIcon(file)).path;
  } finally {
    uploading.value = false;
    input.value = "";
  }
}

async function save() {
  const value = agent.value;
  if (!value || !canSave.value || saving.value) return;
  saving.value = true;
  try {
    const args =
      value.backendType === "native"
        ? undefined
        : draft.args
            .split(/\r?\n/)
            .map((arg) => arg.trim())
            .filter(Boolean);
    await agentStore.updateAgent(value.id, {
      name: draft.name.trim(),
      description: draft.description.trim(),
      avatar: draft.icon.trim() || null,
      modelId: value.backendType === "native" ? draft.modelId || null : undefined,
      toolsPreset: value.backendType === "native" ? draft.toolsPreset : undefined,
      permissionRules: value.backendType === "native" ? draft.permissionRules : undefined,
      externalConfig:
        value.backendType === "native"
          ? undefined
          : {
              ...(value.externalConfig ?? {}),
              command: draft.command.trim(),
              args,
            },
      meta: value.backendType === "native" ? { subagentIds: draft.subagentIds } : undefined,
    });
    emit("saved");
    emit("close");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.agent-edit-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgb(0 0 0 / 42%);
}

.agent-edit-dialog {
  display: flex;
  width: 100%;
  max-width: 36rem;
  max-height: 90vh;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 0.5rem;
  box-shadow: var(--app-shadow-lg, 0 20px 25px -5px rgb(0 0 0 / 10%));
  background: var(--app-settings-bg);
  color: var(--app-text-primary);
}

.agent-edit-dialog header,
.agent-edit-dialog footer {
  background: var(--app-settings-card);
  border-color: var(--app-border);
}

.agent-edit-header {
  display: flex;
  height: 3.5rem;
  flex-shrink: 0;
  align-items: center;
  gap: var(--app-space-2);
  padding: 0 1.25rem;
  border-bottom: 1px solid var(--app-border);
}

.agent-edit-heading {
  flex: 1;
  font-size: var(--app-font-title);
  font-weight: var(--app-font-weight-medium);
}

.agent-edit-body {
  display: grid;
  gap: var(--app-space-4);
  overflow-y: auto;
  padding: 1.25rem;
}

.agent-edit-avatar-row,
.agent-edit-inline {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
}

.agent-edit-avatar-row { padding-bottom: 0.25rem; }
.agent-edit-avatar { width: 3rem; height: 3rem; font-size: var(--app-font-body); }
.agent-edit-inline { gap: var(--app-space-2); }
.agent-edit-field { display: block; font-size: var(--app-font-body); }
.agent-edit-field--grow { flex: 1; }
.agent-edit-label { display: block; margin-bottom: 0.25rem; color: var(--app-text-secondary); }
.agent-edit-subagents-title { margin-bottom: 0.5rem; }
.agent-edit-subagent-list { display: grid; gap: var(--app-space-2); }
.agent-edit-subagent { display: flex; align-items: center; gap: var(--app-space-2); }
.agent-edit-footer {
  display: flex;
  flex-shrink: 0;
  justify-content: flex-end;
  gap: var(--app-space-2);
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--app-border);
}

.agent-edit-close {
  padding: 6px;
  border-radius: 6px;
  color: var(--app-text-secondary);
}

.agent-edit-close:hover {
  background: var(--app-hover);
}

.agent-edit-label {
  color: var(--app-text-secondary);
}

.agent-edit-upload {
  flex: none;
  width: 38px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-secondary);
  background: var(--app-settings-card);
}

.agent-edit-upload:hover:not(:disabled) {
  border-color: var(--app-accent);
  color: var(--app-accent);
}
</style>
