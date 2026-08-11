<template>
  <div
    class="session-files-panel flex flex-col h-full w-full overflow-hidden"
    style="background: var(--app-settings-bg)"
  >
    <div
      v-if="!mobile"
      class="h-14 md:h-16 border-b flex items-center px-4 shrink-0 gap-3"
      style="background: var(--app-settings-bg); border-color: var(--app-border)"
    >
      <button
        type="button"
        class="p-1.5 rounded-md md:hidden"
        style="color: var(--app-text-secondary)"
        title="文件目录"
        @click="treeDrawerOpen = true"
      >
        <FolderTree class="w-5 h-5" />
      </button>
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

    <div class="session-files-panel__body flex-1 min-h-0 flex flex-col md:flex-row relative">
      <div
        v-if="treeDrawerOpen"
        class="session-files-panel__tree-backdrop md:hidden"
        @click="treeDrawerOpen = false"
      />
      <div
        class="session-files-panel__tree border-b md:border-b-0 md:border-r shrink-0 overflow-hidden flex flex-col"
        :class="{ 'session-files-panel__tree--open': treeDrawerOpen }"
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
          <BaseTree v-else v-model="treeNodes" :indent="14" :default-open="false">
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
                  :class="
                    node.filePath || node.children?.length ? 'cursor-pointer' : 'cursor-default'
                  "
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
                    >{{ statusLabel(nodeChangeStatus(node)!) }}</small
                  >
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
          v-if="showFileAreaLoading"
          class="flex-1 flex flex-col items-center justify-center gap-2 text-[13px]"
          style="color: var(--app-text-muted)"
        >
          <Loader2 class="w-5 h-5 animate-spin" />
          <span>读取中…</span>
        </div>
        <div
          v-else-if="previewError && !selectedPath"
          class="flex-1 flex flex-col items-center justify-center gap-3 text-[13px] px-4 text-center"
          style="color: var(--app-danger, #ef4444)"
        >
          {{ previewError }}
        </div>
        <div
          v-else-if="!selectedPath"
          class="flex-1 flex flex-col items-center justify-center gap-3 text-[13px] px-4 text-center"
          style="color: var(--app-text-muted)"
        >
          <span>选择文件以预览内容</span>
          <button
            v-if="mobile"
            type="button"
            class="session-files-panel__browse-btn"
            @click="treeDrawerOpen = true"
          >
            浏览文件
          </button>
        </div>
        <template v-else>
          <div
            class="px-3 md:px-4 py-2 border-b flex items-center gap-2 shrink-0"
            style="border-color: var(--app-border-subtle)"
          >
            <button
              v-if="mobile"
              type="button"
              class="session-files-panel__toolbar-btn shrink-0"
              title="文件目录"
              @click="treeDrawerOpen = true"
            >
              <FolderTree class="w-4 h-4" />
            </button>
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
            <button
              v-if="mobile"
              type="button"
              class="session-files-panel__toolbar-btn shrink-0"
              title="刷新"
              @click="refresh"
            >
              <RefreshCw class="w-4 h-4" :class="loading ? 'animate-spin' : ''" />
            </button>
            <span v-if="preview" class="text-[11px] shrink-0" style="color: var(--app-text-muted)">
              {{ formatSize(preview.size) }}<template v-if="preview.truncated"> · 已截断</template>
            </span>
            <div v-if="canShowDiff" class="preview-mode-toggle shrink-0">
              <button
                type="button"
                class="preview-mode-toggle__btn"
                :class="{ 'preview-mode-toggle__btn--active': previewMode === 'diff' }"
                @click="previewMode = 'diff'"
              >
                Diff
              </button>
              <button
                type="button"
                class="preview-mode-toggle__btn"
                :class="{ 'preview-mode-toggle__btn--active': previewMode === 'content' }"
                :disabled="!canShowContent"
                @click="previewMode = 'content'"
              >
                内容
              </button>
            </div>
          </div>
          <div
            v-if="committedHint"
            class="px-3 md:px-4 py-1.5 text-[11px] shrink-0"
            style="color: var(--app-text-muted); border-bottom: 1px solid var(--app-border-subtle)"
          >
            变更已提交，当前无未提交 diff
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
              v-else-if="previewError && !showDiffPanel"
              class="py-12 text-center text-[13px] px-4"
              style="color: var(--app-danger, #ef4444)"
            >
              {{ previewError }}
            </div>
            <InlineFileDiffView
              v-else-if="showDiffPanel && fileDiff"
              :lines="fileDiff.lines"
              :truncated="fileDiff.truncated"
            />
            <div
              v-else-if="diffOnlyNoContent"
              class="py-12 text-center text-[13px] px-4"
              style="color: var(--app-text-muted)"
            >
              文件已删除，请查看 Diff
            </div>
            <div
              v-else-if="fileDiff?.status === 'binary' && !preview"
              class="py-12 text-center text-[13px] px-4"
              style="color: var(--app-text-muted)"
            >
              二进制文件，暂不支持 diff 预览
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
              <div
                v-else-if="officeLoading"
                class="py-12 text-center text-[13px]"
                style="color: var(--app-text-muted)"
              >
                正在解析办公文档…
              </div>
              <div
                v-else-if="officeError"
                class="py-12 text-center text-[13px] px-4"
                style="color: var(--app-danger, #ef4444)"
              >
                {{ officeError }}
              </div>
              <div v-else-if="officeHtml" class="office-preview p-4" v-html="officeHtml" />
              <div v-else-if="preview.kind === 'markdown' && preview.content != null" class="p-4">
                <MarkdownContent :content="preview.content" prose />
              </div>
              <div
                v-else-if="preview.content != null && preview.encoding === 'utf8'"
                class="p-4 session-file-code"
              >
                <MarkdownContent :content="highlightedPreviewMarkdown" variant="terminal" />
              </div>
              <div
                v-else-if="isLegacyOffice"
                class="py-12 text-center text-[13px] px-4"
                style="color: var(--app-text-muted)"
              >
                暂不支持旧版 Office 格式（.doc / .ppt / .xls），请转换为 .docx / .pptx / .xlsx 后预览
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
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  FolderTree,
  Loader2,
  RefreshCw,
} from "lucide-vue-next";
import {
  getSessionFileContent,
  getSessionFileDiff,
  getSessionFiles,
  type SessionFileContent,
  type SessionFileDiff,
  type SessionWorkspaceFileEntry,
} from "@/api";
import type { SessionChangedFileView } from "./chat/SessionChangesPopover.vue";
import InlineFileDiffView from "./InlineFileDiffView.vue";
import MarkdownContent from "./MarkdownContent.vue";
import {
  docxBase64ToHtml,
  pptxBase64ToHtml,
  xlsxBase64ToHtml,
} from "@/utils/office-file-preview";

