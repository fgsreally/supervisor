<template>
  <div class="skill-file-tree h-full min-h-0 overflow-y-auto custom-scrollbar text-[12px]">
    <BaseTree v-model="treeNodes" :indent="14" default-open>
      <template #default="{ node, stat }">
        <div
          class="skill-tree-row flex items-center gap-1 min-w-0 py-0.5 pr-2 rounded-sm transition-colors"
          :class="node.fileId && node.fileId === selectedFileId ? 'skill-tree-row--selected' : 'skill-tree-row--idle'"
        >
          <button
            v-if="node.children?.length"
            type="button"
            class="shrink-0 w-4 h-4 flex items-center justify-center skill-tree-toggle"
            @click.stop="stat.open = !stat.open"
          >
            <ChevronRight class="w-3 h-3 transition-transform" :class="stat.open ? 'rotate-90' : ''" />
          </button>
          <span v-else class="w-4 shrink-0" />
          <button
            type="button"
            class="flex items-center gap-1.5 min-w-0 flex-1 text-left py-0.5"
            :class="node.fileId ? 'cursor-pointer' : 'cursor-default'"
            @click="onNodeClick(node)"
          >
            <Folder v-if="node.children?.length" class="w-3.5 h-3.5 shrink-0 text-amber-500/80" />
            <FileText v-else class="w-3.5 h-3.5 shrink-0 text-sky-500/80" />
            <span class="truncate font-mono">{{ node.text }}</span>
          </button>
        </div>
      </template>
    </BaseTree>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { BaseTree } from '@he-tree/vue'
import '@he-tree/vue/style/default.css'
import { ChevronRight, FileText, Folder } from 'lucide-vue-next'
import type { UISkillFile } from '@/types/ui'
import { buildSkillFileTree, type SkillTreeNode } from '../utils/skill-file-tree'

const props = defineProps<{
  files: UISkillFile[]
  selectedFileId: string | null
}>()

const emit = defineEmits<{
  select: [fileId: string]
}>()

const treeNodes = ref<SkillTreeNode[]>([])

watch(
  () => props.files,
  (files) => {
    treeNodes.value = buildSkillFileTree(files)
  },
  { immediate: true },
)

function onNodeClick(node: SkillTreeNode) {
  if (node.fileId) emit('select', node.fileId)
}
</script>

<style scoped>
.skill-file-tree :deep(.he-tree) {
  --he-tree-node-padding: 2px 0;
}

.skill-tree-row--idle {
  color: var(--app-text-secondary);
}

.skill-tree-row--idle:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.skill-tree-row--selected {
  background: color-mix(in srgb, var(--app-accent) 16%, transparent);
  color: var(--app-text-primary);
}

.skill-tree-toggle {
  color: var(--app-text-muted);
}

.skill-tree-toggle:hover {
  color: var(--app-text-secondary);
}
</style>
