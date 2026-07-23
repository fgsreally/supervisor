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
          class="resource-detail-header h-14 shrink-0 border-b flex items-center px-6 gap-2 justify-between"
        >
          <span class="text-[15px] resource-detail-subtitle font-mono truncate min-w-0 flex-1">{{
            contentTitle
          }}</span>
          <span v-if="canEditContent && dirty" class="text-[11px] resource-detail-dirty shrink-0"
            >未保存</span
          >
          <template v-if="canEditContent">
            <button
              type="button"
              class="list-header-btn shrink-0"
              title="保存"
              :disabled="saving || !dirty"
              @click="saveContent"
            >
              <Loader2 v-if="saving" class="w-4 h-4 animate-spin" />
              <Save v-else class="w-4 h-4" />
            </button>
            <button
              type="button"
              class="list-header-btn list-header-btn--danger shrink-0"
              title="从全局库删除"
              :disabled="deleting"
              @click="removeResource"
            >
              <Loader2 v-if="deleting" class="w-4 h-4 animate-spin" />
              <Trash2 v-else class="w-4 h-4" />
            </button>
          </template>
        </div>
        <div v-if="actionError" class="px-6 py-1.5 text-[11px] resource-detail-error shrink-0">
          {{ actionError }}
        </div>
        <div class="resource-detail-content-wrap flex-1 min-h-0 min-w-0 overflow-hidden">
          <ResourceContentView
            v-if="draftContent !== undefined"
            :key="`${resource.id}:${canEditContent}`"
            :content="draftContent"
            :kind="resource.kind"
            :language="activeLanguage"
            :editable="canEditContent"
            @update:content="onContentUpdate"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronLeft, Loader2, Save, Trash2 } from "lucide-vue-next";
import ResourceContentView from "../components/ResourceContentView.vue";
import SkillFileTree from "../components/SkillFileTree.vue";
import {
  uninstallCatalogResource,
  upsertResourceContent,
  type CatalogResourceKind,
} from "@/api";
import { useResourceStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import { getResourceById } from "@/utils/resources-ui";
import {
  getSkillFileLanguage,
  isFileItem,
  isSkillItem,
  relativeSupervisorPath,
} from "@/utils/resource-utils";

const props = defineProps<{
  resourceId: string | null;
  showBack?: boolean;
}>();

const emit = defineEmits<{ back: []; deleted: [] }>();

const resourceStore = useResourceStore();

const resource = computed(() =>
  props.resourceId ? getResourceById(resourceStore.resourceItems, props.resourceId) : undefined,
);

const isSkill = computed(() => {
  const r = resource.value;
  return r ? isSkillItem(r) : false;
});

const canEditContent = computed(() => {
  const r = resource.value;
  return !!r && (r.kind === "prompts" || r.kind === "mcp") && r.layer === "global" && isFileItem(r);
});

const skillFiles = computed(() => {
  const r = resource.value;
  return r && isSkillItem(r) ? r.files : [];
});

const resourcePath = computed(() => {
  const r = resource.value;
  if (!r) return "";
  if (isSkillItem(r) && r.layer === "global" && r.rootPath) {
    return relativeSupervisorPath(r.rootPath);
  }
  if (isFileItem(r) && r.layer === "global" && r.path) {
    return relativeSupervisorPath(r.path);
  }
  return "";
});

const selectedFileId = ref<string | null>(null);
const draftContent = ref<string | undefined>(undefined);
const saving = ref(false);
const deleting = ref(false);
const actionError = ref<string | null>(null);

watch(
  () => props.resourceId,
  () => {
    const r = resource.value;
    actionError.value = null;
    if (r && isSkillItem(r)) {
      selectedFileId.value = r.files[0]?.id ?? null;
      draftContent.value = r.files[0]?.content ?? "";
    } else if (r && isFileItem(r)) {
      selectedFileId.value = null;
      draftContent.value = r.content;
    } else {
      selectedFileId.value = null;
      draftContent.value = undefined;
    }
  },
  { immediate: true },
);

watch(selectedFileId, (id) => {
  const r = resource.value;
  if (!r || !isSkillItem(r) || !id) return;
  draftContent.value = r.files.find((f) => f.id === id)?.content ?? "";
});

const selectedFile = computed(() => {
  const id = selectedFileId.value;
  if (!id) return undefined;
  return skillFiles.value.find((f) => f.id === id);
});

const dirty = computed(() => {
  const r = resource.value;
  if (!r || !canEditContent.value || !isFileItem(r)) return false;
  return (draftContent.value ?? "") !== r.content;
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
    case "mcp":
      return "MCP 配置";
    default:
      return "—";
  }
});

function onContentUpdate(value: string) {
  if (!canEditContent.value) return;
  draftContent.value = value;
}

function catalogKind(): CatalogResourceKind | null {
  const r = resource.value;
  if (!r) return null;
  if (r.kind === "prompts") return "prompt";
  if (r.kind === "mcp") return "mcp";
  if (r.kind === "skills") return "skill";
  if (r.kind === "extensions") return "extension";
  return null;
}

async function saveContent() {
  const r = resource.value;
  if (!r || !canEditContent.value || !isFileItem(r)) return;
  const kind = catalogKind();
  if (kind !== "prompt" && kind !== "mcp") return;
  saving.value = true;
  actionError.value = null;
  try {
    await upsertResourceContent({
      kind,
      slug: r.name,
      content: draftContent.value ?? "",
    });
    await resourceStore.fetchGlobalResources();
    showUiMessage("已保存", "success");
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

async function removeResource() {
  const r = resource.value;
  const kind = catalogKind();
  if (!r || !kind || (kind !== "prompt" && kind !== "mcp")) return;
  if (!window.confirm(`确定删除 ${r.name}？`)) return;
  deleting.value = true;
  actionError.value = null;
  try {
    await uninstallCatalogResource(kind, r.name);
    await resourceStore.fetchGlobalResources();
    showUiMessage("已删除", "success");
    emit("deleted");
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    deleting.value = false;
  }
}
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

.list-header-btn {
  padding: 6px;
  border-radius: 6px;
  color: var(--app-nav-icon, var(--app-text-secondary));
  transition: background-color 0.15s;
}

.list-header-btn:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.list-header-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.list-header-btn--danger:hover:not(:disabled) {
  color: var(--app-error, #d33);
}

.resource-detail-error {
  color: var(--app-error, #d33);
}

.resource-detail-dirty {
  color: var(--app-warning, #c97800);
}
</style>
