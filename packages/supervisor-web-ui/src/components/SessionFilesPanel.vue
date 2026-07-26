<template>
  <div
    class="session-files-panel flex flex-col h-full w-full overflow-hidden"
    style="background: var(--app-settings-bg)"
  >
    <div
      class="h-14 md:h-16 border-b flex items-center px-4 shrink-0 gap-3"
      style="background: var(--app-settings-bg); border-color: var(--app-border)"
    >
      <button
        type="button"
        class="p-1.5 rounded-md"
        style="color: var(--app-text-secondary)"
        @click="$emit('close')"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>
      <div class="flex-1 min-w-0">
        <div class="text-[16px] font-medium" style="color: var(--app-text-primary)">工作区文件</div>
        <div
          v-if="cwd"
          class="text-[11px] truncate font-mono"
          style="color: var(--app-text-muted)"
          :title="cwd"
        >
          {{ cwd }}
        </div>
      </div>
      <button
        type="button"
        class="p-1.5 rounded-md"
        style="color: var(--app-text-secondary)"
        title="刷新"
        @click="refresh"
      >
        <RefreshCw class="w-4 h-4" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>

    <div class="flex-1 min-h-0 flex flex-col md:flex-row">
      <div
        class="session-files-panel__tree border-b md:border-b-0 md:border-r shrink-0 overflow-hidden flex flex-col"
        style="border-color: var(--app-border)"
      >
        <div
          class="px-3 py-2 text-[11px] shrink-0"
          style="color: var(--app-text-muted); border-bottom: 1px solid var(--app-border-subtle)"
        >
          {{ fileCount }} 个文件
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
          <BaseTree v-else v-model="treeNodes" :indent="14" default-open>
            <template #default="{ node, stat }">
              <div
                class="file-tree-row flex items-center gap-1 min-w-0 py-0.5 pr-2 rounded-sm transition-colors"
                :class="
                  node.filePath && node.filePath === selectedPath
                    ? 'file-tree-row--selected'
                    : 'file-tree-row--idle'
                "
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
                  :class="node.filePath ? 'cursor-pointer' : 'cursor-default'"
                  @click="onNodeClick(node)"
                >
                  <Folder
                    v-if="node.children?.length"
                    class="w-3.5 h-3.5 shrink-0 text-amber-500/80"
                  />
                  <FileText v-else class="w-3.5 h-3.5 shrink-0 text-sky-500/80" />
                  <span class="truncate font-mono text-[12px]">{{ node.text }}</span>
                </button>
              </div>
            </template>
          </BaseTree>
        </div>
      </div>

      <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div
          v-if="!selectedPath"
          class="flex-1 flex items-center justify-center text-[13px] px-4 text-center"
          style="color: var(--app-text-muted)"
        >
          选择左侧文件以预览内容
        </div>
        <template v-else>
          <div
            class="px-4 py-2 border-b flex items-center gap-2 shrink-0"
            style="border-color: var(--app-border-subtle)"
          >
            <span
              class="text-[12px] font-mono truncate flex-1"
              style="color: var(--app-text-primary)"
              :title="selectedPath"
            >
              {{ selectedPath }}
            </span>
            <span
              v-if="preview"
              class="text-[11px] shrink-0"
              style="color: var(--app-text-muted)"
            >
              {{ formatSize(preview.size)
              }}<template v-if="preview.truncated"> · 已截断</template>
            </span>
          </div>
          <div class="flex-1 min-h-0 overflow-auto custom-scrollbar">
            <div
              v-if="previewLoading"
              class="py-12 text-center text-[13px]"
              style="color: var(--app-text-muted)"
            >
              读取中…
            </div>
            <div
              v-else-if="previewError"
              class="py-12 text-center text-[13px] px-4"
              style="color: var(--app-danger, #ef4444)"
            >
              {{ previewError }}
            </div>
            <template v-else-if="preview">
              <img
                v-if="preview.kind === 'image' && imageUrl"
                :src="imageUrl"
                :alt="preview.path"
                class="max-w-full h-auto p-4 mx-auto"
              />
              <iframe
                v-else-if="preview.kind === 'pdf' && imageUrl"
                :src="imageUrl"
                class="w-full h-full min-h-[420px] border-0"
                title="PDF preview"
              />
              <div v-else-if="preview.kind === 'markdown' && preview.content != null" class="p-4">
                <MarkdownContent :content="preview.content" prose />
              </div>
              <pre
                v-else-if="preview.content != null"
                class="p-4 text-[12px] font-mono whitespace-pre-wrap break-all leading-relaxed m-0"
                style="color: var(--app-text-primary)"
                >{{ formatTextContent(preview) }}</pre
              >
              <div
                v-else
                class="py-12 text-center text-[13px] px-4"
                style="color: var(--app-text-muted)"
              >
                二进制文件，暂不支持预览（{{ formatSize(preview.size) }}）
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { BaseTree } from "@he-tree/vue";
import "@he-tree/vue/style/default.css";
import { ChevronLeft, ChevronRight, FileText, Folder, RefreshCw } from "lucide-vue-next";
import {
  getSessionFileContent,
  getSessionFiles,
  type SessionFileContent,
  type SessionWorkspaceFileEntry,
} from "@/api";
import MarkdownContent from "./MarkdownContent.vue";

