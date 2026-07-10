<template>
  <div class="flex justify-start items-start gap-2">
    <div class="chat-avatar chat-avatar--agent shrink-0">{{ avatarLabel }}</div>
    <div class="max-w-[75%] flex flex-col items-start min-w-0">
      <span class="chat-msg-time chat-msg-time--agent">{{ timeLabel }}</span>
      <div
        class="relative px-3.5 py-2.5 text-[14px] w-full chat-bubble"
        :style="{
          background: 'var(--app-bubble-assistant)',
          color: 'var(--app-text-primary)',
          borderRadius: 'var(--app-bubble-radius)',
        }"
        :class="{ 'ring-2 ring-[#07c160]/40': searchHit }"
      >
        <div
          class="absolute top-3 w-2 h-2 rotate-45 -left-1 chat-bubble-tail"
          :style="{ background: 'var(--app-bubble-assistant)' }"
        />
        <div class="relative z-10 font-sans leading-snug flex flex-col gap-2">
          <template v-for="{ piece, index: pieceIndex } in displayPieces" :key="pieceIndex">
            <ThinkingBlock
              v-if="piece.kind === 'thinking'"
              :content="piece.text"
              :streaming="isStreamingPiece(pieceIndex)"
            />

            <MarkdownContent
              v-else-if="piece.kind === 'text'"
              :content="piece.text + (isStreamingPiece(pieceIndex) ? '▍' : '')"
            />

            <ToolStepRenderer
              v-else-if="piece.kind === 'bash' || piece.kind === 'toolStep'"
              :session-id="sessionId"
              :piece="piece"
              :all-pieces="group.pieces"
              :pending="isToolPiecePending(piece)"
              :is-error="piece.result?.isError"
              @open-tool="(name, args, result) => emit('open-tool', name, args, result)"
              @open-bash="(cmd, result, intent) => emit('open-bash', cmd, result, intent)"
              @navigate="emit('navigate', $event)"
              @answered="emit('answered')"
            />
          </template>

          <div v-if="showThinking" class="assistant-loading">
            <Loader2 class="w-4 h-4 animate-spin shrink-0" />
            <span>思考中…</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import type { DisplayGroup, RenderPiece } from '@/utils/flatten-messages'
import MarkdownContent from '../MarkdownContent.vue'
import ThinkingBlock from '../ThinkingBlock.vue'
import ToolStepRenderer from './ToolStepRenderer.vue'

const props = defineProps<{
  sessionId: string
  group: Extract<DisplayGroup, { type: 'grouped_assistant' }>
  showThinkingBlocks: boolean
  isStreaming: boolean
  streamingGroupId: string | null
  timeLabel: string
  searchHit?: boolean
  avatarLabel?: string
}>()

const emit = defineEmits<{
  'open-tool': [toolName: string, callArgs?: Record<string, unknown>, result?: Array<{ type: string; text: string }>]
  'open-bash': [command: string, result?: Array<{ type: string; text: string }>, intent?: string]
  navigate: [sessionId: string]
  answered: []
}>()

const displayPieces = computed(() =>
  props.group.pieces
    .map((piece, index) => ({ piece, index }))
    .filter(({ piece }) => props.showThinkingBlocks || piece.kind !== 'thinking'),
)

const isActiveStreamGroup = computed(
  () => props.isStreaming && props.streamingGroupId === props.group.id,
)

function isStreamingPiece(pieceIndex: number): boolean {
  if (!isActiveStreamGroup.value) return false
  const piece = props.group.pieces[pieceIndex]
  return piece?.kind === 'text' || piece?.kind === 'thinking'
}

function isToolPiecePending(piece: RenderPiece): boolean {
  if (piece.kind === 'bash' || piece.kind === 'toolStep') return !piece.result
  return false
}

const showThinking = computed(() => {
  if (!isActiveStreamGroup.value) return false
  const hasPendingTool = props.group.pieces.some(
    (p) => (p.kind === 'bash' || p.kind === 'toolStep') && !p.result,
  )
  if (hasPendingTool) return false

  const lastPiece = props.group.pieces[props.group.pieces.length - 1]
  if (!lastPiece) return true
  if (lastPiece.kind === 'text') return false
  if (lastPiece.kind === 'thinking' && !props.showThinkingBlocks) return true
  if (lastPiece.kind === 'bash' || lastPiece.kind === 'toolStep') return !!lastPiece.result
  return false
})
</script>

<style scoped>
.chat-msg-time {
  font-size: 11px;
  line-height: 1;
  color: var(--app-text-muted);
  opacity: 0.85;
  white-space: nowrap;
  margin-bottom: 4px;
}

.chat-msg-time--agent {
  align-self: flex-start;
  margin-left: 2px;
}

.chat-avatar {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}

.chat-avatar--agent {
  background: #3b82f6;
  color: #fff;
}

.assistant-loading {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--app-text-muted);
  font-size: 13px;
}
</style>
