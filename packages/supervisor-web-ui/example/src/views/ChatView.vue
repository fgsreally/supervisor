<template>
  <div class="flex flex-col h-full w-full" style="background: var(--app-chat-bg)" v-if="session">
    <div
      class="h-14 md:h-[60px] border-b flex items-center px-3 md:px-6 shrink-0 z-10"
      style="background: var(--app-chat-header-bg); border-color: var(--app-border)"
    >
      <button
        v-if="showBack"
        type="button"
        class="mr-2 p-1.5 rounded-md md:hidden chat-header-btn"
        @click="emit('back')"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>
      <input
        v-model="sessionTitle"
        type="text"
        class="font-medium text-[18px] bg-transparent border-b border-transparent focus:border-[#07c160] focus:outline-none min-w-0 max-w-[40%] truncate"
        style="color: var(--app-text-primary)"
        @change="saveSessionTitle"
      />
      <button
        v-if="agentName"
        type="button"
        class="ml-2 text-[12px] hover:underline shrink-0"
        style="color: var(--app-text-link)"
        @click="emit('view-agent', agentId!)"
      >
        {{ agentName }}
      </button>
      <div class="ml-3 px-2 py-0.5 rounded text-xs font-medium" :class="statusBadgeClass">
        {{ session.status }}
      </div>
      <div
        v-if="isStreaming"
        class="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 animate-pulse"
      >
        流式输出中…
      </div>
      <div class="ml-auto flex items-center gap-1">
        <button
          v-if="searchOpen"
          type="button"
          class="p-1.5 rounded-md transition-colors chat-header-btn"
          title="关闭搜索"
          @click="closeSearch"
        >
          <X class="w-[18px] h-[18px]" />
        </button>
        <button
          type="button"
          class="p-1.5 rounded-md transition-colors chat-header-btn"
          title="聊天信息"
          @click="sessionMenuOpen = true"
        >
          <MoreHorizontal class="w-[18px] h-[18px] stroke-[1.75]" />
        </button>
      </div>
    </div>

    <div
      v-if="searchOpen"
      class="shrink-0 px-4 py-2 border-b flex items-center gap-2"
      style="background: var(--app-list-bg); border-color: var(--app-border)"
    >
      <Search class="w-4 h-4 text-gray-400 shrink-0" />
      <input
        ref="searchInputRef"
        v-model="searchQuery"
        type="text"
        placeholder="搜索聊天记录"
        class="flex-1 bg-transparent text-[14px] focus:outline-none"
        style="color: var(--app-text-primary)"
      />
      <span v-if="searchQuery" class="text-[12px] text-gray-400 shrink-0">{{ searchHitCount }} 条</span>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar" ref="messagesContainer">
      <template v-for="(group, groupIndex) in visibleGroups" :key="group.id">
        <div
          v-if="showBranchDivider(groupIndex)"
          class="flex justify-center py-2"
          style="background: var(--app-chat-message-bg)"
        >
          <span
            class="text-[12px] px-3 py-1 rounded-full"
            style="color: var(--app-text-secondary); background: var(--app-hover)"
          >
            以下为本会话新消息
          </span>
        </div>

        <div :class="messageRowClass(group)">
        <div v-if="group.type === 'message' && group.message?.role === 'user'" class="flex justify-end items-start">
          <div class="max-w-[75%] flex flex-col items-end">
            <div class="chat-msg-time chat-msg-time--left">
              {{ messageTimeLabel(group, groupIndex) }}
            </div>
            <ChatFileBubble
              v-if="isUserFileMessage(group)"
              :file="userFileAttachment(group)!"
              class="relative"
            />
            <div
              v-else
              class="relative px-3.5 py-2.5 text-[14px] text-black chat-bubble"
              :style="{ background: 'var(--app-bubble-user)', borderRadius: 'var(--app-bubble-radius)' }"
              :class="{ 'ring-2 ring-[#07c160]/40': isSearchHit(group) }"
            >
              <div
                class="absolute top-3 w-2 h-2 rotate-45 -right-1 chat-bubble-tail"
                :style="{ background: 'var(--app-bubble-user)' }"
              ></div>
              <ChatRichText :content="userText(group)" class="relative z-10" />
            </div>
          </div>
          <div class="w-9 h-9 rounded bg-gray-300 flex items-center justify-center text-gray-600 font-medium shrink-0 ml-3 mt-0 shadow-sm">
            U
          </div>
        </div>

        <div v-else-if="isGroupedAssistantGroup(group)" class="flex justify-start">
          <div class="w-9 h-9 rounded bg-blue-500 flex items-center justify-center text-white font-medium shrink-0 mr-3 mt-0 shadow-sm">
            P
          </div>
          <div class="max-w-[75%] flex flex-col items-start min-w-0">
            <div class="text-[12px] mb-0.5 ml-1" style="color: var(--app-text-secondary)">{{ session.meta?.name || 'Agent' }}</div>
            <div class="chat-msg-time chat-msg-time--right">
              {{ messageTimeLabel(group, groupIndex) }}
            </div>
            <div
              class="relative px-3.5 py-2.5 text-[14px] w-full chat-bubble"
              :style="{
                background: 'var(--app-bubble-assistant)',
                color: 'var(--app-text-primary)',
                borderRadius: 'var(--app-bubble-radius)',
              }"
              :class="{ 'ring-2 ring-[#07c160]/40': isSearchHit(group) }"
            >
              <div
                class="absolute top-3 w-2 h-2 rotate-45 -left-1 chat-bubble-tail"
                :style="{ background: 'var(--app-bubble-assistant)' }"
              ></div>
              <div class="relative z-10 font-sans leading-snug flex flex-col gap-2">
                <template v-for="(piece, idx) in group.pieces" :key="idx">
                  <MarkdownContent
                    v-if="piece.kind === 'text'"
                    :content="piece.text + (isStreamingPiece(group, idx) ? '▍' : '')"
                  />

                  <BashStep
                    v-else-if="piece.kind === 'bash'"
                    :command="piece.command"
                    :intent="piece.intent"
                    :result-content="piece.result?.content"
                    @open="openBashDetail(piece.command, piece.result?.content, piece.intent)"
                  />

                  <ToolActivityBar
                    v-else-if="piece.kind === 'toolStep'"
                    :tool-name="piece.toolName"
                    :call-args="piece.callArgs"
                    :result-content="piece.result?.content"
                    :show-navigate="piece.toolName === 'spawn_agent' && !!spawnChildSessionId(group.pieces, piece.callId)"
                    @open="openToolDetail(piece.toolName, piece.callArgs, piece.result?.content)"
                    @navigate="navigateToSubagent(spawnChildSessionId(group.pieces, piece.callId)!)"
                  />
                </template>
              </div>
            </div>
          </div>
        </div>

        <CompactionBanner
          v-else-if="group.type === 'compaction'"
          :entry="group"
          @open="openCompactionDetail(group)"
        />

        <div v-else-if="group.type === 'system'" class="flex justify-center px-4">
          <span class="text-[12px] text-center" style="color: var(--app-text-muted)">{{ group.content }}</span>
        </div>
        </div>
      </template>
    </div>

    <ChatInputPanel
      v-model="inputText"
      :workspace-id="workspaceId"
      :agent-id="agentId"
      :disabled="isStreaming"
      @send="sendMessage"
    />

    <ChatSessionMenu
      :open="sessionMenuOpen"
      :agent-name="agentName ?? session.meta?.name ?? 'Agent'"
      :muted="sessionMuted"
      @close="sessionMenuOpen = false"
      @search="openSearchFromMenu"
      @update:muted="onMutedChange"
    />

    <ToolDetailModal
      :open="!!toolModal"
      :title="toolModal?.title ?? ''"
      :sections="toolModal?.sections ?? []"
      @close="toolModal = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { MoreHorizontal, ChevronLeft, Search, X } from 'lucide-vue-next'
