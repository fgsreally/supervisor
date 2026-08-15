<template>
  <span class="file-type-icon" v-html="svgMarkup" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { fileIconSvg, type FileIconKind } from "../../utils/file-type-icon";
import { fileTypeIconSvg } from "../../utils/vscode-file-icon-svg";

const props = defineProps<{
  path?: string;
  kind?: FileIconKind;
  isDirectory?: boolean;
}>();

const svgMarkup = computed(() => {
  const svg = fileTypeIconSvg({
    path: props.path,
    kind: props.kind,
    isDirectory: props.isDirectory,
  });
  if (svg) return svg;
  return fileIconSvg(props.kind ?? "generic");
});
</script>

<style scoped>
.file-type-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  line-height: 0;
}

.file-type-icon :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;
  flex-shrink: 0;
}
</style>