interface FileTreeNode {
  id: string;
  text: string;
  children?: FileTreeNode[];
  filePath?: string;
}

const props = defineProps<{
  sessionId: string;
  initialPath?: string | null;
  mobile?: boolean;
  changedFiles?: SessionChangedFileView[];
}>();

defineEmits<{ close: [] }>();

const treeDrawerOpen = ref(false);

const cwd = ref("");
const files = ref<SessionWorkspaceFileEntry[]>([]);
const treeNodes = ref<FileTreeNode[]>([]);
const loading = ref(false);
const listError = ref<string | null>(null);
const selectedPath = ref<string | null>(null);
const preview = ref<SessionFileContent | null>(null);
const fileDiff = ref<SessionFileDiff | null>(null);
const previewMode = ref<"diff" | "content">("diff");
const previewLoading = ref(false);
const previewError = ref<string | null>(null);
const imageUrl = ref<string | null>(null);
const officeHtml = ref<string | null>(null);
const officeLoading = ref(false);
const officeError = ref<string | null>(null);

const changeStatusMap = computed(() => {
  const map = new Map<string, SessionChangedFileView["status"]>();
  for (const file of props.changedFiles ?? []) {
    if (file?.path) map.set(file.path.replace(/\\/g, "/"), file.status);
  }
  return map;
});

const isBinaryLikeKind = computed(() => {
  const kind = preview.value?.kind;
  return (
    kind === "image" ||
    kind === "pdf" ||
    kind === "docx" ||
    kind === "pptx" ||
    kind === "xlsx" ||
    kind === "binary"
  );
});

const isLegacyOffice = computed(() => {
  const path = (preview.value?.path ?? selectedPath.value ?? "").toLowerCase();
  return /\.(doc|ppt|xls)$/.test(path);
});

const canShowDiff = computed(() => {
  if (!fileDiff.value) return false;
  if (fileDiff.value.status === "binary" || fileDiff.value.status === "unchanged") return false;
  if (preview.value && isBinaryLikeKind.value) return false;
  return fileDiff.value.lines.length > 0;
});

const canShowContent = computed(() => Boolean(preview.value));

const showDiffPanel = computed(() => canShowDiff.value && previewMode.value === "diff");

const committedHint = computed(() => {
  if (!selectedPath.value) return false;
  if (!changeStatusMap.value.has(selectedPath.value)) return false;
  return fileDiff.value?.status === "unchanged";
});

const diffOnlyNoContent = computed(() => {
  if (previewLoading.value || showDiffPanel.value || preview.value) return false;
  return changeStatusMap.value.get(selectedPath.value ?? "") === "deleted";
});

