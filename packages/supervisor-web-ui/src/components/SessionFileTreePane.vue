<template>
  <div class="session-file-tree-pane flex flex-col h-full min-h-0 overflow-hidden">
    <div
      class="px-3 py-2 text-[11px] shrink-0 flex items-center gap-2"
      style="color: var(--app-text-muted); border-bottom: 1px solid var(--app-border-subtle)"
    >
      <span class="flex-1 min-w-0 truncate">{{ fileCount }} 个文件</span>
      <button
        v-if="showRefresh"
        type="button"
        class="session-file-tree-pane__icon-btn"
        title="刷新"
        @click="$emit('refresh')"
      >
        <RefreshCw class="w-3.5 h-3.5" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-1 py-1">
      <div
        v-if="loading && !treeNodes.length"
        class="py-10 text-center text-[13px]"
        style="color: var(--app-text-muted)"
      >
        加载中…
      </div>
      <div
        v-else-if="listError"
        class="py-10 text-center text-[13px] px-3"
        style="color: var(--app-danger, #ef4444)"
      >
        {{ listError }}
      </div>
      <div
        v-else-if="!treeNodes.length"
        class="py-10 text-center text-[13px]"
        style="color: var(--app-text-muted)"
      >
        暂无文件
      </div>
      <BaseTree v-else v-model="localNodes" :indent="14" :default-open="defaultOpen">
        <template #default="{ node, stat }">
          <div
            class="file-tree-row flex items-center gap-1 min-w-0 py-0.5 pr-2 rounded-sm transition-colors"
            :class="isSelectedFile(node) ? 'file-tree-row--selected' : 'file-tree-row--idle'"
          >
            <button
              v-if="node.children?.length"
              type="button"
              class="shrink-0 w-4 h-4 flex items-center justify-center"
              style="color: var(--app-text-muted)"
              @click.stop="stat.open = !stat.open"
            >
              <ChevronRight
                class="w-3 h-3 transition-transform"
                :class="stat.open ? 'rotate-90' : ''"
              />
            </button>
            <span v-else class="w-4 shrink-0" />
            <button
              type="button"
              class="flex items-center gap-1.5 min-w-0 flex-1 text-left py-0.5"
              :class="node.filePath || node.children?.length ? 'cursor-pointer' : 'cursor-default'"
              @click="onNodeClick(node, stat)"
            >
              <Folder
                v-if="node.children?.length"
                class="w-3.5 h-3.5 shrink-0 text-amber-500/80"
              />
              <FileText v-else class="w-3.5 h-3.5 shrink-0 text-sky-500/80" />
              <span
                class="truncate font-mono text-[12px]"
                :class="nodeChangeStatus(node) === 'deleted' ? 'line-through opacity-70' : ''"
                >{{ node.text }}</span
              >
              <small
                v-if="node.filePath && nodeChangeStatus(node)"
                class="file-tree-status shrink-0"
                :class="`file-tree-status--${nodeChangeStatus(node)}`"
                >{{ changeStatusLabel(nodeChangeStatus(node)!) }}</small
              >
            </button>
          </div>
        </template>
      </BaseTree>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { BaseTree } from "@he-tree/vue";
import "@he-tree/vue/style/default.css";
import { ChevronRight, FileText, Folder, RefreshCw } from "lucide-vue-next";
import type { SessionChangedFileView } from "./chat/SessionChangesPopover.vue";
import {
  changeStatusLabel,
  type SessionFileTreeNode,
} from "@/utils/session-file-tree";

const props = withDefaults(
  defineProps<{
    treeNodes: SessionFileTreeNode[];
    selectedPath?: string | null;
    loading?: boolean;
    listError?: string | null;
    changedFiles?: SessionChangedFileView[];
    showRefresh?: boolean;
    /** When true, directories start expanded (PC sidebar). */
    defaultOpen?: boolean;
  }>(),
  {
    selectedPath: null,
    loading: false,
    listError: null,
    showRefresh: false,
    defaultOpen: false,
  },
);

const emit = defineEmits<{
  select: [path: string];
  refresh: [];
}>();

const localNodes = ref<SessionFileTreeNode[]>([]);

watch(
  () => props.treeNodes,
  (nodes) => {
    localNodes.value = nodes;
  },
  { immediate: true, deep: true },
);

const changeStatusMap = computed(() => {
  const map = new Map<string, SessionChangedFileView["status"]>();
  for (const file of props.changedFiles ?? []) {
    if (file?.path) map.set(file.path.replace(/\\/g, "/"), file.status);
  }
  return map;
});

const fileCount = computed(() => {
  let count = 0;
  const walk = (nodes: SessionFileTreeNode[]) => {
    for (const node of nodes) {
      if (node.filePath) count += 1;
      if (node.children?.length) walk(node.children);
    }
  };
  walk(props.treeNodes);
  return count;
});

function nodeChangeStatus(node: SessionFileTreeNode): SessionChangedFileView["status"] | undefined {
  if (!node.filePath) return undefined;
  return changeStatusMap.value.get(node.filePath.replace(/\\/g, "/"));
}

function onNodeClick(node: SessionFileTreeNode, stat: { open: boolean }) {
  if (node.children?.length) {
    stat.open = !stat.open;
    return;
  }
  if (!node.filePath) return;
  emit("select", node.filePath);
}

function isSelectedFile(node: SessionFileTreeNode): boolean {
  if (!node.filePath || !props.selectedPath) return false;
  const normalize = (path: string) => path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  return normalize(node.filePath) === normalize(props.selectedPath);
}
</script>

<style scoped>
.session-file-tree-pane :deep(.he-tree) {
  --he-tree-node-padding: 2px 0;
}

.session-file-tree-pane__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border-radius: 4px;
  color: var(--app-text-secondary);
}

.session-file-tree-pane__icon-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.file-tree-row--idle {
  color: var(--app-text-secondary);
}

.file-tree-row--idle:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.file-tree-row--selected {
  box-shadow: inset 3px 0 0 var(--app-accent);
  background: color-mix(in srgb, var(--app-accent) 24%, var(--app-settings-bg));
  color: var(--app-text-primary);
}

.file-tree-row--selected .text-sky-500\/80 {
  color: var(--app-accent);
}

.file-tree-status {
  width: 18px;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
}

.file-tree-status--added {
  color: #07a65a;
}

.file-tree-status--modified {
  color: #d69e2e;
}

.file-tree-status--deleted {
  color: #e05a67;
}
</style>
