<template>
  <div v-if="agent" class="flex flex-col min-h-0 flex-1">
    <div class="flex items-center justify-between gap-3 mb-2 shrink-0">
      <span class="text-[12px] text-gray-500">SYSTEM.md</span>
      <InlineEditActions
        :editing="editing"
        @edit="startEdit"
        @cancel="cancelEdit"
        @done="finishEdit"
      />
    </div>

    <div class="flex-1 min-h-[240px] overflow-hidden">
      <CodeMirrorView
        v-if="editing"
        :content="agent.systemMd"
        language="markdown"
        editable
        fill
        @update:content="onSystemMdChange"
      />
      <div v-else class="h-full min-h-[200px] overflow-y-auto custom-scrollbar text-[15px] leading-relaxed text-gray-800">
        <MarkdownContent :content="agent.systemMd || '（空）'" prose />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CodeMirrorView from './CodeMirrorView.vue'
import InlineEditActions from './InlineEditActions.vue'
import MarkdownContent from './MarkdownContent.vue'
import { getAgentById } from '../mock/agents'

const props = defineProps<{
  agentId: string
}>()

const agent = computed(() => getAgentById(props.agentId))
const editing = ref(false)
const snapshot = ref<string | null>(null)

watch(
  () => props.agentId,
  () => {
    editing.value = false
    snapshot.value = null
  },
)

function startEdit() {
  snapshot.value = agent.value?.systemMd ?? ''
  editing.value = true
}

function cancelEdit() {
  const a = agent.value
  if (a && snapshot.value !== null) a.systemMd = snapshot.value
  editing.value = false
  snapshot.value = null
}

function finishEdit() {
  editing.value = false
  snapshot.value = null
}

function onSystemMdChange(content: string) {
  const a = agent.value
  if (!a) return
  a.systemMd = content
}
</script>
