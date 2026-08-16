<template>
  <div class="bg-white border-y border-gray-200/80">
    <div class="flex border-b border-gray-100 overflow-x-auto">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        class="shrink-0 px-4 py-2.5 text-[13px]"
        :class="tab === t.id ? 'text-[#07c160] border-b-2 border-[#07c160]' : 'text-gray-500'"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <div
      v-if="loading && tab !== 'config' && tab !== 'system' && tab !== 'extensions'"
      class="flex min-h-[12rem] items-center justify-center gap-2 text-[13px] text-gray-400"
    >
      <Loader2 class="h-4 w-4 animate-spin" />
      {{ t("resource.loading") }}
    </div>

    <div v-else-if="tab === 'config'" class="px-4 py-4">
      <AgentConfigPanel :agent-id="agentId" />
    </div>

    <div v-else-if="tab === 'system'" class="px-4 py-4">
      <AgentSystemPromptPanel :agent-id="agentId" />
    </div>

    <div v-else-if="tab === 'extensions'" class="min-h-[20rem]">
      <AgentExtensionsPanel :agent-id="agentId" />
    </div>

    <div v-else-if="tab === 'skills'" class="px-4 py-3 space-y-3">
      <div
        v-for="skill in skillItems"
        :key="skill.id"
        class="border border-gray-100 rounded-lg overflow-hidden"
      >
        <div class="px-3 py-2 bg-gray-50 flex items-start gap-2">
          <ResourceListItem :name="skill.name" :path="skill.layer === 'global' ? skill.rootPath : undefined" />
          <ResourceLayerBadge :layer="skill.layer" />
        </div>
        <div class="px-2 py-2 max-h-48 overflow-y-auto custom-scrollbar">
          <SkillFileTree :files="skill.files" :selected-file-id="null" @select="() => undefined" />
        </div>
      </div>
      <div v-if="skillItems.length === 0" class="py-6 text-center text-[13px] text-gray-400">
        {{ t("common.empty") }}
      </div>
    </div>

    <div v-else class="px-4 py-3 space-y-3">
      <div
        v-for="r in fileItems"
        :key="r.id"
        class="border border-gray-100 rounded-lg overflow-hidden"
      >
        <div class="px-3 py-2 bg-gray-50 flex items-start gap-2 min-w-0">
          <ResourceListItem :name="getFileBaseName(r.fileName)" :path="r.layer === 'global' ? r.path : undefined" />
          <ResourceLayerBadge :layer="r.layer" />
        </div>
      </div>
      <div v-if="fileItems.length === 0" class="py-6 text-center text-[13px] text-gray-400">
        {{ t("common.empty") }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Loader2 } from "lucide-vue-next";
import AgentConfigPanel from "../agent/AgentConfigPanel.vue";
import AgentSystemPromptPanel from "../agent/AgentSystemPromptPanel.vue";
import AgentExtensionsPanel from "../agent/AgentExtensionsPanel.vue";
import ResourceListItem from "./ResourceListItem.vue";
import ResourceLayerBadge from "./ResourceLayerBadge.vue";
import SkillFileTree from "./SkillFileTree.vue";
import { getFileBaseName } from "@/utils/resource-utils";
import { useAgentStore, useResourceStore } from "@/store";
import { agentResourcesToUiItems, getLinkedResourcesForAgent } from "@/utils/resources-ui";
import type { UIResourceKind } from "@/types/ui";
import { isFileItem, isSkillItem } from "@/utils/resource-utils";
import { getDefaultWorkspaceCwd } from "@/config/workspace";
import type { UIResourceItem } from "@/types/ui";
import { useI18n } from "@/i18n";

const props = defineProps<{
  agentId: string;
}>();

type MobileTab = "config" | "system" | UIResourceKind;

const agentStore = useAgentStore();
const resourceStore = useResourceStore();
const { t } = useI18n();
const agentItems = ref<UIResourceItem[]>([]);
const loading = ref(false);

watch(
  () => props.agentId,
  async (id) => {
    loading.value = true;
    try {
      await agentStore.fetchAgentResources(id, getDefaultWorkspaceCwd());
      const res = agentStore.agentResources[id];
      agentItems.value = res ? agentResourcesToUiItems(id, res) : [];
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const tab = ref<MobileTab>("config");

const tabs = computed(() => [
  { id: "config" as const, label: t("resource.config") },
  { id: "system" as const, label: t("resource.systemPrompt") },
  { id: "skills" as const, label: t("resource.skills") },
  { id: "extensions" as const, label: t("resource.extensions") },
  { id: "prompts" as const, label: t("resource.templates") },
  { id: "mcp" as const, label: "MCP" },
]);

const linked = computed(() =>
  getLinkedResourcesForAgent(props.agentId, agentItems.value, resourceStore.resourceItems),
);

const skillItems = computed(() => linked.value.filter(isSkillItem));

const fileItems = computed(() => {
  if (tab.value === "skills" || tab.value === "config" || tab.value === "system") return [];
  return linked.value.filter((r) => r.kind === tab.value).filter(isFileItem);
});
</script>
