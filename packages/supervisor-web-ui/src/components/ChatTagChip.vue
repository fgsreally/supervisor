<template>
  <span class="chat-tag-chip" :class="variant === 'file' ? 'chat-tag-chip--file' : 'chat-tag-chip--skill'">
    <FileTypeIcon v-if="variant === 'file'" :kind="fileIconKind" class="chat-tag-chip-icon" />
    <Sparkles v-else class="chat-tag-chip-icon" />
    <span class="chat-tag-chip-label">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next'
import type { FileIconKind } from '../utils/file-type-icon'
import FileTypeIcon from './FileTypeIcon.vue'

defineProps<{
	variant: 'file' | 'skill'
	label: string
	fileIconKind?: FileIconKind
}>()
</script>

<style scoped>
.chat-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  vertical-align: baseline;
  border-radius: 4px;
  padding: 1px 6px 1px 4px;
  margin: 0 2px;
  font-size: 13px;
  line-height: 1.4;
}

.chat-tag-chip-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.chat-tag-chip--skill .chat-tag-chip-icon {
  color: #ff9f1a;
}

.chat-tag-chip :deep(.file-type-icon) {
  width: 14px;
  height: 14px;
}

.chat-tag-chip :deep(.file-type-icon svg) {
  width: 14px;
  height: 14px;
}

.chat-tag-chip-label {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-tag-chip--file {
  background: var(--app-tag-file-bg);
  color: var(--app-tag-file-fg);
}

.chat-tag-chip--skill {
  background: var(--app-tag-skill-bg);
  color: var(--app-tag-skill-fg);
  font-weight: 500;
}

.chat-tag-chip--skill .chat-tag-chip-label {
  font-family: inherit;
}
</style>
