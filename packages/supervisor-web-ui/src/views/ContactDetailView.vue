<template>
  <div
    v-if="agent"
    class="contact-detail-view flex flex-col flex-1 min-w-0 basis-0 h-full w-full overflow-hidden"
  >
    <!-- Mobile -->
    <div class="md:hidden flex flex-col h-full">
      <div class="h-14 border-b flex items-center px-3 shrink-0 contact-detail-header">
        <button
          v-if="showBack"
          type="button"
          class="mr-2 p-1.5 rounded-md contact-detail-back-btn"
          @click="$emit('back')"
        >
          <ChevronLeft class="w-5 h-5" />
        </button>
        <div class="font-medium text-[17px] truncate contact-detail-title flex-1">
          {{ agent.name }}
        </div>
        <button v-if="canEdit" type="button" class="wechat-secondary-btn" @click="editOpen = true">
          编辑
        </button>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar">
        <div class="contact-detail-card py-10 flex flex-col items-center border-b">
          <AgentAvatar
            :agent-id="agent.id"
            :agent-name="agent.name"
            :icon="agent.avatar"
            class="w-20 h-20 text-3xl"
          />
          <h2 class="mt-4 text-xl font-medium px-6 text-center contact-detail-title">
            {{ agent.name }}
          </h2>
          <p class="text-sm mt-2 px-6 text-center leading-relaxed contact-detail-subtitle">
            {{ agent.description }}
          </p>
        </div>

        <div v-if="canEdit" class="mt-2 contact-detail-card border-y px-5 py-3 text-[15px]">
          <div class="mb-2 text-[12px] contact-detail-subtitle">模型</div>
          <ModelTreeSelect
            :model-value="agent.modelId || ''"
            :groups="modelGroups"
            :disabled="savingModel"
            placeholder="稍后配置"
            @change="changeModel"
          />
        </div>

        <div v-if="isExternal" class="p-4">
          <ExternalAgentDetails :agent="agent" />
        </div>
        <MobileResourceTabs v-else :agent-id="agentId" class="mt-2" />
      </div>
    </div>

    <!-- PC -->
    <div class="hidden md:flex flex-col h-full min-h-0">
      <div class="min-h-[5rem] border-b flex items-center shrink-0 contact-detail-header">
        <div class="contact-detail-identity">
          <AgentAvatar
            :agent-id="agent.id"
            :agent-name="agent.name"
            :icon="agent.avatar"
            class="contact-detail-avatar"
          />
          <div class="flex-1 min-w-0 py-0.5">
            <div class="text-[17px] font-medium truncate leading-snug contact-detail-title">
              {{ agent.name }}
            </div>
            <div class="text-[13px] truncate mt-1 leading-snug contact-detail-subtitle">
              {{ agent.description }}
            </div>
          </div>
          <button
            v-if="canEdit"
            type="button"
            class="wechat-secondary-btn"
            @click="editOpen = true"
          >
            编辑
          </button>
        </div>
      </div>

      <div v-if="!isExternal" class="flex border-b shrink-0 contact-detail-tabs">
        <button
          v-for="t in rightTabs"
          :key="t.id"
          type="button"
          class="contact-detail-tab text-[13px] transition-colors"
          :class="rightTab === t.id ? 'contact-detail-tab--active' : 'contact-detail-tab--idle'"
          @click="rightTab = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <div v-if="!isExternal" class="flex-1 flex min-h-0 overflow-hidden">
        <template v-if="rightTab === 'config'">
          <div
            class="flex flex-1 justify-center overflow-auto min-h-0 contact-detail-content contact-detail-config-content"
          >
            <AgentConfigPanel :agent-id="agentId" />
          </div>
        </template>

        <template v-else-if="rightTab === 'system'">
          <div
            class="flex-1 overflow-hidden px-8 py-7 xl:px-12 xl:py-10 min-h-0 flex flex-col contact-detail-content"
          >
            <AgentSystemPromptPanel :agent-id="agentId" />
          </div>
        </template>

        <AgentExtensionsPanel
          v-else-if="rightTab === 'extensions'"
          class="flex-1 min-h-0"
          :agent-id="agentId"
        />

        <AgentResourceBrowser v-else class="flex-1 min-h-0" :agent-id="agentId" :kind="rightTab" />
      </div>

      <div v-else class="flex-1 overflow-y-auto custom-scrollbar p-6 contact-detail-content">
        <ExternalAgentDetails :agent="agent" />
      </div>
    </div>

    <AgentEditDialog
      :open="editOpen"
      :agent-id="agentId"
      @close="editOpen = false"
      @saved="onAgentSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronLeft } from "lucide-vue-next";
