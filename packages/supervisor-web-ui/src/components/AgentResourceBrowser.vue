<template>
  <div class="resource-browser flex flex-1 min-h-0 overflow-hidden">
    <div
      v-if="loading"
      class="resource-browser-empty flex flex-1 items-center justify-center gap-2 text-[13px]"
    >
      <Loader2 class="h-4 w-4 animate-spin" />
      正在加载资源...
    </div>
    <template v-else>
      <!-- Skills and Extensions with files: skill list + file tree -->
      <template v-if="kind === 'skills' || kind === 'extensions'">
        <div
          class="resource-browser-sidebar shrink-0 border-r overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col min-h-0 min-w-0 relative"
          :style="{ width: `${sidebarWidth}px` }"
        >
          <div class="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
            <div
              v-for="item in skillOrExtItems"
              :key="item.id"
              class="resource-browser-item px-3 py-2.5 cursor-pointer transition-colors"
              :class="
                selectedSkillId === item.id
                  ? 'resource-browser-item--active'
                  : 'resource-browser-item--idle'
              "
              @click="selectSkill(item.id)"
            >
              <div class="flex items-start gap-1 min-w-0">
                <SkillListItem v-if="item.kind === 'skills'" :skill="item" />
                <ResourceFileListItem v-else :item="item" />
                <ResourceLayerBadge :layer="item.layer" />
              </div>
            </div>
            <div
              v-if="skillOrExtItems.length === 0"
              class="resource-browser-empty px-3 py-8 text-[12px] text-center"
            >
              暂无
            </div>
          </div>
          <GlobalResourceBindBar
            v-if="showGlobalBindBar"
            :items="unlinkedGlobal"
            :kind="props.kind"
            :binding-item-id="bindingItemId"
            @bind="bindGlobalItem"
            @preview="previewGlobalItem"
            @installed="refreshAfterInstall"
            @uninstalled="refreshAfterUninstall"
          />
          <ResizeHandle
            class="resource-browser-resize-handle"
            orientation="vertical"
            label="调整资源侧边栏宽度"
            @start="startSidebarResize"
          />
        </div>

        <div
          v-if="selectedSkill"
          class="resource-browser-tree shrink-0 border-r flex flex-col min-h-0 relative"
          :style="{ width: `${treeWidth}px` }"
        >
          <div
            class="resource-browser-tree-header px-3 py-2 text-[11px] border-b shrink-0 truncate font-mono"
          >
            {{ selectedSkill.name }}
          </div>
          <SkillFileTree
            class="flex-1 min-h-0 px-1 py-1"
            :files="selectedSkill.files"
            :selected-file-id="selectedFileId"
            @select="selectedFileId = $event"
          />
          <ResizeHandle
            class="resource-browser-resize-handle"
            orientation="vertical"
            label="调整文件树宽度"
            @start="startTreeResize"
          />
        </div>

        <div class="resource-browser-main flex-1 overflow-hidden p-5 min-w-0 flex flex-col">
          <div
            v-if="selectedSkill && selectedFile"
            class="resource-browser-editor flex-1 min-h-[200px] border rounded-sm flex flex-col overflow-hidden"
          >
            <div
              class="resource-browser-editor-header border-b flex items-center gap-3 min-w-0 shrink-0 px-4 py-2.5"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-[12px] font-medium truncate">{{ selectedSkill.name }}</span>
                  <span class="resource-browser-separator">/</span>
                  <span class="text-[12px] font-mono truncate">{{ selectedFile.fileName }}</span>
                  <ResourceLayerBadge :layer="selectedSkill.layer" />
                </div>
                <div
                  v-if="selectedSkill.rootPath"
                  class="resource-browser-editor-path mt-1 text-[11px] font-mono truncate"
                  :title="`${selectedSkill.rootPath}/${selectedFile.fileName}`"
                >
                  {{ selectedSkill.rootPath }}/{{ selectedFile.fileName }}
                </div>
              </div>
              <button
                v-if="previewItem"
                type="button"
                class="resource-browser-add shrink-0 rounded px-3 py-1.5 text-[12px]"
                :disabled="!!bindingItemId"
                @click="bindGlobalItem(previewItem)"
              >
                {{ bindingItemId === previewItem.id ? "添加中..." : "添加到 Agent" }}
              </button>
            </div>
            <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
              <ResourceContentView
                :key="`${selectedSkill.id}:${selectedFile.id}`"
                :content="selectedFile.content"
                :kind="'skills'"
                :language="getSkillFileLanguage(selectedFile.fileName)"
              />
            </div>
          </div>
          <div
            v-else
            class="resource-browser-empty h-full flex items-center justify-center text-[13px]"
          >
            选择文件
          </div>
        </div>
      </template>

      <!-- Prompts / MCP: flat file list -->
      <template v-else>
        <div
          class="resource-browser-sidebar shrink-0 border-r overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col min-h-0 min-w-0 relative"
          :style="{ width: `${sidebarWidth}px` }"
        >
          <div class="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
            <div
              v-for="item in fileItems"
              :key="item.id"
              class="resource-browser-item px-3 py-2.5 cursor-pointer transition-colors flex items-start gap-1"
              :class="
                selectedFileItemId === item.id
                  ? 'resource-browser-item--active'
                  : 'resource-browser-item--idle'
              "
              @click="selectedFileItemId = item.id"
            >
              <ResourceFileListItem :item="item" />
              <ResourceLayerBadge :layer="item.layer" />
            </div>
            <div
              v-if="fileItems.length === 0"
              class="resource-browser-empty px-3 py-8 text-[12px] text-center"
            >
              暂无
            </div>
          </div>
          <GlobalResourceBindBar
            v-if="showGlobalBindBar"
            :items="unlinkedGlobal"
            :kind="props.kind"
            :binding-item-id="bindingItemId"
            @bind="bindGlobalItem"
            @preview="previewGlobalItem"
            @installed="refreshAfterInstall"
            @uninstalled="refreshAfterUninstall"
          />
          <ResizeHandle
            class="resource-browser-resize-handle"
            orientation="vertical"
            label="调整资源侧边栏宽度"
            @start="startSidebarResize"
          />
        </div>

        <div class="resource-browser-main flex-1 overflow-hidden p-5 min-w-0 flex flex-col">
          <div
            v-if="activeFlatItem"
            class="resource-browser-editor flex-1 min-h-[200px] border rounded-sm flex flex-col overflow-hidden"
          >
            <div
              class="resource-browser-editor-header border-b flex items-center gap-3 min-w-0 shrink-0 px-4 py-2.5"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-[12px] truncate">{{
                    getFileBaseName(activeFlatItem.fileName)
                  }}</span>
                  <ResourceLayerBadge :layer="activeFlatItem.layer" />
                </div>
                <div
                  v-if="activeFlatItem.layer === 'global'"
                  class="resource-browser-editor-path mt-1 text-[11px] font-mono truncate"
                  :title="activeFlatItem.path"
                >
                  {{ activeFlatItem.path }}
                </div>
              </div>
              <TemplateSyntaxHelpButton v-if="kind === 'prompts'" />
              <button
                v-if="previewItem"
                type="button"
                class="resource-browser-add shrink-0 rounded px-3 py-1.5 text-[12px]"
                :disabled="!!bindingItemId"
                @click="bindGlobalItem(previewItem)"
              >
                {{ bindingItemId === previewItem.id ? "添加中..." : "添加到 Agent" }}
              </button>
            </div>
            <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
              <ResourceContentView
                :key="activeFlatItem.id"
                :content="activeFlatItem.content"
                :kind="activeFlatItem.kind"
              />
            </div>
          </div>
          <div
            v-else
            class="resource-browser-empty h-full flex items-center justify-center text-[13px]"
          >
            选择文件
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Loader2 } from "lucide-vue-next";
import GlobalResourceBindBar from "./GlobalResourceBindBar.vue";
import ResourceContentView from "./ResourceContentView.vue";
import ResourceFileListItem from "./ResourceFileListItem.vue";
import ResourceLayerBadge from "./ResourceLayerBadge.vue";
import ResizeHandle from "./ResizeHandle.vue";
import SkillFileTree from "./SkillFileTree.vue";
import SkillListItem from "./SkillListItem.vue";
import TemplateSyntaxHelpButton from "./TemplateSyntaxHelpButton.vue";
import { useAgentStore, useResourceStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import { useResizableWidth } from "@/composables/use-resizable-width";
import {
  agentResourcesToUiItems,
  getLinkedResourcesForAgent,
  getResourcesByKind,
} from "@/utils/resources-ui";
import {
  getSkillFileLanguage,
  getFileBaseName,
  isFileItem,
  isSkillItem,
  resourceEntryPath,
} from "@/utils/resource-utils";
import { getDefaultWorkspaceCwd } from "@/config/workspace";
import type { UIResourceItem, UIResourceKind, UISkillItem } from "@/types/ui";

const props = defineProps<{
  agentId: string;
  kind: UIResourceKind;
}>();

const agentStore = useAgentStore();
const resourceStore = useResourceStore();
const agentItems = ref<UIResourceItem[]>([]);
const bindingItemId = ref<string | null>(null);
const loading = ref(false);
const { width: sidebarWidth, startResize: startSidebarResize } = useResizableWidth({
  defaultWidth: 224,
  minWidth: 176,
  maxWidth: 520,
  storageKey: "agent-resource-sidebar-width",
});
const { width: treeWidth, startResize: startTreeResize } = useResizableWidth({
  defaultWidth: 208,
  minWidth: 160,
  maxWidth: 480,
  storageKey: "agent-resource-tree-width",
});

const selectedSkillId = ref<string | null>(null);
const selectedFileId = ref<string | null>(null);
const selectedFileItemId = ref<string | null>(null);
const previewItem = ref<UIResourceItem | null>(null);

watch(
  () => props.agentId,
  async (id) => {
    await reloadAgentItems(id);
  },
  { immediate: true },
);

const unlinkedGlobal = computed(() => {
  const global = getResourcesByKind(resourceStore.resourceItems, props.kind);
  const linked = new Set(items.value.map((item) => resourceEntryPath(item)).filter(Boolean));
  return global.filter((item) => {
    const path = resourceEntryPath(item);
    return path && !linked.has(path);
  });
});

const showGlobalBindBar = computed(
  () =>
    unlinkedGlobal.value.length > 0 ||
    props.kind === "skills" ||
    props.kind === "extensions" ||
    props.kind === "prompts" ||
    props.kind === "mcp",
);

async function reloadAgentItems(id: string) {
  loading.value = true;
  try {
    await agentStore.fetchAgentResources(id, getDefaultWorkspaceCwd());
    const res = agentStore.agentResources[id];
    agentItems.value = res ? agentResourcesToUiItems(id, res) : [];
  } finally {
    loading.value = false;
  }
}

async function refreshAfterInstall(_id: string) {
  await resourceStore.fetchGlobalResources();
  await reloadAgentItems(props.agentId);
  resetSelection();
}

async function refreshAfterUninstall(_id: string) {
  await resourceStore.fetchGlobalResources();
  await reloadAgentItems(props.agentId);
  resetSelection();
}

async function bindGlobalItem(item: UIResourceItem) {
  const sourcePath = item.rootPath ?? resourceEntryPath(item);
  if (!sourcePath) return;
  const kind =
    props.kind === "skills"
      ? "skill"
      : props.kind === "extensions"
        ? "extension"
        : props.kind === "mcp"
          ? "mcp"
          : "prompt";
  try {
    bindingItemId.value = item.id;
    await agentStore.bindAgentResource(props.agentId, kind, sourcePath);
    agentItems.value = [
      ...agentItems.value,
      { ...item, layer: "agent", agentIds: [props.agentId] } as UIResourceItem,
    ];
    resetSelection();
    previewItem.value = null;
    showUiMessage(`已引入 ${item.name}`, "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "引入失败", "error");
  } finally {
    bindingItemId.value = null;
  }
}

const items = computed(() =>
  getLinkedResourcesForAgent(props.agentId, agentItems.value, resourceStore.resourceItems).filter(
    (r) => r.kind === props.kind,
  ),
);

const skillOrExtItems = computed(() => {
  if (props.kind === "skills") {
    return items.value.filter(isSkillItem);
  }
  if (props.kind === "extensions") {
    return items.value.filter(isFileItem);
  }
  return [];
});

const fileItems = computed(() => items.value.filter(isFileItem));

const selectedSkill = computed(() => {
  const preview = previewItem.value;
  if (preview && selectedSkillId.value === preview.id) {
    if (isSkillItem(preview)) return preview;
    if (isFileItem(preview) && preview.files?.length) {
      return { ...preview, files: preview.files as any } as unknown as UISkillItem;
    }
  }
  if (props.kind === "extensions") {
    const id = selectedSkillId.value;
    if (!id) return undefined;
    const item = items.value.find((r) => r.id === id);
    if (item && isFileItem(item) && item.files && item.files.length > 0) {
      // Treat extension with files like a skill
      return { ...item, files: item.files as any } as unknown as UISkillItem;
    }
    return undefined;
  }
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
  // For extensions with files, selectedFile handles it
  if (props.kind === "extensions") {
    const skill = selectedSkill.value;
    if (skill) return undefined;
  }
  const id = selectedFileItemId.value;
  if (!id) return undefined;
  return fileItems.value.find((r) => r.id === id);
});

const activeFlatItem = computed(() => {
  const preview = previewItem.value;
  return preview && isFileItem(preview) ? preview : selectedFileItem.value;
});

function previewGlobalItem(item: UIResourceItem) {
  previewItem.value = item;
  if (isSkillItem(item) || (isFileItem(item) && item.files?.length)) {
    selectedSkillId.value = item.id;
    selectedFileId.value = item.files?.[0]?.id ?? null;
    selectedFileItemId.value = null;
  } else {
    selectedSkillId.value = null;
    selectedFileId.value = null;
    selectedFileItemId.value = null;
  }
}

function selectSkill(id: string) {
  selectedSkillId.value = id;
  if (props.kind === "extensions") {
    const item = items.value.find((r) => r.id === id);
    if (item && isFileItem(item) && item.files && item.files.length > 0) {
      selectedFileId.value = item.files[0].id ?? null;
      return;
    }
  }
  const skill = items.value.find((r) => r.id === id);
  if (skill && isSkillItem(skill)) {
    selectedFileId.value = skill.files[0]?.id ?? null;
  }
}

function resetSelection() {
  previewItem.value = null;
  if (props.kind === "skills" || props.kind === "extensions") {
    const firstSkillOrExt = items.value.find((item) => {
      if (props.kind === "skills") return isSkillItem(item);
      if (props.kind === "extensions" && isFileItem(item)) {
        return item.files && item.files.length > 0;
      }
      return false;
    });
    if (firstSkillOrExt) {
      selectedSkillId.value = firstSkillOrExt.id;
      const asSkill = firstSkillOrExt as UISkillItem;
      selectedFileId.value = asSkill.files[0]?.id ?? null;
    } else {
      selectedSkillId.value = null;
      selectedFileId.value = null;
    }
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

<style scoped>
.resource-browser-sidebar {
  background: var(--app-resource-sidebar-bg);
  border-color: var(--app-border);
}

@media (max-width: 767px) {
  .resource-browser {
    display: block;
    overflow-y: auto;
  }

  .resource-browser-sidebar,
  .resource-browser-tree,
  .resource-browser-main {
    width: 100% !important;
  }

  .resource-browser-sidebar {
    flex: none;
    overflow: visible;
    border-right: 0;
    border-bottom: 1px solid var(--app-border-subtle);
  }

  .resource-browser-tree {
    flex: none;
    min-height: 180px;
    border-right: 0;
    border-bottom: 1px solid var(--app-border-subtle);
  }

  .resource-browser-main {
    flex: none;
    min-height: 320px;
    padding: 12px;
  }

  .resource-browser-resize-handle {
    display: none;
  }
}

.resource-browser-tree {
  background: var(--app-resource-tree-bg);
  border-color: var(--app-border);
}

.resource-browser-tree-header {
  color: var(--app-text-secondary);
  background: var(--app-resource-tree-bg);
  border-color: var(--app-border);
}

.resource-browser-main {
  background: var(--app-settings-bg);
}

.resource-browser-item {
  margin-bottom: 1px;
}

.resource-browser-item--idle:hover {
  background: var(--app-list-item-hover);
}

.resource-browser-item--active {
  background: var(--app-accent);
  color: var(--app-button-text, #fff);
}

.resource-browser-item--active :deep(.skill-list-name),
.resource-browser-item--active :deep(.resource-file-name) {
  color: inherit;
}

.resource-browser-item--active :deep(.skill-list-path),
.resource-browser-item--active :deep(.resource-file-path) {
  color: color-mix(in srgb, currentColor 70%, transparent);
}

.resource-browser-editor {
  background: var(--app-settings-card);
  border-color: var(--app-border);
}

.resource-browser-editor-header {
  background: var(--app-list-header-bg);
  border-color: var(--app-border-subtle);
  color: var(--app-text-primary);
}

.resource-browser-editor-path {
  border-color: var(--app-border-subtle);
  color: var(--app-text-muted);
}

.resource-browser-separator {
  color: var(--app-text-muted);
}

.resource-browser-empty {
  color: var(--app-text-muted);
}
.resource-browser-add {
  color: #fff;
  background: var(--app-accent);
}
.resource-browser-add:hover:not(:disabled) {
  background: var(--app-accent-hover);
}
.resource-browser-add:disabled {
  cursor: wait;
  opacity: 0.6;
}
</style>
