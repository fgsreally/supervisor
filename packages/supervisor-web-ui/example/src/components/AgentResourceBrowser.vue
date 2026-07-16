<template>
  <div class="flex flex-1 min-h-0 overflow-hidden">
    <!-- Skills: skill list + file tree -->
    <template v-if="kind === 'skills'">
      <div
        class="w-48 shrink-0 border-r border-[#e5e5e5] bg-[#f7f7f7] overflow-y-auto custom-scrollbar"
      >
        <div
          v-for="item in skillItems"
          :key="item.id"
          class="px-3 py-2.5 cursor-pointer border-b border-gray-100/80 transition-colors"
          :class="selectedSkillId === item.id ? 'bg-[#c3c3c3]' : 'hover:bg-[#ededed]'"
          @click="selectSkill(item.id)"
        >
          <div class="flex items-start gap-1 min-w-0">
            <SkillListItem :skill="item" />
            <ResourceLayerBadge :layer="item.layer" />
          </div>
        </div>
        <div v-if="skillItems.length === 0" class="px-3 py-8 text-[12px] text-gray-400 text-center">
          暂无
        </div>
      </div>

      <div
        v-if="selectedSkill"
        class="w-52 shrink-0 border-r border-[#e5e5e5] bg-[#fafafa] flex flex-col min-h-0"
      >
        <div
          class="px-3 py-2 text-[11px] text-gray-400 border-b border-gray-100 shrink-0 truncate font-mono"
        >
          {{ selectedSkill.name }}
        </div>
        <SkillFileTree
          class="flex-1 min-h-0 px-1 py-1"
          :files="selectedSkill.files"
          :selected-file-id="selectedFileId"
          @select="selectedFileId = $event"
        />
      </div>

      <div class="flex-1 overflow-hidden bg-[#f5f5f5] p-5 min-w-0 flex flex-col">
        <div
          v-if="selectedSkill && selectedFile"
          class="flex-1 min-h-[200px] bg-white border border-gray-200/80 rounded-sm flex flex-col overflow-hidden"
        >
          <div
            class="px-4 py-2.5 border-b border-gray-100 bg-[#fafafa] flex items-center gap-2 min-w-0 shrink-0"
          >
            <span class="text-[12px] font-medium text-gray-700 truncate">{{
              selectedSkill.name
            }}</span>
            <span class="text-gray-300">/</span>
            <span class="text-[12px] font-mono text-gray-600 truncate">{{
              selectedFile.fileName
            }}</span>
            <ResourceLayerBadge :layer="selectedSkill.layer" />
          </div>
          <div
            v-if="selectedSkill.layer === 'global' && selectedSkill.rootPath"
            class="px-4 py-1.5 border-b border-gray-50 text-[11px] font-mono text-gray-400 truncate shrink-0"
            :title="`${selectedSkill.rootPath}/${selectedFile.fileName}`"
          >
            {{ selectedSkill.rootPath }}/{{ selectedFile.fileName }}
          </div>
          <div class="flex-1 min-h-0 overflow-hidden">
            <ResourceContentView
              :key="`${selectedSkill.id}:${selectedFile.id}`"
              :content="selectedFile.content"
              :kind="'skills'"
              :language="getSkillFileLanguage(selectedFile.fileName)"
            />
          </div>
        </div>
        <div v-else class="h-full flex items-center justify-center text-[13px] text-gray-400">
          选择 Skill 与文件
        </div>
      </div>
    </template>

    <!-- Extensions / Prompts: flat file list -->
    <template v-else>
      <div
        class="w-56 shrink-0 border-r border-[#e5e5e5] bg-[#f7f7f7] overflow-y-auto custom-scrollbar"
      >
        <div
          v-for="item in fileItems"
          :key="item.id"
          class="px-3 py-2.5 cursor-pointer border-b border-gray-100/80 transition-colors flex items-start gap-1"
          :class="selectedFileItemId === item.id ? 'bg-[#c3c3c3]' : 'hover:bg-[#ededed]'"
          @click="selectedFileItemId = item.id"
        >
          <ResourceFileListItem :item="item" />
          <ResourceLayerBadge :layer="item.layer" />
        </div>
        <div v-if="fileItems.length === 0" class="px-3 py-8 text-[12px] text-gray-400 text-center">
          暂无
        </div>
      </div>

      <div class="flex-1 overflow-hidden bg-[#f5f5f5] p-5 min-w-0 flex flex-col">
        <div
          v-if="selectedFileItem"
          class="flex-1 min-h-[200px] bg-white border border-gray-200/80 rounded-sm flex flex-col overflow-hidden"
        >
          <div
            class="px-4 py-2.5 border-b border-gray-100 bg-[#fafafa] flex items-center gap-2 min-w-0 shrink-0"
          >
            <span class="text-[12px] text-gray-700 truncate">{{
              getFileBaseName(selectedFileItem.fileName)
            }}</span>
            <ResourceLayerBadge :layer="selectedFileItem.layer" />
          </div>
          <div
            v-if="selectedFileItem.layer === 'global'"
            class="px-4 py-1.5 border-b border-gray-50 text-[11px] font-mono text-gray-400 truncate shrink-0"
            :title="selectedFileItem.path"
          >
            {{ selectedFileItem.path }}
          </div>
          <div class="flex-1 min-h-0 overflow-hidden">
            <ResourceContentView
              :key="selectedFileItem.id"
              :content="selectedFileItem.content"
              :kind="selectedFileItem.kind"
            />
          </div>
        </div>
        <div v-else class="h-full flex items-center justify-center text-[13px] text-gray-400">
          选择文件
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ResourceContentView from "./ResourceContentView.vue";
import ResourceFileListItem from "./ResourceFileListItem.vue";
import ResourceLayerBadge from "./ResourceLayerBadge.vue";
import SkillFileTree from "./SkillFileTree.vue";
import SkillListItem from "./SkillListItem.vue";
import { getLinkedResourcesForAgent, type ResourceKind } from "../mock/resources";
import {
  getSkillFileLanguage,
  getFileBaseName,
  isFileItem,
  isSkillItem,
} from "../mock/resource-utils";