import AgentConfigPanel from "../components/AgentConfigPanel.vue";
import AgentSystemPromptPanel from "../components/AgentSystemPromptPanel.vue";
import AgentResourceBrowser from "../components/AgentResourceBrowser.vue";
import AgentExtensionsPanel from "../components/AgentExtensionsPanel.vue";
import MobileResourceTabs from "../components/MobileResourceTabs.vue";
import AgentAvatar from "../components/AgentAvatar.vue";
import ModelTreeSelect, { type ModelTreeGroup } from "../components/ModelTreeSelect.vue";
import AgentEditDialog from "../components/AgentEditDialog.vue";
import ExternalAgentDetails from "../components/ExternalAgentDetails.vue";
import { useAgentStore, useProviderStore } from "@/store";
import type { UIResourceKind } from "@/types/ui";
import { providerToUI } from "@/utils/provider-ui";
import { showUiMessage } from "@/composables/use-ui-message";

type AgentTab = "config" | "system" | UIResourceKind;

const props = defineProps<{
  agentId: string;
  showBack?: boolean;
}>();

const emit = defineEmits<{
  "open-chat": [id: string];
  "view-provider": [providerId: string];
  back: [];
}>();

const agentStore = useAgentStore();
const providerStore = useProviderStore();

const agent = computed(() => agentStore.getAgentById(props.agentId) ?? null);

const rightTab = ref<AgentTab>("config");
const editOpen = ref(false);
const savingModel = ref(false);

const rightTabs = computed(() => {
  const tabs: Array<{ id: AgentTab; label: string }> = [
    { id: "config", label: "配置" },
    { id: "system", label: "系统提示" },
    { id: "skills", label: "技能" },
    { id: "extensions", label: "扩展" },
    { id: "prompts", label: "模板" },
    { id: "mcp", label: "MCP" },
  ];
  return tabs;
});

watch(
  () => props.agentId,
  () => {
    rightTab.value = "config";
  },
);

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

const isExternal = computed(() => agent.value?.backendType !== "native");
const canEdit = computed(() => {
  return agent.value?.backendType === "native";
});

function onAgentSaved() {
  void agentStore.fetchAgent(props.agentId);
}

async function changeModel(modelId: string) {
  if (!modelId || savingModel.value) return;
  savingModel.value = true;
  try {
    await agentStore.updateAgent(props.agentId, { modelId });
    showUiMessage("模型已更新", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "模型更新失败", "error");
  } finally {
    savingModel.value = false;
  }
}
</script>

<style scoped>
.contact-detail-view {
  background: var(--app-settings-bg);
}

.contact-detail-header {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
}
.contact-detail-identity {
  display: flex;
  width: 100%;
  min-height: 94px;
  align-items: center;
  gap: 15px;
  padding: 16px 28px;
}
.contact-detail-avatar {
  width: 50px;
  height: 50px;
  border-radius: 11px;
  font-size: 19px;
}

.contact-detail-back-btn {
  color: var(--app-text-secondary);
}

.contact-detail-back-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.contact-detail-title {
  color: var(--app-text-primary);
}

.contact-detail-subtitle {
  color: var(--app-text-secondary);
}

.contact-detail-card {
  background: var(--app-settings-card);
  border-color: var(--app-border-subtle);
}

.contact-detail-provider-row {
  border-color: var(--app-border-subtle);
}

.contact-detail-provider-row:hover {
  background: var(--app-hover);
}

.contact-detail-tabs {
  gap: 26px;
  padding: 0 28px;
  background: var(--app-settings-bg);
  border-color: var(--app-border);
}
.contact-detail-tab {
  position: relative;
  min-height: 48px;
  padding: 0 2px;
  border: 0;
}

.contact-detail-tab--idle {
  color: var(--app-text-secondary);
}

.contact-detail-tab--idle:hover {
  color: var(--app-text-primary);
}

.contact-detail-tab--active {
  color: var(--app-accent);
}
.contact-detail-tab--active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--app-accent);
  content: "";
}

.contact-detail-content {
  background: var(--app-settings-bg);
}
.contact-detail-config-content {
  padding: 26px 28px 42px;
}

.contact-detail-logs {
  margin: 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--app-chat-bg);
  color: var(--app-text-primary);
  max-height: 100%;
  overflow: auto;
}

.wechat-secondary-btn {
  padding: 7px 17px;
  border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--app-hover) 70%, var(--app-settings-card));
  color: var(--app-text-primary);
  font-size: 13px;
}

.wechat-secondary-btn:hover {
  background: var(--app-hover);
}
</style>
