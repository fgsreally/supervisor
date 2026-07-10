<template>
  <span class="file-type-icon">
    <Icon :icon="iconName" />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { fileIconName, fileIconNameFromPath, type FileIconKind } from '../utils/file-type-icon'

const props = defineProps<{
  path?: string
  kind?: FileIconKind
  isDirectory?: boolean
}>()

const iconName = computed(() => {
  if (props.kind) return fileIconName(props.kind)
  return fileIconNameFromPath(props.path ?? '', props.isDirectory)
})
</script>

<style scoped>
.file-type-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.file-type-icon :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;
}
</style>
