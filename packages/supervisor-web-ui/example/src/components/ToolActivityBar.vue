<template>
  <div
    class="inline-block self-start max-w-full w-fit rounded-md overflow-hidden border"
    :class="hasResult ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-gray-50/80'"
  >
    <button
      type="button"
      class="inline-flex w-auto px-3 py-2 items-center gap-2 text-left transition-colors cursor-pointer"
      :class="hasResult ? 'bg-green-100/80 hover:bg-green-100' : 'bg-gray-100/80 hover:bg-gray-100'"
      @click="$emit('open')"
    >
      <component :is="icon" class="w-3.5 h-3.5 shrink-0" :class="hasResult ? 'text-green-600' : 'text-gray-500'" />
      <span
        class="text-xs font-medium max-w-[min(100%,22rem)] truncate"
        :class="hasResult ? 'text-green-700' : 'text-gray-600'"
      >
        {{ summary }}
      </span>
      <button
        v-if="showNavigate"
        type="button"
        class="flex items-center text-blue-600 hover:text-blue-800 bg-blue-100 hover:bg-blue-200 px-2 py-0.5 rounded text-[11px] font-medium"
        @click.stop="$emit('navigate')"
      >
        <ArrowRightCircle class="w-3 h-3 mr-0.5" />
        查看子代理
      </button>
      <Eye class="w-3.5 h-3.5 shrink-0 opacity-60" :class="hasResult ? 'text-green-600' : 'text-gray-400'" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  Terminal,
  FileText,
  PencilLine,
  FilePlus,
  Users,
  Wrench,
  Eye,
  ArrowRightCircle,
} from 'lucide-vue-next'
import { toolCallSummary, toolResultSummary } from '../mock/tool-display'

const props = defineProps<{
  toolName: string
  callArgs?: Record<string, unknown>
  resultContent?: Array<{ type: string; text: string }>
  showNavigate?: boolean
}>()

defineEmits<{ open: []; navigate: [] }>()

const hasResult = computed(() => !!props.resultContent?.length)

const summary = computed(() => {
  const call = toolCallSummary(props.toolName, props.callArgs)
  if (!hasResult.value) return call
  return `${call} · ${toolResultSummary(props.toolName, props.resultContent)}`
})

const icon = computed(() => {
  switch (props.toolName) {
    case 'read':
      return FileText
    case 'write':
      return FilePlus
    case 'edit':
      return PencilLine
    case 'bash':
      return Terminal
    case 'spawn_agent':
      return Users
    default:
      return Wrench
  }
})
</script>
