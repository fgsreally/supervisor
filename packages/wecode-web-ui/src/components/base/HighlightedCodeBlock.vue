<template>
  <div class="highlighted-code-wrap">
    <button class="copy-code" type="button" title="复制代码" aria-label="复制代码" @click="copy">
      <Check v-if="copied" class="h-4 w-4" /><Copy v-else class="h-4 w-4" />
    </button>
    <pre class="highlighted-code" :data-lang="lang || undefined"><code v-html="html" /></pre>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Check, Copy } from "lucide-vue-next";
import { highlightCodeWithShiki } from "@/utils/shiki-highlight";
import { useAppTheme } from "@/composables/use-app-theme";

const props = defineProps<{
  code: string;
  lang?: string;
}>();

const { isDark } = useAppTheme();
const html = ref("");
const copied = ref(false);
async function copy() {
  await navigator.clipboard.writeText(props.code);
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1400);
}

async function render() {
  html.value = await highlightCodeWithShiki(props.code, props.lang, isDark.value);
}

watch(() => [props.code, props.lang, isDark.value] as const, () => void render(), { immediate: true });
</script>

<style scoped>
.highlighted-code {
  margin: 0;
  padding: 12px 14px;
  min-width: 100%;
  width: max-content;
  overflow: visible;
  background: transparent;
  color: var(--app-text-primary);
  font:
    12px/1.5 ui-monospace,
    SFMono-Regular,
    Menlo,
    Consolas,
    monospace;
  white-space: pre;
}
.highlighted-code-wrap { position: relative; }
.copy-code { position: absolute; z-index: 1; top: 7px; right: 7px; display: grid; place-items: center; padding: 5px; border: 0; border-radius: 5px; color: var(--app-text-muted); background: var(--app-hover); cursor: pointer; opacity: .75; }
.copy-code:hover { color: var(--app-text-primary); opacity: 1; }

.highlighted-code code {
  background: transparent;
  color: inherit;
  padding: 0;
  white-space: inherit;
  font: inherit;
}

.highlighted-code :deep(.shiki) {
  margin: 0;
  background: transparent !important;
}

.highlighted-code :deep(.tok-keyword) {
  color: #c084fc;
}
.highlighted-code :deep(.tok-string) {
  color: #ce9178;
}
.highlighted-code :deep(.tok-number) {
  color: #b5cea8;
}
.highlighted-code :deep(.tok-comment) {
  color: #6a9955;
  font-style: italic;
}
.highlighted-code :deep(.tok-tag),
.highlighted-code :deep(.tok-tag-name) {
  color: #569cd6;
}
.highlighted-code :deep(.tok-attr) {
  color: #9cdcfe;
}
.highlighted-code :deep(.tok-property) {
  color: #9cdcfe;
}
.highlighted-code :deep(.tok-function) {
  color: #dcdcaa;
}
.highlighted-code :deep(.tok-builtin) {
  color: #4ec9b0;
}
.highlighted-code :deep(.tok-punct) {
  color: #d4d4d4;
}

html[data-theme="light"] .highlighted-code :deep(.tok-keyword) {
  color: #0000ff;
}
html[data-theme="light"] .highlighted-code :deep(.tok-string) {
  color: #a31515;
}
html[data-theme="light"] .highlighted-code :deep(.tok-number) {
  color: #098658;
}
html[data-theme="light"] .highlighted-code :deep(.tok-comment) {
  color: #6b7280;
}
html[data-theme="light"] .highlighted-code :deep(.tok-tag),
html[data-theme="light"] .highlighted-code :deep(.tok-tag-name) {
  color: #2563eb;
}
html[data-theme="light"] .highlighted-code :deep(.tok-attr),
html[data-theme="light"] .highlighted-code :deep(.tok-property) {
  color: #0451a5;
}
html[data-theme="light"] .highlighted-code :deep(.tok-function) {
  color: #795e26;
}
html[data-theme="light"] .highlighted-code :deep(.tok-builtin) {
  color: #267f99;
}
html[data-theme="light"] .highlighted-code :deep(.tok-punct) {
  color: #393a34;
}
</style>