import {
  getSessionMessages,
  appendSessionMessage,
  updateSessionPreview,
  updateSessionMeta,
  toggleSessionMuted,
} from '../mock/store'
import type { MockCompactionEntry, MockEntry, MockToolPart, MockUserFileAttachment } from '../mock/types'
import {
  buildDisplayGroups,
  isGroupedAssistantGroup,
  isDisplayGroupInherited,
  spawnChildSessionId,
  type DisplayGroup,
} from '../utils/flatten-messages'
import { buildToolModal, buildBashModal } from '../utils/tool-detail'
import MarkdownContent from '../components/MarkdownContent.vue'
import ChatRichText from '../components/ChatRichText.vue'
import ChatFileBubble from '../components/ChatFileBubble.vue'
import ToolActivityBar from '../components/ToolActivityBar.vue'
import BashStep from '../components/BashStep.vue'
import ToolDetailModal from '../components/ToolDetailModal.vue'
import CompactionBanner from '../components/CompactionBanner.vue'
import ChatInputPanel from '../components/ChatInputPanel.vue'
import ChatSessionMenu from '../components/ChatSessionMenu.vue'
import { isStreamDemoSession, runStreamDemoTurn } from '../utils/mock-stream-reply'
import { getAgentById } from '../mock/agents'
import { formatListTime } from '../utils/format-time'

