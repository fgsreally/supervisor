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
      正在加载资源...
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
          <SkillListItem :skill="skill" />
          <ResourceLayerBadge :layer="skill.layer" />
        </div>
        <div class="px-2 py-2 max-h-48 overflow-y-auto custom-scrollbar">
          <SkillFileTree
            :files="skill.files"
            :selected-file-id="null"
            @select="() => undefined"
          />
        </div>
      </div>
      <div v-if="skillItems.length === 0" class="py-6 text-center text-[13px] text-gray-400">
        暂无
      </div>
    </div>

    <div v-else class="px-4 py-3 space-y-3">
      <div
        v-for="r in fileItems"
        :key="r.id"
        class="border border-gray-100 rounded-lg overflow-hidden"
      >
        <div class="px-3 py-2 bg-gray-50 flex items-start gap-2 min-w-0">
          <ResourceFileListItem :item="r" />
          <ResourceLayerBadge :layer="r.layer" />
        </div>
      </div>
      <div v-if="fileItems.length === 0" class="py-6 text-center text-[13px] text-gray-400">
        暂无
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Loader2 } from "lucide-vue-next";
import AgentConfigPanel from "./AgentConfigPanel.vue";
import AgentSystemPromptPanel from "./AgentSystemPromptPanel.vue";
import AgentExtensionsPanel from "./AgentExtensionsPanel.vue";
import ResourceFileListItem from "./ResourceFileListItem.vue";
import ResourceLayerBadge from "./ResourceLayerBadge.vue";
import SkillFileTree from "./SkillFileTree.vue";
import SkillListItem from "./SkillListItem.vue";
import { useAgentStore, useResourceStore } from "@/store";
import { agentResourcesToUiItems, getLinkedResourcesForAgent } from "@/utils/resources-ui";
import type { UIResourceKind } from "@/types/ui";
import { isFileItem, isSkillItem } from "@/utils/resource-utils";
import { getDefaultWorkspaceCwd } from "@/config/workspace";
import type { UIResourceItem } from "@/types/ui";

const props = defineProps<{
  agentId: string;
}>();

type MobileTab = "config" | "system" | UIResourceKind;

const agentStore = useAgentStore();
const resourceStore = useResourceStore();
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

const tabs = [
  { id: "config" as const, label: "配置" },
  { id: "system" as const, label: "系统提示" },
  { id: "skills" as const, label: "技能" },
  { id: "extensions" as const, label: "扩展" },
  { id: "prompts" as const, label: "模板" },
  { id: "mcp" as const, label: "MCP" },
];

const linked = computed(() =>
  getLinkedResourcesForAgent(props.agentId, agentItems.value, resourceStore.resourceItems),
);

const skillItems = computed(() => linked.value.filter(isSkillItem));

const fileItems = computed(() => {
  if (tab.value === "skills" || tab.value === "config" || tab.value === "system") return [];
  return linked.value.filter((r) => r.kind === tab.value).filter(isFileItem);
});
</script>
