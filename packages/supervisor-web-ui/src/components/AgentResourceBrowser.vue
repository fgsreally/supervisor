<template>
  <div class="flex flex-1 min-h-0 overflow-hidden">
    <!-- Skills and Extensions with files: skill list + file tree -->
    <template v-if="kind === 'skills' || kind === 'extensions'">
      <div class="resource-browser-sidebar w-48 shrink-0 border-r overflow-y-auto custom-scrollbar flex flex-col min-h-0">
        <div class="flex-1 min-h-0 overflow-y-auto">
          <div
            v-for="item in skillOrExtItems"
            :key="item.id"
            class="resource-browser-item px-3 py-2.5 cursor-pointer transition-colors"
            :class="selectedSkillId === item.id ? 'resource-browser-item--active' : 'resource-browser-item--idle'"
            @click="selectSkill(item.id)"
          >
            <div class="flex items-start gap-1 min-w-0">
              <SkillListItem v-if="item.kind === 'skills'" :skill="item" />
              <ResourceFileListItem v-else :item="item" />
              <ResourceLayerBadge :layer="item.layer" />
            </div>
          </div>
          <div v-if="skillOrExtItems.length === 0" class="resource-browser-empty px-3 py-8 text-[12px] text-center">暂无</div>
        </div>
        <GlobalResourceLinkBar
          v-if="unlinkedGlobal.length"
          :items="unlinkedGlobal"
          :kind="props.kind"
          @link="linkGlobalItem"
          @installed="refreshAfterInstall"
          @uninstalled="refreshAfterUninstall"
        />
      </div>

      <div
        v-if="selectedSkill"
        class="resource-browser-tree w-52 shrink-0 border-r flex flex-col min-h-0"
      >
        <div class="resource-browser-tree-header px-3 py-2 text-[11px] border-b shrink-0 truncate font-mono">
          {{ selectedSkill.name }}
        </div>
        <SkillFileTree
          class="flex-1 min-h-0 px-1 py-1"
          :files="selectedSkill.files"
          :selected-file-id="selectedFileId"
          @select="selectedFileId = $event"
        />
      </div>

      <div class="resource-browser-main flex-1 overflow-hidden p-5 min-w-0 flex flex-col">
        <div
          v-if="selectedSkill && selectedFile"
          class="resource-browser-editor flex-1 min-h-[200px] border rounded-sm flex flex-col overflow-hidden"
        >
          <div class="resource-browser-editor-header px-4 py-2.5 border-b flex items-center gap-2 min-w-0 shrink-0">
            <span class="text-[12px] font-medium truncate">{{ selectedSkill.name }}</span>
            <span class="resource-browser-separator">/</span>
            <span class="text-[12px] font-mono truncate">{{ selectedFile.fileName }}</span>
            <ResourceLayerBadge :layer="selectedSkill.layer" />
          </div>
          <div
            v-if="selectedSkill.rootPath"
            class="resource-browser-editor-path px-4 py-1.5 border-b text-[11px] font-mono truncate shrink-0"
            :title="`${selectedSkill.rootPath}/${selectedFile.fileName}`"
          >
            {{ selectedSkill.rootPath }}/{{ selectedFile.fileName }}
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
        <div v-else class="resource-browser-empty h-full flex items-center justify-center text-[13px]">
          选择 {{ kind === 'skills' ? 'Skill' : 'Extension' }} 与文件
        </div>
      </div>
    </template>

    <!-- Prompts: flat file list -->
    <template v-else>
      <div class="resource-browser-sidebar w-56 shrink-0 border-r overflow-y-auto custom-scrollbar flex flex-col min-h-0">
        <div class="flex-1 min-h-0 overflow-y-auto">
          <div
            v-for="item in fileItems"
            :key="item.id"
            class="resource-browser-item px-3 py-2.5 cursor-pointer transition-colors flex items-start gap-1"
            :class="selectedFileItemId === item.id ? 'resource-browser-item--active' : 'resource-browser-item--idle'"
            @click="selectedFileItemId = item.id"
          >
            <ResourceFileListItem :item="item" />
            <ResourceLayerBadge :layer="item.layer" />
          </div>
          <div v-if="fileItems.length === 0" class="resource-browser-empty px-3 py-8 text-[12px] text-center">暂无</div>
        </div>
      </div>

      <div class="resource-browser-main flex-1 overflow-hidden p-5 min-w-0 flex flex-col">
        <div
          v-if="selectedFileItem"
          class="resource-browser-editor flex-1 min-h-[200px] border rounded-sm flex flex-col overflow-hidden"
        >
          <div class="resource-browser-editor-header px-4 py-2.5 border-b flex items-center gap-2 min-w-0 shrink-0">
            <span class="text-[12px] truncate">{{ getFileBaseName(selectedFileItem.fileName) }}</span>
            <ResourceLayerBadge :layer="selectedFileItem.layer" />
          </div>
          <div
            v-if="selectedFileItem.layer === 'global'"
            class="resource-browser-editor-path px-4 py-1.5 border-b text-[11px] font-mono truncate shrink-0"
            :title="selectedFileItem.path"
          >
            {{ selectedFileItem.path }}
          </div>
          <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
            <ResourceContentView
              :key="selectedFileItem.id"
              :content="selectedFileItem.content"
              :kind="selectedFileItem.kind"
            />
          </div>
        </div>
        <div v-else class="resource-browser-empty h-full flex items-center justify-center text-[13px]">
          选择文件
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ExtensionInstallBox from './ExtensionInstallBox.vue'
import GlobalResourceLinkBar from './GlobalResourceLinkBar.vue'
import ResourceContentView from './ResourceContentView.vue'
import ResourceFileListItem from './ResourceFileListItem.vue'
import ResourceLayerBadge from './ResourceLayerBadge.vue'
import SkillFileTree from './SkillFileTree.vue'
import SkillListItem from './SkillListItem.vue'
import { useAgentStore, useResourceStore } from '@/store'
import {
  agentResourcesToUiItems,
  getLinkedResourcesForAgent,
  getResourcesByKind,
} from '@/utils/resources-ui'
import { getSkillFileLanguage, getFileBaseName, isFileItem, isSkillItem, resourceEntryPath } from '@/utils/resource-utils'
import { getDefaultWorkspaceCwd } from '@/config/workspace'
import type { UIResourceItem, UIResourceKind, UISkillItem, UIFileItem } from '@/types/ui'