const props = defineProps<{
  session: {
    id: string
    status: string
    meta?: { name?: string }
    workspaceId?: string
    pinned?: boolean
    muted?: boolean
  }
  agentId?: string
  showBack?: boolean
}>()

const emit = defineEmits<{ navigate: [sessionId: string]; back: []; 'view-agent': [agentId: string] }>()

const agentName = computed(() => {
  if (!props.agentId) return null
  return getAgentById(props.agentId)?.name ?? props.agentId
})

const inputText = ref('')
const sessionTitle = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const mockMessages = ref<MockEntry[]>([])
const toolModal = ref<{ title: string; sections: { label: string; content: string }[] } | null>(null)
const isStreaming = ref(false)
const streamingAssistantId = ref<string | null>(null)
const sessionMenuOpen = ref(false)
const searchOpen = ref(false)
const searchQuery = ref('')
let streamAbort: AbortController | null = null

const workspaceId = computed(() => props.session.workspaceId ?? 'ws-pi')
const sessionMuted = computed(() => !!props.session.muted)

function stopStreaming() {
  streamAbort?.abort()
  streamAbort = null
  isStreaming.value = false
  streamingAssistantId.value = null
}

function loadSessionMessages(sessionId: string) {
  stopStreaming()
  mockMessages.value = [...getSessionMessages(sessionId)]
  sessionTitle.value = props.session.meta?.name ?? `Session ${sessionId.substring(0, 8)}`
  toolModal.value = null
  searchOpen.value = false
  searchQuery.value = ''
  sessionMenuOpen.value = false
}

function saveSessionTitle() {
  const name = sessionTitle.value.trim()
  if (!name) return
  updateSessionMeta(props.session.id, { name })
}

function openSearch() {
  searchOpen.value = true
  sessionMenuOpen.value = false
  void nextTick(() => searchInputRef.value?.focus())
}

function openSearchFromMenu() {
  sessionMenuOpen.value = false
  openSearch()
}

function closeSearch() {
  searchOpen.value = false
  searchQuery.value = ''
}

function onMutedChange(muted: boolean) {
  toggleSessionMuted(props.session.id, muted)
}

async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

watch(
  () => props.session.id,
  (id) => {
    loadSessionMessages(id)
    void scrollToBottom()
  },
  { immediate: true },
)

const displayGroups = computed(() => buildDisplayGroups(mockMessages.value))

const visibleGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!searchOpen.value || !q) return displayGroups.value
  return displayGroups.value.filter((group) => groupMatchesSearch(group, q))
})

const searchHitCount = computed(() => visibleGroups.value.length)

