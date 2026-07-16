<template>
  <CodeMirrorView
    :content="content"
    :language="editorLanguage"
    :fill="fill ?? true"
    :editable="editable ?? false"
    @update:content="onContentUpdate"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import CodeMirrorView, { type CodeMirrorLanguage } from "./CodeMirrorView.vue";
import type { ResourceKind } from "../mock/resources";

const props = withDefaults(
  defineProps<{
    content: string;
    kind: ResourceKind;
    fill?: boolean;
    editable?: boolean;
    language?: CodeMirrorLanguage;
  }>(),
  { editable: false },
);

const emit = defineEmits<{ "update:content": [value: string] }>();

const editorLanguage = computed<CodeMirrorLanguage>(() => {
  if (props.language) return props.language;
  return props.kind === "extensions" ? "typescript" : "markdown";
});

function onContentUpdate(value: string) {
  if (props.editable) emit("update:content", value);
}
</script>
