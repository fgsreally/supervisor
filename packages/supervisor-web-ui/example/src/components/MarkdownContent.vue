<template>
  <div
    class="md-content break-words"
    :class="prose ? 'md-content--prose text-[14px] leading-relaxed' : 'text-[14px] leading-snug'"
    v-html="html"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";

const props = withDefaults(
  defineProps<{
    content: string;
    /** Resource / document style (headings, lists). */
    prose?: boolean;
  }>(),
  { prose: false },
);

marked.setOptions({
  breaks: true,
  gfm: true,
});

const html = computed(() => {
  const raw = marked.parse(props.content, { async: false });
  return typeof raw === "string" ? raw : "";
});
</script>

<style scoped>
.md-content :deep(p) {
  margin: 0 0 0.35em;
}
.md-content :deep(p:last-child) {
  margin-bottom: 0;
}
.md-content :deep(strong) {
  font-weight: 600;
}
.md-content :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
}
.md-content :deep(pre) {
  margin: 0.35em 0;
  padding: 0.6em 0.75em;
  border-radius: 6px;
  background: #f3f4f6;
  overflow-x: auto;
  font-size: 0.85em;
}
.md-content :deep(pre code) {
  padding: 0;
  background: transparent;
}

.md-content--prose :deep(h1) {
  font-size: 1.35em;
  font-weight: 600;
  margin: 0 0 0.75em;
  color: #111827;
}
.md-content--prose :deep(h2) {
  font-size: 1.15em;
  font-weight: 600;
  margin: 1.25em 0 0.5em;
  color: #111827;
}
.md-content--prose :deep(h3) {
  font-size: 1.05em;
  font-weight: 600;
  margin: 1em 0 0.4em;
  color: #374151;
}
.md-content--prose :deep(ul),
.md-content--prose :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}
.md-content--prose :deep(li) {
  margin: 0.25em 0;
}
.md-content--prose :deep(li + li) {
  margin-top: 0.15em;
}
</style>
