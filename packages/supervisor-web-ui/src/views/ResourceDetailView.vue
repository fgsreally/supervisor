<template>
  <div
    v-if="resource"
    class="resource-detail-view flex flex-col flex-1 min-w-0 basis-0 h-full w-full overflow-hidden"
  >
    <div class="flex flex-col md:flex-row flex-1 min-h-0 min-w-0">
      <aside
        class="resource-detail-aside shrink-0 w-full md:w-64 lg:w-72 flex flex-col border-b md:border-b-0 md:border-r min-h-0"
      >
        <div class="resource-detail-header h-14 shrink-0 flex items-center px-4 border-b">
          <button
            v-if="showBack"
            type="button"
            class="mr-2 p-1.5 rounded-md resource-detail-back-btn md:hidden"
            @click="emit('back')"
          >
            <ChevronLeft class="w-5 h-5" />
          </button>
          <div class="resource-detail-title flex-1 font-medium text-[17px] truncate min-w-0">
            {{ resource.name }}
          </div>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 text-[14px]">
          <div>
            <div class="resource-detail-subtitle text-[13px] mb-1">类型</div>
            <div class="resource-detail-title">{{ kindLabel }}</div>
          </div>

          <div v-if="resourcePath">
            <div class="resource-detail-subtitle text-[13px] mb-1">路径</div>
            <div class="text-[11px] font-mono truncate resource-detail-path">
              {{ resourcePath }}
            </div>
          </div>

          <div>
            <div class="resource-detail-subtitle text-[13px] mb-1">描述</div>
            <div class="resource-detail-desc text-[13px] leading-relaxed whitespace-pre-wrap">
              {{ resource.description || "—" }}
            </div>
          </div>

          <div v-if="isSkill">
            <div class="resource-detail-subtitle text-[13px] mb-2">文件</div>
            <div
              class="max-h-64 overflow-y-auto custom-scrollbar border rounded p-1 resource-detail-tree-wrap"
            >
              <SkillFileTree
                :files="skillFiles"
                :selected-file-id="selectedFileId"
                @select="selectedFileId = $event"
              />
            </div>
          </div>
        </div>
      </aside>

      <section class="flex flex-col flex-1 min-w-0 basis-0 min-h-0 overflow-hidden">
        <div
          class="resource-detail-header h-14 shrink-0 border-b flex items-center px-6 justify-between"
        >
          <span class="text-[15px] resource-detail-subtitle font-mono truncate">{{
            contentTitle
          }}</span>
        </div>
        <div class="resource-detail-content-wrap flex-1 min-h-0 min-w-0 overflow-hidden">
          <ResourceContentView
            v-if="activeContent !== undefined"
            :content="activeContent"
            :kind="resource.kind"
            :language="activeLanguage"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronLeft } from "lucide-vue-next";
import ResourceContentView from "../components/ResourceContentView.vue";
import SkillFileTree from "../components/SkillFileTree.vue";
import { useResourceStore } from "@/store";
import { getResourceById } from "@/utils/resources-ui";
import { getSkillFileLanguage, isFileItem, isSkillItem } from "@/utils/resource-utils";

const props = defineProps<{
  resourceId: string | null;
  showBack?: boolean;
}>();

const emit = defineEmits<{ back: [] }>();

const resourceStore = useResourceStore();

const resource = computed(() =>
  props.resourceId ? getResourceById(resourceStore.resourceItems, props.resourceId) : undefined,
);

const isSkill = computed(() => {
  const r = resource.value;
  return r ? isSkillItem(r) : false;
});

const skillFiles = computed(() => {
  const r = resource.value;
  return r && isSkillItem(r) ? r.files : [];
});

const resourcePath = computed(() => {
  const r = resource.value;
  if (!r) return "";
  if (isSkillItem(r) && r.layer === "global" && r.rootPath) return r.rootPath;
  if (isFileItem(r) && r.layer === "global" && r.path) return r.path;
  return "";
});

const selectedFileId = ref<string | null>(null);

watch(
  () => props.resourceId,
  () => {
    const r = resource.value;
    if (r && isSkillItem(r)) {
      selectedFileId.value = r.files[0]?.id ?? null;
    } else {
      selectedFileId.value = null;
    }
  },
  { immediate: true },
);

const selectedFile = computed(() => {
  const id = selectedFileId.value;
  if (!id) return undefined;
  return skillFiles.value.find((f) => f.id === id);
});

const activeContent = computed(() => {
  const r = resource.value;
  if (!r) return undefined;
  if (isSkillItem(r)) return selectedFile.value?.content ?? "";
  if (isFileItem(r)) return r.content;
  return "";
});

const activeLanguage = computed(() => {
  const file = selectedFile.value;
  if (file) return getSkillFileLanguage(file.fileName);
  return undefined;
});

const contentTitle = computed(() => {
  const r = resource.value;
  if (!r) return "";
  if (isSkillItem(r)) return selectedFile.value?.fileName ?? r.name;
  if (isFileItem(r)) {
    const base = r.fileName.split("/").pop() ?? r.fileName;
    return base;
  }
  return "";
});

const kindLabel = computed(() => {
  switch (resource.value?.kind) {
    case "skills":
      return "Skill";
    case "extensions":
      return "Extension";
    case "prompts":
      return "Prompt 模板";
    default:
      return "—";
  }
});
</script>

<style scoped>
.resource-detail-view {
  background: var(--app-settings-bg);
}

.resource-detail-aside {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
}

.resource-detail-header {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
}

.resource-detail-back-btn {
  color: var(--app-text-secondary);
}

.resource-detail-back-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.resource-detail-title,
.resource-detail-title-input {
  color: var(--app-text-primary);
}

.resource-detail-desc {
  color: var(--app-text-primary);
}

.resource-detail-subtitle {
  color: var(--app-text-secondary);
}

.resource-detail-path {
  color: var(--app-text-muted);
}

.resource-detail-tree-wrap {
  border-color: var(--app-border-subtle);
  background: var(--app-settings-card);
}

.resource-detail-content-wrap {
  background: var(--app-cm-bg);
}
</style>