const fileCount = computed(() => files.value.filter((f) => !f.isDirectory).length);
const breadcrumbSegments = computed(() => selectedPath.value?.split("/").filter(Boolean) ?? []);
const hasRequestedFile = computed(() => Boolean(props.initialPath?.trim()));
const showFileAreaLoading = computed(() => {
  if (previewLoading.value) return true;
  if (hasRequestedFile.value && loading.value) return true;
  if (hasRequestedFile.value && selectedPath.value && !preview.value && !previewError.value) {
    return true;
  }
  if (
    hasRequestedFile.value &&
    !selectedPath.value &&
    !previewError.value &&
    files.value.length > 0
  ) {
    return true;
  }
  return false;
});
const treePaneWidth = ref(Number(localStorage.getItem("pi-supervisor:file-tree-width")) || 220);
let stopTreeResize: (() => void) | null = null;

function startTreeResize(event: PointerEvent) {
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = treePaneWidth.value;
  const onMove = (moveEvent: PointerEvent) => {
    treePaneWidth.value = Math.min(420, Math.max(160, startWidth + moveEvent.clientX - startX));
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
  const paths = new Set(
    entries.filter((entry) => !entry.isDirectory).map((entry) => entry.path.replace(/\\/g, "/")),
  );
  for (const [path, status] of changeStatusMap.value) {
    if (status === "deleted") paths.add(path);
  }
  const fileEntries = [...paths].map((path) => ({ path, isDirectory: false }));

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

async function setOfficePreview(file: SessionFileContent) {
  officeHtml.value = null;
  officeError.value = null;
  officeLoading.value = false;
  if (
    (file.kind !== "docx" && file.kind !== "pptx" && file.kind !== "xlsx") ||
    file.encoding !== "base64" ||
    !file.content
  ) {
    if (file.kind === "docx" || file.kind === "pptx" || file.kind === "xlsx") {
      officeError.value = file.truncated ? "文件过大，无法预览" : "无法读取办公文档内容";
    }
    return;
  }
  officeLoading.value = true;
  try {
    if (file.kind === "docx") officeHtml.value = await docxBase64ToHtml(file.content);
    else if (file.kind === "pptx") officeHtml.value = await pptxBase64ToHtml(file.content);
    else officeHtml.value = await xlsxBase64ToHtml(file.content);
  } catch (error: unknown) {
    officeError.value = error instanceof Error ? error.message : String(error);
  } finally {
    officeLoading.value = false;
  }
}

async function loadPreview(path: string) {
  previewLoading.value = true;
  previewError.value = null;
  preview.value = null;
  fileDiff.value = null;
  previewMode.value = "diff";
  revokeImageUrl();
  officeHtml.value = null;
  officeError.value = null;
  officeLoading.value = false;

  const isDeleted = changeStatusMap.value.get(path) === "deleted";

  try {
    const diffPromise = getSessionFileDiff(props.sessionId, path);
    const contentPromise = isDeleted
      ? Promise.reject(new Error("file deleted"))
      : getSessionFileContent(props.sessionId, path);

    const [diffResult, contentResult] = await Promise.allSettled([diffPromise, contentPromise]);

    if (diffResult.status === "fulfilled") {
      fileDiff.value = diffResult.value;
    }

    if (contentResult.status === "fulfilled") {
      preview.value = contentResult.value;
      setBinaryPreview(contentResult.value);
      void setOfficePreview(contentResult.value);
      if (
        contentResult.value.kind === "image" ||
        contentResult.value.kind === "pdf" ||
        contentResult.value.kind === "docx" ||
        contentResult.value.kind === "pptx" ||
        contentResult.value.kind === "xlsx"
      ) {
        previewMode.value = "content";
      }
    } else if (!isDeleted) {
      previewError.value =
        contentResult.reason instanceof Error
          ? contentResult.reason.message
          : String(contentResult.reason);
    }
  } catch (e: unknown) {
    previewError.value = e instanceof Error ? e.message : String(e);
  } finally {
    previewLoading.value = false;
  }
}

function nodeChangeStatus(node: FileTreeNode): SessionChangedFileView["status"] | undefined {
  if (!node.filePath) return undefined;
  return changeStatusMap.value.get(node.filePath.replace(/\\/g, "/"));
}

function statusLabel(status: SessionChangedFileView["status"]): string {
  if (status === "added") return "A";
  if (status === "deleted") return "D";
  return "M";
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
  for (const [path, status] of changeStatusMap.value) {
    if (status === "deleted") paths.push(path);
  }
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
  if (props.mobile) treeDrawerOpen.value = false;
  void loadPreview(path);
}

function syncMobileTreeDrawer() {
  if (
    props.mobile &&
    !props.initialPath?.trim() &&
    !selectedPath.value &&
    !loading.value &&
    !listError.value
  ) {
    treeDrawerOpen.value = true;
  }
}

function onNodeClick(node: FileTreeNode, stat: { open: boolean }) {
  if (node.children?.length) {
    stat.open = !stat.open;
    return;
  }
  if (!node.filePath) return;
  selectedPath.value = node.filePath;
  void loadPreview(node.filePath);
  if (window.matchMedia("(max-width: 767px)").matches) {
    treeDrawerOpen.value = false;
  }
}

function isSelectedFile(node: FileTreeNode): boolean {
  if (!node.filePath || !selectedPath.value) return false;
  const normalize = (path: string) => path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  return normalize(node.filePath) === normalize(selectedPath.value);
}

async function refresh() {
  loading.value = true;
  listError.value = null;
  try {
    const result = await getSessionFiles(props.sessionId);
    cwd.value = result.cwd;
    files.value = result.files;
    treeNodes.value = buildTree(result.files);
    const current = selectedPath.value;
    if (current) {
      void loadPreview(current);
    } else if (props.initialPath) {
      openRequestedPath(props.initialPath);
    }
  } catch (e: unknown) {
    files.value = [];
    treeNodes.value = [];
    listError.value = e instanceof Error ? e.message : "加载文件树失败";
  } finally {
    loading.value = false;
    syncMobileTreeDrawer();
  }
}

watch(
  () => props.changedFiles,
  () => {
    if (files.value.length > 0 || (props.changedFiles?.length ?? 0) > 0) {
      treeNodes.value = buildTree(files.value);
    }
  },
  { deep: true },
);

watch(
  () => props.sessionId,
  (id) => {
    selectedPath.value = null;
    preview.value = null;
    fileDiff.value = null;
    previewError.value = null;
    treeDrawerOpen.value = false;
    revokeImageUrl();
    officeHtml.value = null;
    officeError.value = null;
    officeLoading.value = false;
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

watch(
  () => [props.mobile, selectedPath.value, props.initialPath] as const,
  () => syncMobileTreeDrawer(),
);

onBeforeUnmount(() => {
  stopTreeResize?.();
  revokeImageUrl();
});
</script>

<style scoped>
.session-files-panel__body {
  min-height: 0;
}

.session-files-panel__tree {
  width: 100%;
}

.session-files-panel__tree-backdrop {
  position: absolute;
  z-index: 9;
  inset: 0;
  background: rgb(0 0 0 / 38%);
}

.session-files-panel__browse-btn {
  padding: 8px 14px;
  border-radius: 8px;
  color: var(--app-text-primary);
  background: var(--app-hover);
  font-size: 13px;
}

.session-files-panel__toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 6px;
  color: var(--app-text-secondary);
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

@media (max-width: 767px) {
  .session-files-panel__tree {
    position: absolute;
    z-index: 10;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(78%, 280px);
    height: 100% !important;
    border-bottom: 0;
    background: var(--app-settings-bg);
    box-shadow: 4px 0 24px rgb(0 0 0 / 28%);
    transform: translateX(-100%);
    transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .session-files-panel__tree--open {
    transform: translateX(0);
  }
}

@media (min-width: 768px) {
  .session-files-panel__tree {
    height: 100%;
    width: min(var(--session-tree-width, 220px), 48%);
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

.preview-mode-toggle {
  display: flex;
  overflow: hidden;
  border: 1px solid var(--app-border-subtle);
  border-radius: 6px;
}

.preview-mode-toggle__btn {
  padding: 3px 8px;
  color: var(--app-text-muted);
  font-size: 11px;
}

.preview-mode-toggle__btn:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.preview-mode-toggle__btn--active {
  background: color-mix(in srgb, var(--app-accent) 20%, var(--app-settings-bg));
  color: var(--app-text-primary);
}

.preview-mode-toggle__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.office-preview {
  color: var(--app-text-primary);
  font-size: 14px;
  line-height: 1.6;
}

.office-preview :deep(h3) {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 650;
}

.office-preview :deep(p) {
  margin: 0 0 8px;
}

.office-preview :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 16px;
  font-size: 12px;
}

.office-preview :deep(td),
.office-preview :deep(th) {
  border: 1px solid var(--app-border-subtle);
  padding: 4px 8px;
  vertical-align: top;
}

.office-preview :deep(.office-preview__slide),
.office-preview :deep(.office-preview__sheet) {
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.office-preview :deep(.office-preview__muted) {
  color: var(--app-text-muted);
}
</style>