function groupMatchesSearch(group: DisplayGroup, q: string): boolean {
  if (group.type === 'message' && group.message) {
    const content = group.message.content
    if (typeof content === 'object' && content !== null && content.type === 'file') {
      return content.name.toLowerCase().includes(q)
    }
    if (typeof content === 'string') return content.toLowerCase().includes(q)
    if (Array.isArray(content)) {
      return content.some((p) => p.type === 'text' && p.text.toLowerCase().includes(q))
    }
  }
  if (group.type === 'grouped_assistant') {
    return group.pieces.some((p) => p.kind === 'text' && p.text.toLowerCase().includes(q))
  }
  if (group.type === 'compaction') return group.summary.toLowerCase().includes(q)
  if (group.type === 'system') return group.content.toLowerCase().includes(q)
  return false
}

function isSearchHit(group: DisplayGroup): boolean {
  const q = searchQuery.value.trim().toLowerCase()
  return searchOpen.value && !!q && groupMatchesSearch(group, q)
}

function messageTimeLabel(group: DisplayGroup, index: number): string {
  if (group.type !== 'message' && group.type !== 'grouped_assistant') return ''
  const raw = Number.parseInt(group.id, 10)
  if (Number.isFinite(raw) && raw > 1_000_000_000_000) {
    return formatListTime(new Date(raw).toISOString())
  }
  const base = new Date()
  base.setMinutes(base.getMinutes() - Math.max(0, displayGroups.value.length - index - 1))
  return base.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function showBranchDivider(groupIndex: number): boolean {
  const groups = visibleGroups.value
  const current = groups[groupIndex]
  const prev = groups[groupIndex - 1]
  if (!current || isDisplayGroupInherited(current)) return false
  if (groupIndex === 0) return false
  return !!prev && isDisplayGroupInherited(prev)
}

/** Full-width row canvas behind bubbles — inherited history uses a darker strip. */
function messageRowClass(group: DisplayGroup): string {
  const pad = 'py-2 md:py-3 px-3 md:px-5'
  return isDisplayGroupInherited(group) ? `${pad} chat-row-inherited` : `${pad} chat-row`
}

function isUserFileMessage(group: DisplayGroup): boolean {
  if (group.type !== 'message' || group.message?.role !== 'user') return false
  const content = group.message.content
  return typeof content === 'object' && content !== null && content.type === 'file'
}

function userFileAttachment(group: DisplayGroup): MockUserFileAttachment | null {
  if (!isUserFileMessage(group) || group.type !== 'message') return null
  const content = group.message?.content
  if (typeof content !== 'object' || content === null || content.type !== 'file') return null
  return content
}

function userText(group: DisplayGroup): string {
  if (group.type !== 'message' || typeof group.message?.content !== 'string') return ''
  return group.message.content
}

function openToolDetail(
  toolName: string,
  callArgs?: Record<string, unknown>,
  resultContent?: Array<{ type: string; text: string }>,
) {
  toolModal.value = buildToolModal(toolName, callArgs, resultContent)
}

function openBashDetail(
  command: string,
  resultContent?: Array<{ type: string; text: string }>,
  intent?: string,
) {
  toolModal.value = buildBashModal(command, resultContent, intent)
}

function openCompactionDetail(entry: MockCompactionEntry) {
  const sections: { label: string; content: string; markdown?: boolean }[] = [
    { label: '压缩摘要', content: entry.summary, markdown: true },
  ]
  if (entry.details?.readFiles?.length) {
    sections.push({
      label: 'read-files（CompactionEntry.details）',
      content: entry.details.readFiles.join('\n'),
    })
  }
  if (entry.details?.modifiedFiles?.length) {
    sections.push({
      label: 'modified-files（CompactionEntry.details）',
      content: entry.details.modifiedFiles.join('\n'),
    })
  }
  sections.push({
    label: '元数据',
    content: [
      `tokensBefore: ${entry.tokensBefore}`,
      `firstKeptEntryId: ${entry.firstKeptEntryId}`,
      `reason: ${entry.reason ?? 'threshold'}`,
      `entry.id: ${entry.id}`,
    ].join('\n'),
  })
  toolModal.value = { title: '上下文压缩摘要', sections }
}

function navigateToSubagent(sessionId: string) {
  emit('navigate', sessionId)
}

const statusBadgeClass = computed(() => {
  switch (props.session.status) {
    case 'starting':
      return 'bg-blue-100 text-blue-800'
    case 'running':
      return 'bg-green-100 text-green-800'
    case 'idle':
      return 'bg-yellow-100 text-yellow-800'
    case 'error':
      return 'bg-red-100 text-red-800'
    case 'stopped':
      return 'bg-gray-200 text-gray-800'
    default:
      return 'bg-gray-200 text-gray-800'
  }
})

function isStreamingPiece(group: DisplayGroup, pieceIndex: number): boolean {
  if (!isStreaming.value || !streamingAssistantId.value) return false
  if (group.type !== 'grouped_assistant' || group.id !== streamingAssistantId.value) return false
  const piece = group.pieces[pieceIndex]
  return piece?.kind === 'text'
}

function getAssistantContent(assistantId: string) {
  const entry = mockMessages.value.find((e) => e.id === assistantId)
  if (entry?.type !== 'message' || !Array.isArray(entry.message.content)) return null
  return entry.message.content
}

function appendAssistantDelta(assistantId: string, delta: string) {
  const content = getAssistantContent(assistantId)
  if (!content) return
  const last = content[content.length - 1]
  if (last?.type === 'text') {
    last.text += delta
    return
  }
  content.push({ type: 'text', text: delta })
}

function appendAssistantToolCall(assistantId: string, part: MockToolPart) {
  const content = getAssistantContent(assistantId)
  if (!content) return
  content.push(part)
}


async function sendStreamReply(userText: string) {
  const assistantId = `stream-${Date.now()}`
  streamingAssistantId.value = assistantId
  isStreaming.value = true
  streamAbort = new AbortController()

  mockMessages.value.push({
    id: assistantId,
    type: 'message',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
    },
  })
  void scrollToBottom()

  try {
    await runStreamDemoTurn(
      userText,
      props.session.meta?.name ?? props.session.id,
      {
        onTextDelta: (delta) => {
          appendAssistantDelta(assistantId, delta)
          void scrollToBottom()
        },
        onToolCall: (part) => {
          appendAssistantToolCall(assistantId, part)
          void scrollToBottom()
        },
        onToolResult: (entry) => {
          mockMessages.value.push(entry)
          appendSessionMessage(props.session.id, entry)
          void scrollToBottom()
        },
      },
      streamAbort.signal,
    )
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    throw e
  } finally {
    isStreaming.value = false
    streamingAssistantId.value = null
    streamAbort = null
  }
}

