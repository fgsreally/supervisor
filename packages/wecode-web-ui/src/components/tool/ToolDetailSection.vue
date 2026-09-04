<template>
  <section class="tool-detail-section">
    <div class="tool-detail-section__header">
      <label>{{ section.label }}</label>
      <button type="button" :title="t('toolDetail.copy')" @click="copy">
        <Copy aria-hidden="true" />
        <span>{{ t("toolDetail.copy") }}</span>
      </button>
    </div>
    <MarkdownContent v-if="section.markdown" :content="section.content" />
    <div v-else-if="json" class="tool-detail-section__code">
      <HighlightedCodeBlock :code="json" lang="json" />
    </div>
    <pre v-else>{{ section.content }}</pre>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Copy } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import { showUiMessage } from "@/composables/use-ui-message";
import HighlightedCodeBlock from "../base/HighlightedCodeBlock.vue";
import MarkdownContent from "../base/MarkdownContent.vue";
import type { ToolDetailSection } from "./ToolDetailModal.vue";

const props = defineProps<{ section: ToolDetailSection }>();
const { t } = useI18n();
const json = computed(() => {
  try {
    return JSON.stringify(JSON.parse(props.section.content), null, 2);
  } catch {
    return "";
  }
});

async function copy() {
  try {
    await navigator.clipboard.writeText(props.section.content);
    showUiMessage(t("toolDetail.copied"), "success");
  } catch {
    showUiMessage(t("toolDetail.copyFailed"), "error");
  }
}
</script>

<style scoped>
.tool-detail-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2);
  margin-bottom: 6px;
}
.tool-detail-section__header label {
  color: var(--app-text-muted);
  font-size: var(--app-font-caption);
  font-weight: var(--app-font-weight-medium);
}
.tool-detail-section__header button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 5px;
  color: var(--app-text-muted);
  font-size: var(--app-font-micro);
}
.tool-detail-section__header button:hover {
  color: var(--app-text-primary);
  background: var(--app-hover);
}
.tool-detail-section__header svg {
  width: 0.8rem;
  height: 0.8rem;
}
.tool-detail-section__code,
pre {
  margin: 0;
  overflow: auto;
  border-radius: 8px;
  background: var(--app-code-bg, var(--app-hover));
}
pre {
  padding: 10px 12px;
  color: var(--app-code-text);
  font-size: var(--app-font-caption);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
