<template>
  <div
    class="session-file-preview-pane flex flex-col h-full w-full overflow-hidden"
    style="background: var(--app-settings-bg)"
  >
    <div
      v-if="showFileAreaLoading"
      class="flex-1 flex flex-col items-center justify-center gap-2 text-[13px]"
      style="color: var(--app-text-muted)"
    >
      <Loader2 class="w-5 h-5 animate-spin" />
      <span>读取中…</span>
    </div>
    <div
      v-else-if="previewError && !path"
      class="flex-1 flex flex-col items-center justify-center gap-3 text-[13px] px-4 text-center"
      style="color: var(--app-danger, #ef4444)"
    >
      {{ previewError }}
    </div>
    <div
      v-else-if="!path"
      class="flex-1 flex flex-col items-center justify-center gap-3 text-[13px] px-4 text-center"
      style="color: var(--app-text-muted)"
    >
      选择文件以预览内容
    </div>
    <template v-else>
      <div
        class="px-3 md:px-4 py-2 border-b flex items-center gap-2 shrink-0"
        style="border-color: var(--app-border-subtle)"
      >
        <nav class="file-breadcrumb flex-1 min-w-0" :title="path">
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
      <div class="session-file-preview-pane__scroll flex-1 min-h-0 overflow-auto custom-scrollbar">
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
            v-if="preview.kind === 'image' && mediaUrl"
            :src="mediaUrl"
            :alt="preview.path"
            class="max-w-full h-auto p-4 mx-auto"
          />
          <iframe
            v-else-if="preview.kind === 'pdf' && mediaUrl"
            :src="mediaUrl"
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
            class="p-0 session-file-code"
          >
            <HighlightedCodeBlock :code="formatTextContent(preview)" :lang="previewCodeLang" />
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
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ChevronRight, Loader2 } from "lucide-vue-next";
import {
  getSessionFileContent,
  getSessionFileDiff,
  type SessionFileContent,
  type SessionFileDiff,
} from "@/api";
import type { SessionChangedFileView } from "../chat/SessionChangesPopover.vue";
import HighlightedCodeBlock from "../base/HighlightedCodeBlock.vue";
import InlineFileDiffView from "@/components/session/InlineFileDiffView.vue";
import MarkdownContent from "../base/MarkdownContent.vue";
import { docxBase64ToHtml, pptxBase64ToHtml, xlsxBase64ToHtml } from "@/utils/office-file-preview";

const props = defineProps<{
  sessionId: string;
  path: string | null;
  changedFiles?: SessionChangedFileView[];
}>();

const preview = ref<SessionFileContent | null>(null);
const fileDiff = ref<SessionFileDiff | null>(null);
const previewMode = ref<"diff" | "content">("diff");
const previewLoading = ref(false);
const previewError = ref<string | null>(null);
const mediaUrl = ref<string | null>(null);
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

const canShowDiff = computed(() => {
  if (!fileDiff.value) return false;
  if (fileDiff.value.status === "binary" || fileDiff.value.status === "unchanged") return false;
  if (preview.value && isBinaryLikeKind.value) return false;
  return fileDiff.value.lines.length > 0;
});

const canShowContent = computed(() => Boolean(preview.value));
const showDiffPanel = computed(() => canShowDiff.value && previewMode.value === "diff");
const committedHint = computed(() => {
  if (!props.path) return false;
  if (!changeStatusMap.value.has(props.path)) return false;
  return fileDiff.value?.status === "unchanged";
});
const diffOnlyNoContent = computed(() => {
  if (previewLoading.value || showDiffPanel.value || preview.value) return false;
  return changeStatusMap.value.get(props.path ?? "") === "deleted";
});
const breadcrumbSegments = computed(() => props.path?.split("/").filter(Boolean) ?? []);
const showFileAreaLoading = computed(
  () => previewLoading.value && !preview.value && !fileDiff.value && !previewError.value,
);
const isLegacyOffice = computed(() => {
  const path = (preview.value?.path ?? props.path ?? "").toLowerCase();
  return /\.(doc|ppt|xls)$/.test(path);
});

const previewCodeLang = computed(() => {
  if (!preview.value) return "text";
  return preview.value.language || (preview.value.kind === "json" ? "json" : "text");
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

function revokeMediaUrl() {
  if (mediaUrl.value?.startsWith("blob:")) {
    URL.revokeObjectURL(mediaUrl.value);
  }
  mediaUrl.value = null;
}

function setMediaPreview(file: SessionFileContent) {
  revokeMediaUrl();
  if (
    (file.kind === "image" || file.kind === "pdf") &&
    file.encoding === "base64" &&
    file.content
  ) {
    const binary = atob(file.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: file.mimeType });
    mediaUrl.value = URL.createObjectURL(blob);
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
  revokeMediaUrl();
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
      setMediaPreview(contentResult.value);
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

watch(
  () => [props.sessionId, props.path] as const,
  ([, path]) => {
    if (!path) {
      preview.value = null;
      fileDiff.value = null;
      previewError.value = null;
      revokeMediaUrl();
      officeHtml.value = null;
      officeError.value = null;
      return;
    }
    void loadPreview(path);
  },
  { immediate: true },
);

onBeforeUnmount(revokeMediaUrl);
</script>

<style scoped>
.session-file-code {
  min-width: max-content;
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

.session-file-preview-pane__scroll {
  scrollbar-width: auto;
  scrollbar-color: color-mix(in srgb, var(--app-text-muted) 70%, transparent) transparent;
}

.session-file-preview-pane__scroll::-webkit-scrollbar:horizontal {
  height: 14px;
}

.session-file-preview-pane__scroll::-webkit-scrollbar-thumb {
  min-width: 44px;
  border: 3px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text-muted) 72%, transparent);
  background-clip: padding-box;
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