const props = defineProps<{
  agentId: string;
  kind: ResourceKind;
}>();

const selectedSkillId = ref<string | null>(null);
const selectedFileId = ref<string | null>(null);
const selectedFileItemId = ref<string | null>(null);

const items = computed(() =>
  getLinkedResourcesForAgent(props.agentId).filter((r) => r.kind === props.kind),
);

const skillItems = computed(() => items.value.filter(isSkillItem));

const fileItems = computed(() => items.value.filter(isFileItem));

const selectedSkill = computed(() => {
  const id = selectedSkillId.value;
  if (!id) return undefined;
  const item = items.value.find((r) => r.id === id);
  return item && isSkillItem(item) ? item : undefined;
});

const selectedFile = computed(() => {
  const skill = selectedSkill.value;
  const fileId = selectedFileId.value;
  if (!skill || !fileId) return undefined;
  return skill.files.find((f) => f.id === fileId);
});

const selectedFileItem = computed(() => {
  const id = selectedFileItemId.value;
  if (!id) return undefined;
  return fileItems.value.find((r) => r.id === id);
});

function selectSkill(id: string) {
  selectedSkillId.value = id;
  const skill = items.value.find((r) => r.id === id);
  if (skill && isSkillItem(skill)) {
    selectedFileId.value = skill.files[0]?.id ?? null;
  }
}

function resetSelection() {
  if (props.kind === "skills") {
    const first = items.value.find(isSkillItem);
    selectedSkillId.value = first?.id ?? null;
    selectedFileId.value = first?.files[0]?.id ?? null;
    selectedFileItemId.value = null;
  } else {
    selectedSkillId.value = null;
    selectedFileId.value = null;
    selectedFileItemId.value = fileItems.value[0]?.id ?? null;
  }
}

watch(
  () => [props.agentId, props.kind] as const,
  () => resetSelection(),
  { immediate: true },
);
</script>
