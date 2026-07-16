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

    <div v-if="tab === 'config'" class="px-4 py-4">
      <AgentConfigPanel :agent-id="agentId" />
    </div>

    <div v-else-if="tab === 'system'" class="px-4 py-4">
      <AgentSystemPromptPanel :agent-id="agentId" />
    </div>

    <div v-else-if="tab === 'skills'" class="px-4 py-3 space-y-4">
      <div
        v-for="skill in skillItems"
        :key="skill.id"
        class="border border-gray-100 rounded-lg overflow-hidden"
      >
        <div class="px-3 py-2 bg-gray-50 flex items-start gap-2">
          <SkillListItem :skill="skill" />
          <ResourceLayerBadge :layer="skill.layer" />
        </div>
        <div class="px-2 py-2 max-h-48 overflow-y-auto custom-scrollbar border-b border-gray-50">
          <SkillFileTree
            :files="skill.files"
            :selected-file-id="expandedSkillFile[skill.id] ?? null"
            @select="onSkillFileSelect(skill.id, $event)"
          />
        </div>
        <div v-if="expandedSkillFile[skill.id]" class="px-3 py-2">
          <div class="min-h-[8rem] border border-gray-100 rounded overflow-hidden">
            <ResourceContentView
              :content="getSkillFileContent(skill, expandedSkillFile[skill.id]!)"
              kind="skills"
              :language="
                getSkillFileLanguage(findSkillFileName(skill, expandedSkillFile[skill.id]!))
              "
              :fill="false"
            />
          </div>
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
        <div class="min-h-[10rem]">
          <ResourceContentView :content="r.content" :kind="r.kind" :fill="false" />
        </div>
      </div>
      <div v-if="fileItems.length === 0" class="py-6 text-center text-[13px] text-gray-400">
        暂无
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import AgentConfigPanel from "./AgentConfigPanel.vue";
import AgentSystemPromptPanel from "./AgentSystemPromptPanel.vue";
import ResourceContentView from "./ResourceContentView.vue";
import ResourceFileListItem from "./ResourceFileListItem.vue";
import ResourceLayerBadge from "./ResourceLayerBadge.vue";
import SkillFileTree from "./SkillFileTree.vue";
import SkillListItem from "./SkillListItem.vue";
import {
  getLinkedResourcesForAgent,
  type MockSkillItem,
  type ResourceKind,
} from "../mock/resources";
import { getSkillFileLanguage, isFileItem, isSkillItem } from "../mock/resource-utils";

const props = defineProps<{
  agentId: string;
}>();

type MobileTab = "config" | "system" | ResourceKind;

const tab = ref<MobileTab>("config");
const expandedSkillFile = reactive<Record<string, string | null>>({});

const tabs = [
  { id: "config" as const, label: "Config" },
  { id: "system" as const, label: "System" },
  { id: "skills" as const, label: "Skills" },
  { id: "extensions" as const, label: "Ext" },
  { id: "prompts" as const, label: "Templates" },
];

const linked = computed(() => getLinkedResourcesForAgent(props.agentId));

const skillItems = computed(() => linked.value.filter(isSkillItem));

const fileItems = computed(() => {
  if (tab.value === "skills" || tab.value === "config" || tab.value === "system") return [];
  return linked.value.filter((r) => r.kind === tab.value).filter(isFileItem);
});

function onSkillFileSelect(skillId: string, fileId: string) {
  expandedSkillFile[skillId] = fileId;
}

function getSkillFileContent(skill: MockSkillItem, fileId: string): string {
  return skill.files.find((f) => f.id === fileId)?.content ?? "";
}

function findSkillFileName(skill: MockSkillItem, fileId: string): string {
  return skill.files.find((f) => f.id === fileId)?.fileName ?? "";
}
</script>
