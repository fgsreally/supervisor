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
        :style="{ '--session-tree-width': `${treePaneWidth}px` }"
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
          <BaseTree v-else v-model="treeNodes" :indent="14">
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

      <div
        class="session-files-panel__resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整文件树宽度"
        @pointerdown="startTreeResize"
      />

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
            <nav class="file-breadcrumb flex-1 min-w-0" :title="selectedPath">
              <template v-for="(segment, index) in breadcrumbSegments" :key="`${segment}-${index}`">
                <ChevronRight v-if="index > 0" class="file-breadcrumb__separator" />
                <span
                  class="file-breadcrumb__segment"
                  :class="{
                    'file-breadcrumb__segment--current': index === breadcrumbSegments.length - 1,
                  }"
                  >{{ segment }}</span
                >
              </template>
            </nav>
            <span v-if="preview" class="text-[11px] shrink-0" style="color: var(--app-text-muted)">
              {{ formatSize(preview.size) }}<template v-if="preview.truncated"> · 已截断</template>
            </span>
          </div>
          <div
            class="session-files-panel__preview-scroll flex-1 min-h-0 overflow-auto custom-scrollbar"
          >
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
              <div v-else-if="preview.content != null" class="p-4 session-file-code">
                <MarkdownContent :content="highlightedPreviewMarkdown" variant="terminal" />
              </div>
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
  initialPath?: string | null;
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
const breadcrumbSegments = computed(() => selectedPath.value?.split("/").filter(Boolean) ?? []);
const treePaneWidth = ref(Number(localStorage.getItem("pi-supervisor:file-tree-width")) || 280);
let stopTreeResize: (() => void) | null = null;

function startTreeResize(event: PointerEvent) {
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = treePaneWidth.value;
  const onMove = (moveEvent: PointerEvent) => {
    treePaneWidth.value = Math.min(520, Math.max(180, startWidth + moveEvent.clientX - startX));
  };
  const onUp = () => {
    localStorage.setItem("pi-supervisor:file-tree-width", String(treePaneWidth.value));
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
const highlightedPreviewMarkdown = computed(() => {
  if (!preview.value) return "";
  const language = preview.value.language || (preview.value.kind === "json" ? "json" : "text");
  return `\`\`\`${language}\n${formatTextContent(preview.value)}\n\`\`\``;
});

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
  if (
    (file.kind === "image" || file.kind === "pdf") &&
    file.encoding === "base64" &&
    file.content
  ) {
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

function normalizeRequestedPath(rawPath: string): string | null {
  let value = rawPath
    .trim()
    .replace(/^file:\/\//i, "")
    .replace(/\\/g, "/");
  value = value.replace(/[?#].*$/, "").replace(/:(\d+)(?::\d+)?$/, "");
  if (/^\/[A-Za-z]:\//.test(value)) value = value.slice(1);
  const normalizedCwd = cwd.value.replace(/\\/g, "/").replace(/\/$/, "");
  if (normalizedCwd && value.toLowerCase().startsWith(`${normalizedCwd.toLowerCase()}/`)) {
    value = value.slice(normalizedCwd.length + 1);
  }
  value = value.replace(/^\.\//, "").replace(/^\//, "");
  const paths = files.value
    .filter((file) => !file.isDirectory)
    .map((file) => file.path.replace(/\\/g, "/"));
  const exact = paths.find((path) => path.toLowerCase() === value.toLowerCase());
  if (exact) return exact;
  const suffix = paths
    .filter((path) => value.toLowerCase().endsWith(`/${path.toLowerCase()}`))
    .sort((left, right) => right.length - left.length)[0];
  if (suffix) return suffix;
  const base = value.split("/").pop();
  const basenameMatches = paths.filter((path) => path.split("/").pop() === base);
  return basenameMatches.length === 1 ? basenameMatches[0]! : null;
}

function openRequestedPath(rawPath: string) {
  const path = normalizeRequestedPath(rawPath);
  if (!path) {
    previewError.value = `文件不在当前会话工作区：${rawPath}`;
    return;
  }
  selectedPath.value = path;
  void loadPreview(path);
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
    if (props.initialPath) openRequestedPath(props.initialPath);
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

watch(
  () => props.initialPath,
  (path) => {
    if (!path || files.value.length === 0) return;
    openRequestedPath(path);
  },
);

onBeforeUnmount(() => {
  stopTreeResize?.();
  revokeImageUrl();
});
</script>

<style scoped>
.session-files-panel__tree {
  height: 42%;
  width: 100%;
}

.session-files-panel__resize-handle {
  display: none;
}

.session-file-code {
  min-width: max-content;
}

.session-file-code :deep(.md-term-pre) {
  width: max-content;
  min-width: 100%;
  overflow: visible;
}

@media (min-width: 768px) {
  .session-files-panel__tree {
    height: 100%;
    width: min(var(--session-tree-width, 280px), 55%);
  }

  .session-files-panel__resize-handle {
    display: block;
    width: 5px;
    margin-left: -3px;
    margin-right: -2px;
    cursor: col-resize;
    z-index: 2;
    background: transparent;
  }

  .session-files-panel__resize-handle:hover,
  .session-files-panel__resize-handle:active {
    background: var(--app-accent);
  }
}

.file-breadcrumb {
  display: flex;
  align-items: center;
  overflow-x: auto;
  white-space: nowrap;
  color: var(--app-text-muted);
  font:
    12px/1.4 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  scrollbar-width: none;
}

.file-breadcrumb::-webkit-scrollbar {
  display: none;
}

.file-breadcrumb__separator {
  width: 13px;
  height: 13px;
  flex: none;
  margin: 0 2px;
}

.file-breadcrumb__segment--current {
  color: var(--app-text-primary);
  font-weight: 600;
}

.session-files-panel__preview-scroll {
  scrollbar-width: auto;
  scrollbar-color: color-mix(in srgb, var(--app-text-muted) 70%, transparent) transparent;
}

.session-files-panel__preview-scroll::-webkit-scrollbar:horizontal {
  height: 14px;
}

.session-files-panel__preview-scroll::-webkit-scrollbar-thumb {
  min-width: 44px;
  border: 3px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text-muted) 72%, transparent);
  background-clip: padding-box;
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
