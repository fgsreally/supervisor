<template>
  <AskStep
    v-if="isAsk && piece.kind === 'toolStep'"
    :session-id="sessionId"
    :tool-call-id="piece.callId"
    :call-args="piece.callArgs"
    :result-content="piece.result?.content"
    :pending="pending"
    :is-error="isError"
    @answered="emit('answered')"
  />
  <BashStep
    v-else-if="piece.kind === 'bash'"
    :command="piece.command"
    :intent="piece.intent"
    :result-content="piece.result?.content"
    :pending="pending"
    :is-error="isError"
    @open="emit('open-bash', piece.command, piece.result?.content, piece.intent)"
  />
  <ToolActivityBar
    v-else-if="piece.kind === 'toolStep'"
    :tool-name="piece.toolName"
    :call-args="piece.callArgs"
    :result-content="piece.result?.content"
    :pending="pending"
    :is-error="isError"
    :show-navigate="piece.toolName === 'spawn_agent' && !!childSessionId"
    @open="emit('open-tool', piece.toolName, piece.callArgs, piece.result?.content)"
    @navigate="childSessionId && emit('navigate', childSessionId)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RenderPiece } from '@/utils/flatten-messages'
import { spawnChildSessionId } from '@/utils/flatten-messages'
import { isAskToolName } from '@/utils/ask-tool'
import AskStep from './AskStep.vue'
import BashStep from '../BashStep.vue'
import ToolActivityBar from '../ToolActivityBar.vue'

const props = defineProps<{
  sessionId: string
  piece: Extract<RenderPiece, { kind: 'bash' | 'toolStep' }>
  allPieces: RenderPiece[]
  pending?: boolean
  isError?: boolean
}>()

const emit = defineEmits<{
  'open-tool': [toolName: string, callArgs?: Record<string, unknown>, result?: Array<{ type: string; text: string }>]
  'open-bash': [command: string, result?: Array<{ type: string; text: string }>, intent?: string]
  navigate: [sessionId: string]
  answered: []
}>()

const isAsk = computed(
  () => props.piece.kind === 'toolStep' && isAskToolName(props.piece.toolName),
)

const childSessionId = computed(() => {
  if (props.piece.kind !== 'toolStep') return undefined
  return spawnChildSessionId(props.allPieces, props.piece.callId)
})
</script>
