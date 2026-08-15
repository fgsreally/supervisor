<template>
  <aside class="session-file-tree-sidebar" :style="{ width: `${treePaneWidth}px` }">
    <div
      class="session-file-tree-sidebar__resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整文件树宽度"
      @pointerdown="startTreeResize"
    />
    <div class="session-file-tree-sidebar__header">
      <button
        type="button"
        class="session-file-tree-sidebar__icon-btn"
        title="折叠文件树"
        @click="$emit('close')"
      >
        <PanelRightClose class="w-4 h-4" />
      </button>
      <button
        type="button"
        class="session-file-tree-sidebar__icon-btn"
        title="刷新"
        @click="refresh"
      >
        <RefreshCw class="w-4 h-4" :class="loading ? 'animate-spin' : ''" />
      </button>
      <div class="session-file-tree-sidebar__title min-w-0 flex-1">工作区文件</div>
    </div>
    <SessionFileTreePane
      class="session-file-tree-sidebar__tree"
      :tree-nodes="treeNodes"
      :selected-path="selectedPath"
      :loading="loading"
      :list-error="listError"
      :changed-files="changedFiles"
      default-open
      @select="$emit('select', $event)"
      @refresh="refresh"
    />
  </aside>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { PanelRightClose, RefreshCw } from "lucide-vue-next";
import { getSessionFiles, type SessionWorkspaceFileEntry } from "@/api";
import type { SessionChangedFileView } from "./chat/SessionChangesPopover.vue";
import SessionFileTreePane from "./SessionFileTreePane.vue";
import { buildSessionFileTree, type SessionFileTreeNode } from "@/utils/session-file-tree";

const props = defineProps<{
  sessionId: string;
  selectedPath?: string | null;
  changedFiles?: SessionChangedFileView[];
}>();

defineEmits<{
  select: [path: string];
  close: [];
}>();

const files = ref<SessionWorkspaceFileEntry[]>([]);
const treeNodes = ref<SessionFileTreeNode[]>([]);
const loading = ref(false);
const listError = ref<string | null>(null);
const treePaneWidth = ref(
  Math.min(
    260,
    Math.max(120, Number(localStorage.getItem("pi-supervisor:file-tree-width-v2")) || 160),
  ),
);
let stopTreeResize: (() => void) | null = null;

function startTreeResize(event: PointerEvent) {
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = treePaneWidth.value;
  const onMove = (moveEvent: PointerEvent) => {
    treePaneWidth.value = Math.min(260, Math.max(120, startWidth + (startX - moveEvent.clientX)));
  };
  const onUp = () => {
    localStorage.setItem("pi-supervisor:file-tree-width-v2", String(treePaneWidth.value));
    stopTreeResize?.();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
  stopTreeResize = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    stopTreeResize = null;
  };
}

async function refresh() {
  loading.value = true;
  listError.value = null;
  try {
    const result = await getSessionFiles(props.sessionId);
    files.value = result.files;
    treeNodes.value = buildSessionFileTree(result.files, props.changedFiles);
  } catch (e: unknown) {
    files.value = [];
    treeNodes.value = [];
    listError.value = e instanceof Error ? e.message : "加载文件树失败";
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.changedFiles,
  () => {
    if (files.value.length > 0 || (props.changedFiles?.length ?? 0) > 0) {
      treeNodes.value = buildSessionFileTree(files.value, props.changedFiles);
    }
  },
  { deep: true },
);

watch(
  () => props.sessionId,
  (id) => {
    if (id) void refresh();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopTreeResize?.();
});
</script>

<style scoped>
.session-file-tree-sidebar {
  position: relative;
  display: flex;
  flex: none;
  flex-direction: column;
  min-width: 120px;
  max-width: 260px;
  height: 100%;
  border-left: 1px solid var(--app-border-subtle);
  background: var(--app-settings-bg);
}

.session-file-tree-sidebar__resize {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  z-index: 2;
  width: 5px;
  cursor: col-resize;
  background: transparent;
}

.session-file-tree-sidebar__resize:hover,
.session-file-tree-sidebar__resize:active {
  background: var(--app-accent);
}

.session-file-tree-sidebar__header {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: 48px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--app-border);
}

.session-file-tree-sidebar__title {
  overflow: hidden;
  color: var(--app-text-primary);
  font-size: var(--app-font-control);
  font-weight: var(--app-font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-file-tree-sidebar__icon-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 6px;
  color: var(--app-text-secondary);
}

.session-file-tree-sidebar__icon-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.session-file-tree-sidebar__tree {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