interface FileTreeNode {
  id: string;
  text: string;
  children?: FileTreeNode[];
  filePath?: string;
}

const props = defineProps<{
  sessionId: string;
}>();

defineEmits<{ close: [] }>();

const cwd = ref("");
const files = ref<SessionWorkspaceFileEntry[]>([]);
const treeNodes = ref<FileTreeNode[]>([]);
const loading = ref(false);
const listError = ref<string | null>(null);
const selectedPath = ref<string | null>(null);
const preview = ref<SessionFileContent | null>(null);
const previewLoading = ref(false);
const previewError = ref<string | null>(null);
const imageUrl = ref<string | null>(null);

const fileCount = computed(() => files.value.filter((f) => !f.isDirectory).length);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTextContent(file: SessionFileContent): string {
  if (file.content == null) return "";
  if (file.kind === "json") {
    try {
      return JSON.stringify(JSON.parse(file.content), null, 2);
    } catch {
      return file.content;
    }
  }
  return file.content;
}

function buildTree(entries: SessionWorkspaceFileEntry[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const fileEntries = entries.filter((e) => !e.isDirectory);

  for (const file of fileEntries) {
    const segments = file.path.replace(/\\/g, "/").split("/").filter(Boolean);
    let level = root;
    let pathSoFar = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLeaf = i === segments.length - 1;
      pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
      let node = level.find((n) => n.text === segment);
      if (!node) {
        node = {
          id: pathSoFar,
          text: segment,
          ...(isLeaf ? { filePath: file.path.replace(/\\/g, "/") } : { children: [] }),
        };
        level.push(node);
      } else if (isLeaf) {
        node.filePath = file.path.replace(/\\/g, "/");
      }
      if (!isLeaf) {
        if (!node.children) node.children = [];
        level = node.children;
      }
    }
  }

  return sortTree(root);
}

function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  const folders = nodes
    .filter((n) => n.children?.length)
    .sort((a, b) => a.text.localeCompare(b.text));
  const leaves = nodes
    .filter((n) => !n.children?.length)
    .sort((a, b) => a.text.localeCompare(b.text));
  for (const folder of folders) {
    if (folder.children) folder.children = sortTree(folder.children);
  }
  return [...folders, ...leaves];
}

function revokeImageUrl() {
  if (imageUrl.value?.startsWith("blob:")) {
    URL.revokeObjectURL(imageUrl.value);
  }
  imageUrl.value = null;
}

function setBinaryPreview(file: SessionFileContent) {
  revokeImageUrl();
  if ((file.kind === "image" || file.kind === "pdf") && file.encoding === "base64" && file.content) {
    const binary = atob(file.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: file.mimeType });
    imageUrl.value = URL.createObjectURL(blob);
  }
}

async function loadPreview(path: string) {
  previewLoading.value = true;
  previewError.value = null;
  preview.value = null;
  revokeImageUrl();
  try {
    const file = await getSessionFileContent(props.sessionId, path);
    preview.value = file;
    setBinaryPreview(file);
  } catch (e: unknown) {
    previewError.value = e instanceof Error ? e.message : String(e);
  } finally {
    previewLoading.value = false;
  }
}

function onNodeClick(node: FileTreeNode) {
  if (!node.filePath) return;
  selectedPath.value = node.filePath;
  void loadPreview(node.filePath);
}

async function refresh() {
  loading.value = true;
  listError.value = null;
  try {
    const result = await getSessionFiles(props.sessionId);
    cwd.value = result.cwd;
    files.value = result.files;
    treeNodes.value = buildTree(result.files);
  } catch (e: unknown) {
    files.value = [];
    treeNodes.value = [];
    listError.value = e instanceof Error ? e.message : "加载文件树失败";
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.sessionId,
  (id) => {
    selectedPath.value = null;
    preview.value = null;
    previewError.value = null;
    revokeImageUrl();
    if (id) void refresh();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  revokeImageUrl();
});
</script>

<style scoped>
.session-files-panel__tree {
  height: 42%;
  width: 100%;
}

@media (min-width: 768px) {
  .session-files-panel__tree {
    height: 100%;
    width: min(280px, 38%);
  }
}

.session-files-panel :deep(.he-tree) {
  --he-tree-node-padding: 2px 0;
}

.file-tree-row--idle {
  color: var(--app-text-secondary);
}

.file-tree-row--idle:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.file-tree-row--selected {
  background: color-mix(in srgb, var(--app-accent) 16%, transparent);
  color: var(--app-text-primary);
}
</style>
