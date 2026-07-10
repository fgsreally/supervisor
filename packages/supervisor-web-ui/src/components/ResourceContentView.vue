<template>
  <div class="resource-content-view" :class="{ 'resource-content-view--fill': fill ?? true }">
    <CodeMirrorView
      :content="content"
      :language="editorLanguage"
      :fill="fill ?? true"
      :editable="editable ?? false"
      @update:content="onContentUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import CodeMirrorView, { type CodeMirrorLanguage } from './CodeMirrorView.vue'
import type { UIResourceKind } from '@/types/ui'

const props = withDefaults(
  defineProps<{
    content: string
    kind: UIResourceKind
    fill?: boolean
    editable?: boolean
    language?: CodeMirrorLanguage
  }>(),
  { editable: false },
)

const emit = defineEmits<{ 'update:content': [value: string] }>()

const editorLanguage = computed<CodeMirrorLanguage>(() => {
  if (props.language) return props.language
  return props.kind === 'extensions' ? 'typescript' : 'markdown'
})

function onContentUpdate(value: string) {
  if (props.editable) emit('update:content', value)
}
</script>

<style scoped>
.resource-content-view--fill {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
