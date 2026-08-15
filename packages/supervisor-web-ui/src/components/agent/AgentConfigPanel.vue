<template>
  <div v-if="agent" class="agent-config mx-auto w-full max-w-[1040px]">
    <div v-if="loading" class="agent-config-loading">
      <Loader2 class="h-4 w-4 animate-spin" />
      {{ t("agent.loadingConfig") }}
    </div>
    <template v-else>
      <section class="agent-config-section">
        <div class="agent-config-section__title">
          <div>
            <h3>{{ t("agent.basicConfig") }}</h3>
            <p>{{ t("agent.identitySettings") }}</p>
          </div>
        </div>
        <dl class="agent-config-list">
          <div class="agent-config-row">
            <dt>{{ t("agent.name") }}</dt>
            <dd>{{ agent.name }}</dd>
          </div>
          <div class="agent-config-row">
            <dt>{{ t("agent.description") }}</dt>
            <dd>{{ agent.description || "-" }}</dd>
          </div>
          <div class="agent-config-row">
            <dt>{{ t("agent.model") }}</dt>
            <dd>
              <ModelTreeSelect
                class="agent-model-select"
                :model-value="agent.modelId || ''"
                :groups="modelGroups"
                :disabled="savingModel"
                :placeholder="t('agent.configureLater')"
                @change="changeModel"
              />
            </dd>
          </div>
          <div class="agent-config-row">
            <dt>{{ t("agent.homeDirectory") }}</dt>
            <dd class="font-mono text-[12px] break-all">{{ homeDir || "-" }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="resolvedTools.length" class="agent-config-section agent-tools-section">
        <div class="agent-tools-header">
          <div>
            <div class="agent-tools-title">{{ t("agent.availableTools") }}</div>
            <p>{{ t("agent.toolsDescription") }}</p>
          </div>
          <span>{{ t("agent.itemCount", { count: resolvedTools.length }) }}</span>
        </div>
        <div class="agent-tools-list">
          <div v-for="tool in resolvedTools" :key="tool.name" class="agent-tool-row">
            <div class="agent-tool-icon">
              <Puzzle v-if="tool.source === 'extension'" class="h-4 w-4" />
              <ShieldCheck v-else-if="tool.source === 'system'" class="h-4 w-4" />
              <Wrench v-else class="h-4 w-4" />
            </div>
            <div class="agent-tool-main">
              <div class="agent-tool-heading">
                <span class="font-mono text-[12px]">{{ tool.name }}</span>
                <span class="agent-config-tool-source">{{ sourceLabel(tool) }}</span>
              </div>
              <p>{{ tool.description || t("agent.toolDescriptionMissing") }}</p>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Loader2, Puzzle, ShieldCheck, Wrench } from "lucide-vue-next";
import { useAgentStore, useProviderStore } from "@/store";
import { getDefaultWorkspaceCwd } from "@/config/workspace";
import { showUiMessage } from "@/composables/use-ui-message";
import { useI18n } from "@/i18n";
import type { AgentResources } from "@/api";
import { providerToUI } from "@/utils/provider-ui";
import ModelTreeSelect, { type ModelTreeGroup } from "@/components/provider/ModelTreeSelect.vue";

const props = defineProps<{ agentId: string }>();
const agentStore = useAgentStore();
const providerStore = useProviderStore();
const { t } = useI18n();
const agent = computed(() => agentStore.getAgentById(props.agentId));
const modelGroups = computed<ModelTreeGroup[]>(() =>
  providerStore.providers
    .map((provider) => providerToUI(provider, providerStore.models[provider.id] ?? []))
    .filter((provider) => provider.isEnabled)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      icon: provider.icon,
      models: provider.models.map((model) => ({ value: model.id, name: model.name })),
    })),
);
const homeDir = computed(
  () => agent.value?.homeDir || agentStore.agentResources[props.agentId]?.homeDir || "",
);
const resolvedTools = computed(() => agentStore.agentResources[props.agentId]?.tools ?? []);
const savingModel = ref(false);
const loading = ref(false);

function sourceLabel(tool: AgentResources["tools"][number]): string {
  if (tool.source === "extension") return tool.extensionName || t("agent.extension");
  return tool.source === "preset" ? t("agent.toolset") : t("agent.system");
}

async function changeModel(modelId: string) {
  if (!agent.value || savingModel.value) return;
  const provider = modelGroups.value.find((group) =>
    group.models.some((model) => model.value === modelId),
  );
  if (!provider) return;
  savingModel.value = true;
  try {
    await agentStore.updateAgent(props.agentId, { modelId });
    showUiMessage(t("agent.modelUpdated"), "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("agent.modelUpdateFailed"), "error");
  } finally {
    savingModel.value = false;
  }
}

watch(
  () => props.agentId,
  async (id) => {
    loading.value = true;
    try {
      await agentStore.fetchAgentResources(id, getDefaultWorkspaceCwd());
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.agent-config {
  padding: 2px 0 28px;
}

.agent-config-section {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--app-border-subtle) 84%, transparent);
  border-radius: 12px;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}

.agent-tools-section {
  margin-top: 18px;
}

.agent-config-loading {
  display: flex;
  min-height: 12rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.agent-config-section__title {
  display: flex;
  align-items: center;
  min-height: 64px;
  padding: 13px 20px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.agent-config-section__title h3 {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.agent-config-section__title p {
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 11px;
}

.agent-config-list {
  padding: 0 20px;
}

.agent-config-row {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  min-height: 54px;
  align-items: center;
  gap: 18px;
  padding: 9px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--app-border-subtle) 78%, transparent);
  font-size: 13px;
}
.agent-config-row:last-child {
  border-bottom: 0;
}

.agent-config-row dt,
.agent-config-muted {
  color: var(--app-text-secondary);
}
.agent-config-row dd {
  min-width: 0;
  color: var(--app-text-primary);
  font-weight: 450;
}
.agent-model-select {
  max-width: 560px;
}

.agent-config-tool-source {
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--app-accent) 12%, transparent);
  color: var(--app-accent);
  font-size: 10px;
}

.agent-tools-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 68px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.agent-tools-header p {
  margin-top: 4px;
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 400;
}
.agent-tools-header > span {
  flex: none;
  padding: 4px 8px;
  border-radius: 999px;
  color: var(--app-text-secondary);
  background: color-mix(in srgb, var(--app-hover) 76%, transparent);
  font-size: 11px;
}

.agent-tools-list {
  padding: 0 20px;
}
.agent-tool-row {
  display: flex;
  align-items: center;
  gap: 13px;
  min-height: 72px;
  padding: 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--app-border-subtle) 78%, transparent);
  transition: background-color 0.15s ease;
}
.agent-tool-row:hover {
  background: color-mix(in srgb, var(--app-hover) 44%, transparent);
}
.agent-tool-row:last-child {
  border-bottom: 0;
}
.agent-tool-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border-radius: 9px;
  color: var(--app-accent);
  background: color-mix(in srgb, var(--app-accent) 10%, var(--app-settings-card));
}
.agent-tool-main {
  min-width: 0;
  flex: 1;
}
.agent-tool-heading {
  display: flex;
  align-items: center;
  gap: 7px;
}
.agent-tool-main p {
  margin-top: 3px;
  color: var(--app-text-secondary);
  display: -webkit-box;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@media (max-width: 760px) {
  .agent-config-row {
    grid-template-columns: 86px minmax(0, 1fr);
  }
  .agent-config-list,
  .agent-tools-list {
    padding-inline: 16px;
  }
  .agent-config-section__title,
  .agent-tools-header {
    padding-inline: 16px;
  }
}
</style>