const props = defineProps<{
  agentId: string
  kind: UIResourceKind
}>()

const agentStore = useAgentStore()
const resourceStore = useResourceStore()
const agentItems = ref<UIResourceItem[]>([])

const selectedSkillId = ref<string | null>(null)
const selectedFileId = ref<string | null>(null)
const selectedFileItemId = ref<string | null>(null)

watch(
  () => props.agentId,
  async (id) => {
    await reloadAgentItems(id)
  },
  { immediate: true },
)

const unlinkedGlobal = computed(() => {
  const global = getResourcesByKind(resourceStore.resourceItems, props.kind)
  const linked = new Set(items.value.map((item) => resourceEntryPath(item)).filter(Boolean))
  return global.filter((item) => {
    const path = resourceEntryPath(item)
    return path && !linked.has(path)
  })
})

async function reloadAgentItems(id: string) {
  await agentStore.fetchAgentResources(id, getDefaultWorkspaceCwd())
  const res = agentStore.agentResources[id]
  agentItems.value = res ? agentResourcesToUiItems(id, res) : []
}

async function refreshAfterInstall(_id: string) {
  await resourceStore.fetchGlobalResources()
  await reloadAgentItems(props.agentId)
  resetSelection()
}

async function refreshAfterUninstall(_id: string) {
  await resourceStore.fetchGlobalResources()
  await reloadAgentItems(props.agentId)
  resetSelection()
}

async function linkGlobalItem(item: UIResourceItem) {
  const path = resourceEntryPath(item)
  if (!path) return
  await agentStore.linkAgentResource(props.agentId, props.kind, path)
  await reloadAgentItems(props.agentId)
  resetSelection()
}

const items = computed(() =>
  getLinkedResourcesForAgent(props.agentId, agentItems.value, resourceStore.resourceItems).filter(
    (r) => r.kind === props.kind,
  ),
)

const skillOrExtItems = computed(() => {
  if (props.kind === 'skills') {
    return items.value.filter(isSkillItem)
  }
  if (props.kind === 'extensions') {
    return items.value.filter(isFileItem)
  }
  return []
})

const fileItems = computed(() => items.value.filter(isFileItem))

const selectedSkill = computed(() => {
  if (props.kind === 'extensions') {
    const id = selectedSkillId.value
    if (!id) return undefined
    const item = items.value.find((r) => r.id === id)
    if (item && isFileItem(item) && item.files && item.files.length > 0) {
      // Treat extension with files like a skill
      return { ...item, files: item.files as any } as unknown as UISkillItem
    }
    return undefined
  }
  const id = selectedSkillId.value
  if (!id) return undefined
  const item = items.value.find((r) => r.id === id)
  return item && isSkillItem(item) ? item : undefined
})

const selectedFile = computed(() => {
  const skill = selectedSkill.value
  const fileId = selectedFileId.value
  if (!skill || !fileId) return undefined
  return skill.files.find((f) => f.id === fileId)
})

const selectedFileItem = computed(() => {
  // For extensions with files, selectedFile handles it
  if (props.kind === 'extensions') {
    const skill = selectedSkill.value
    if (skill) return undefined
  }
  const id = selectedFileItemId.value
  if (!id) return undefined
  return fileItems.value.find((r) => r.id === id)
})

function selectSkill(id: string) {
  selectedSkillId.value = id
  if (props.kind === 'extensions') {
    const item = items.value.find((r) => r.id === id)
    if (item && isFileItem(item) && item.files && item.files.length > 0) {
      selectedFileId.value = item.files[0].id ?? null
      return
    }
  }
  const skill = items.value.find((r) => r.id === id)
  if (skill && isSkillItem(skill)) {
    selectedFileId.value = skill.files[0]?.id ?? null
  }
}

function resetSelection() {
  if (props.kind === 'skills' || props.kind === 'extensions') {
    const firstSkillOrExt = items.value.find((item) => {
      if (props.kind === 'skills') return isSkillItem(item)
      if (props.kind === 'extensions' && isFileItem(item)) {
        return item.files && item.files.length > 0
      }
      return false
    })
    if (firstSkillOrExt) {
      selectedSkillId.value = firstSkillOrExt.id
      const asSkill = firstSkillOrExt as UISkillItem
      selectedFileId.value = asSkill.files[0]?.id ?? null
    } else {
      selectedSkillId.value = null
      selectedFileId.value = null
    }
    selectedFileItemId.value = null
  } else {
    selectedSkillId.value = null
    selectedFileId.value = null
    selectedFileItemId.value = fileItems.value[0]?.id ?? null
  }
}

watch(
  () => [props.agentId, props.kind] as const,
  () => resetSelection(),
  { immediate: true },
)
</script>

<style scoped>
.resource-browser-sidebar {
  background: var(--app-resource-sidebar-bg);
  border-color: var(--app-border);
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
</style>