const sendMessage = () => {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  mockMessages.value.push({
    id: Date.now().toString(),
    type: 'message',
    message: { role: 'user', content: text },
  })
  appendSessionMessage(props.session.id, mockMessages.value[mockMessages.value.length - 1])
  updateSessionPreview(props.session.id, text)

  inputText.value = ''
  void scrollToBottom()

  if (isStreamDemoSession(props.session.id)) {
    void sendStreamReply(text)
    return
  }

  setTimeout(() => {
    const reply = {
      id: (Date.now() + 1).toString(),
      type: 'message' as const,
      message: {
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: `（${props.session.meta?.name ?? props.session.id}）已收到：${text}` }],
      },
    }
    mockMessages.value.push(reply)
    appendSessionMessage(props.session.id, reply)
    updateSessionPreview(props.session.id, text)
    void scrollToBottom()
  }, 600)
}
</script>

<style scoped>
.chat-header-btn {
  color: var(--app-nav-icon);
}

.chat-header-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.chat-row {
  background: var(--app-chat-message-bg);
}

.chat-row-inherited {
  background: var(--app-chat-message-inherited);
}

.chat-msg-time {
  font-size: 11px;
  line-height: 1;
  color: var(--app-text-muted);
  opacity: 0.85;
  margin-bottom: 4px;
}

.chat-msg-time--left {
  align-self: flex-start;
  margin-left: 2px;
}

.chat-msg-time--right {
  align-self: flex-end;
  margin-right: 2px;
}
</style>
