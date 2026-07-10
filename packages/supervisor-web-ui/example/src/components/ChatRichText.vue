<template>
  <span class="chat-rich-text whitespace-pre-wrap break-words">
    <template v-for="(part, index) in parts" :key="index">
      <span v-if="part.kind === 'text'">{{ part.text }}</span>
      <ChatTagChip
        v-else-if="part.kind === 'file'"
        variant="file"
        :label="part.label"
        :file-icon-kind="part.fileIconKind"
      />
      <ChatTagChip v-else variant="skill" :label="part.label" />
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ChatTagChip from './ChatTagChip.vue'
import { findChatTokens } from '../utils/chat-token-patterns'
import {
	getFileBaseName,
	getFileIconKind,
	getFilePathFromToken,
	getSkillNameFromToken,
	type FileIconKind,
} from '../utils/file-type-icon'

const props = defineProps<{
  content: string
}>()

type TextPart = { kind: 'text'; text: string }
type FileTagPart = { kind: 'file'; label: string; fileIconKind: FileIconKind }
type SkillTagPart = { kind: 'skill'; label: string }
type ContentPart = TextPart | FileTagPart | SkillTagPart

const parts = computed((): ContentPart[] => {
  const text = props.content
  const tokens = findChatTokens(text)
  if (tokens.length === 0) return [{ kind: 'text', text }]

  const result: ContentPart[] = []
  let cursor = 0
  for (const token of tokens) {
    if (token.from > cursor) {
      result.push({ kind: 'text', text: text.slice(cursor, token.from) })
    }
    if (token.kind === 'file') {
      const path = getFilePathFromToken(token.text)
      result.push({
        kind: 'file',
        label: getFileBaseName(path),
        fileIconKind: getFileIconKind(path),
      })
    } else {
      result.push({ kind: 'skill', label: getSkillNameFromToken(token.text) })
    }
    cursor = token.to
  }
  if (cursor < text.length) {
    result.push({ kind: 'text', text: text.slice(cursor) })
  }
  return result
})
</script>
