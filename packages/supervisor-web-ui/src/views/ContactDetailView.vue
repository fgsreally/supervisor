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
            :icon="agent.icon"
            class="w-20 h-20 text-3xl"
          />
          <h2 class="mt-4 text-xl font-medium px-6 text-center contact-detail-title">
            {{ agent.name }}
          </h2>
          <p class="text-sm mt-2 px-6 text-center leading-relaxed contact-detail-subtitle">
            {{ agent.description }}
          </p>
        </div>

        <div class="mt-2 contact-detail-card border-y text-[15px]">
          <button
            v-if="provider"
            type="button"
            class="w-full px-6 py-3.5 border-b flex items-center gap-3 text-left transition-colors contact-detail-provider-row"
            @click="emit('view-provider', provider.id)"
          >
            <ProviderAvatar
              :provider-id="provider.id"
              :provider-name="provider.name"
              :icon="provider.icon"
              class="w-9 h-9 text-sm"
            />
            <div class="flex-1 min-w-0">
              <div class="text-[12px] contact-detail-subtitle">模型服务</div>
              <div class="text-sm truncate contact-detail-title">{{ provider.name }}</div>
              <div class="text-[12px] font-mono truncate mt-0.5 contact-detail-subtitle">
                {{ provider.models.length }} models
              </div>
            </div>
            <ChevronRight class="w-4 h-4 shrink-0 contact-detail-subtitle" />
          </button>
        </div>

        <div v-if="isExternal" class="p-4">
          <ExternalAgentDetails :agent="agent" />
        </div>
        <MobileResourceTabs v-else :agent-id="agentId" class="mt-2" />
      </div>
    </div>

    <!-- PC -->
    <div class="hidden md:flex flex-col h-full min-h-0">
      <div
        class="min-h-[5rem] py-4 border-b flex items-center px-6 shrink-0 gap-4 contact-detail-header"
      >
        <AgentAvatar
          :agent-id="agent.id"
          :agent-name="agent.name"
          :icon="agent.icon"
          class="w-11 h-11 text-lg"
        />
        <div class="flex-1 min-w-0 py-0.5">
          <div class="text-[17px] font-medium truncate leading-snug contact-detail-title">
            {{ agent.name }}
          </div>
          <div class="text-[13px] truncate mt-1 leading-snug contact-detail-subtitle">
            {{ agent.description }}
          </div>
        </div>
        <button v-if="canEdit" type="button" class="wechat-secondary-btn" @click="editOpen = true">
          编辑
        </button>
      </div>

      <div v-if="!isExternal" class="flex border-b shrink-0 contact-detail-tabs">
        <button
          v-for="t in rightTabs"
          :key="t.id"
          type="button"
          class="px-5 py-2.5 text-[13px] transition-colors"
          :class="rightTab === t.id ? 'contact-detail-tab--active' : 'contact-detail-tab--idle'"
          @click="rightTab = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <div v-if="!isExternal" class="flex-1 flex min-h-0 overflow-hidden">
        <template v-if="rightTab === 'config'">
          <div class="flex-1 overflow-auto p-5 min-h-0 contact-detail-content">
            <AgentConfigPanel :agent-id="agentId" />
          </div>
        </template>

        <template v-else-if="rightTab === 'system'">
          <div class="flex-1 overflow-hidden p-5 min-h-0 flex flex-col contact-detail-content">
            <AgentSystemPromptPanel :agent-id="agentId" />
          </div>
        </template>

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
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import AgentConfigPanel from "../components/AgentConfigPanel.vue";
import AgentSystemPromptPanel from "../components/AgentSystemPromptPanel.vue";
import AgentResourceBrowser from "../components/AgentResourceBrowser.vue";
import MobileResourceTabs from "../components/MobileResourceTabs.vue";
import ProviderAvatar from "../components/ProviderAvatar.vue";
import AgentAvatar from "../components/AgentAvatar.vue";
import AgentEditDialog from "../components/AgentEditDialog.vue";
import ExternalAgentDetails from "../components/ExternalAgentDetails.vue";
import { useAgentStore, useProviderStore } from "@/store";
import type { UIResourceKind } from "@/types/ui";
import { providerToUI } from "@/utils/provider-ui";

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

const rightTabs = [
  { id: "config" as const, label: "Config" },
  { id: "system" as const, label: "System Prompt" },
  { id: "skills" as const, label: "Skills" },
  { id: "extensions" as const, label: "Extensions" },
  { id: "prompts" as const, label: "Prompts" },
  { id: "mcp" as const, label: "MCP" },
];

watch(
  () => props.agentId,
  () => {
    rightTab.value = "config";
  },
);

const provider = computed(() => {
  const a = agent.value;
  if (!a?.providerId) return undefined;
  const p = providerStore.getProviderById(a.providerId);
  if (!p) return undefined;
  return providerToUI(p, providerStore.models[p.id] ?? []);
});

const isExternal = computed(() => agent.value?.backendType !== "native");
const canEdit = computed(() => {
  const value = agent.value;
  if (!value) return false;
  return value.backendType !== "native" || value.meta.builtin !== true;
});

function onAgentSaved() {
  void agentStore.fetchAgent(props.agentId);
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
  background: color-mix(in srgb, var(--app-settings-bg) 88%, transparent);
  border-color: var(--app-border);
}

.contact-detail-tab--idle {
  color: var(--app-text-secondary);
}

.contact-detail-tab--idle:hover {
  color: var(--app-text-primary);
  background: color-mix(in srgb, var(--app-hover) 50%, transparent);
}

.contact-detail-tab--active {
  color: var(--app-accent);
  border-bottom: 2px solid var(--app-accent);
  background: var(--app-settings-card);
}

.contact-detail-content {
  background: var(--app-settings-bg);
}

.wechat-secondary-btn {
  padding: 7px 16px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  font-size: 13px;
}

.wechat-secondary-btn:hover {
  background: var(--app-hover);
}
</style>
