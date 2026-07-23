<template>
  <div
    class="min-h-0 flex-1 overflow-y-auto custom-scrollbar"
    ref="containerRef"
    @scroll.passive="onScroll"
  >
    <div v-if="loadingOlder" class="chat-load-older">
      <Loader2 class="w-4 h-4 animate-spin" />
      <span>加载更早消息…</span>
    </div>
    <div
      class="chat-virtual-spacer"
      :style="{ height: `${rowVirtualizer.getTotalSize()}px` }"
    >
      <div
        v-for="virtualRow in rowVirtualizer.getVirtualItems()"
        :key="String(virtualRow.key)"
        :data-index="virtualRow.index"
        :ref="measureRow"
        class="chat-virtual-row"
        :style="{ transform: `translateY(${virtualRow.start}px)` }"
      >
        <ChatMessageGroupRow
          v-if="groups[virtualRow.index]"
          :session-id="sessionId"
          :group="groups[virtualRow.index]!"
          :show-branch-divider="showBranchDivider(virtualRow.index)"
          :show-date-divider="showDateDivider(virtualRow.index)"
          :date-divider-label="dateDividerLabel(groups[virtualRow.index]!)"
          :time-label="messageTimeLabel(groups[virtualRow.index]!)"
          :duration-label="assistantDurationLabel(virtualRow.index)"
          :search-hit="isSearchHit(groups[virtualRow.index]!)"
          :rewindable="rewindableEntryIds.includes(groups[virtualRow.index]!.id)"
          :show-thinking-blocks="showThinkingBlocks"
          :is-streaming="isStreaming"
          :streaming-group-id="streamingGroupId"
          :should-render="assistantShouldRender(virtualRow.index)"
          :retrying="retrying"
          :assistant-avatar-label="assistantAvatarLabel"
          :assistant-avatar-color="assistantAvatarColor"
          :assistant-avatar-icon="assistantAvatarIcon"
          :assistant-avatar-agent-id="assistantAvatarAgentId"
          @open-tool="(name, args, result, entryId) => emit('open-tool', name, args, result, entryId)"
          @open-bash="(cmd, result, intent, entryId) => emit('open-bash', cmd, result, intent, entryId)"
          @navigate="emit('navigate', $event)"
          @open-compaction="emit('open-compaction', $event)"
          @answered="emit('answered')"
          @rewind="emit('rewind', $event)"
          @retry-error="emit('retry-error')"
          @open-actions="openActions(groups[virtualRow.index]!, $event)"
        />
      </div>
    </div>

    <div
      v-if="showStreamingPlaceholder"
      class="py-2 md:py-3 px-3 md:px-5 chat-row"
    >
      <div class="flex justify-start items-start gap-2">
        <AgentAvatar
          v-if="assistantAvatarIcon"
          class="chat-avatar shrink-0"
          :agent-id="assistantAvatarAgentId || sessionId"
          :agent-name="assistantAvatarLabel || 'A'"
          :icon="assistantAvatarIcon"
        />
        <div
          v-else
          class="chat-avatar chat-avatar--agent shrink-0"
          :style="{ backgroundColor: assistantAvatarColor }"
        >
          {{ assistantAvatarLabel }}
        </div>
        <div class="max-w-[75%] flex flex-col items-start min-w-0">
          <span class="chat-msg-time chat-msg-time--agent">{{ streamingTimeLabel }}</span>
          <div
            class="px-3.5 py-2.5 text-[14px] chat-bubble assistant-loading"
            :style="{
              background: 'var(--app-bubble-assistant)',
              borderRadius: 'var(--app-bubble-radius)',
            }"
          >
            <Loader2 class="w-4 h-4 animate-spin shrink-0" />
            <span>思考中…</span>
          </div>
        </div>
      </div>
    </div>

    <MessageContextMenu
      :open="contextMenu.open"
      :mode="contextMenu.mode"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :can-rewind="contextMenu.canRewind"
      :can-fork="contextMenu.canFork"
      :can-copy="contextMenu.canCopy"
      @close="closeContextMenu"
      @rewind="onContextRewind"
      @fork="onContextFork"
      @copy="onContextCopy"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, type ComponentPublicInstance } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { Loader2 } from "lucide-vue-next";
import type { ChatCompactionEntry } from "@/types/chat-entry";
import {
  isGroupedAssistantGroup,
  isDisplayGroupInherited,
  type DisplayGroup,
} from "@/utils/flatten-messages";
import { messageTextContent } from "@/utils/message-content";
import {
  formatChatDateDivider,
  formatMessageClock,
  formatMessageDuration,
  sameCalendarDay,
} from "@/utils/format-time";
import ChatMessageGroupRow from "./ChatMessageGroupRow.vue";
import MessageContextMenu from "./MessageContextMenu.vue";
import AgentAvatar from "../AgentAvatar.vue";

const props = defineProps<{
  sessionId: string;
  groups: DisplayGroup[];
  showThinkingBlocks: boolean;
  isStreaming: boolean;
  streamingGroupId: string | null;
  showStreamingPlaceholder: boolean;
  retrying?: boolean;
  streamingTimeLabel: string;
  searchOpen: boolean;
  searchQuery: string;
  assistantAvatarLabel?: string;
  assistantAvatarColor?: string;
  assistantAvatarIcon?: string | null;
  assistantAvatarAgentId?: string;
  rewindableEntryIds: string[];
  hasOlder?: boolean;
  loadingOlder?: boolean;
}>();

const emit = defineEmits<{
  "load-older": [];
  "open-tool": [
    toolName: string,
    callArgs?: Record<string, unknown>,
    result?: Array<{ type: string; text: string }>,
    resultEntryId?: string,
  ];
  "open-bash": [
    command: string,
    result?: Array<{ type: string; text: string }>,
    intent?: string,
    resultEntryId?: string,
  ];
  navigate: [sessionId: string];
  "open-compaction": [entry: ChatCompactionEntry];
  answered: [];
  rewind: [entryId: string];
  fork: [entryId: string];
  "retry-error": [];
}>();

const LOAD_OLDER_THRESHOLD_PX = 80;

function onScroll() {
  const el = containerRef.value;
  if (!el || !props.hasOlder || props.loadingOlder || props.searchOpen) return;
  if (el.scrollTop <= LOAD_OLDER_THRESHOLD_PX) emit("load-older");
}

const containerRef = ref<HTMLElement | null>(null);
const contextMenu = reactive({
  open: false,
  mode: "menu" as "menu" | "sheet",
  x: 0,
  y: 0,
  entryId: "",
  copyText: "",
  canRewind: false,
  canFork: false,
  canCopy: false,
});

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: props.groups.length,
    getScrollElement: () => containerRef.value,
    estimateSize: () => 160,
    overscan: 8,
    getItemKey: (index: number) => props.groups[index]?.id ?? index,
  })),
);

function measureRow(el: Element | ComponentPublicInstance | null) {
  const node =
    el && typeof el === "object" && "$el" in el
      ? ((el as ComponentPublicInstance).$el as Element | null)
      : (el as Element | null);
  if (node instanceof Element) rowVirtualizer.value.measureElement(node);
}

function showBranchDivider(groupIndex: number): boolean {
  const groups = props.groups;
  const current = groups[groupIndex];
  const prev = groups[groupIndex - 1];
  if (!current || isDisplayGroupInherited(current)) return false;
  if (groupIndex === 0) return false;
  return !!prev && isDisplayGroupInherited(prev);
}

function groupTimestamp(group: DisplayGroup): number | null {
  if ("createdAt" in group && typeof group.createdAt === "number" && group.createdAt > 0) {
    return group.createdAt;
  }
  const raw = Number.parseInt(group.id, 10);
  if (Number.isFinite(raw) && raw > 1_000_000_000_000) return raw;
  return null;
}

function showDateDivider(groupIndex: number): boolean {
  const current = props.groups[groupIndex];
  if (!current) return false;
  const currentTs = groupTimestamp(current);
  if (currentTs == null) return false;
  if (groupIndex === 0) return true;
  const prev = props.groups[groupIndex - 1];
  if (!prev) return true;
  const prevTs = groupTimestamp(prev);
  if (prevTs == null) return true;
  return !sameCalendarDay(currentTs, prevTs);
}

function dateDividerLabel(group: DisplayGroup): string {
  const ts = groupTimestamp(group);
  return ts == null ? "" : formatChatDateDivider(ts);
}

function messageTimeLabel(group: DisplayGroup): string {
  const ts = groupTimestamp(group);
  if (ts != null) return formatMessageClock(ts);
  return formatMessageClock(Date.now());
}

function assistantDurationLabel(groupIndex: number): string | null {
  const group = props.groups[groupIndex];
  if (!group || !isGroupedAssistantGroup(group)) return null;
  if (props.isStreaming && props.streamingGroupId === group.id) return null;

  let startedAt: number | null = null;
  for (let i = groupIndex - 1; i >= 0; i -= 1) {
    const prev = props.groups[i];
    if (!prev) continue;
    if (prev.type === "message" && prev.message?.role === "user") {
      startedAt = groupTimestamp(prev);
      break;
    }
  }

  const endedAt =
    typeof group.endedAt === "number" && group.endedAt > 0
      ? group.endedAt
      : groupTimestamp(group);
  if (startedAt == null || endedAt == null || endedAt < startedAt) return null;
  return formatMessageDuration(endedAt - startedAt);
}

function isActionableGroup(group: DisplayGroup): boolean {
  return (
    (group.type === "message" && group.message?.role === "user") ||
    group.type === "grouped_assistant"
  );
}

function openActions(
  group: DisplayGroup,
  payload: { mode: "menu" | "sheet"; x: number; y: number },
) {
  if (!isActionableGroup(group)) return;
  const copyText = actionableCopyText(group);
  contextMenu.open = true;
  contextMenu.mode = payload.mode;
  contextMenu.x = payload.x;
  contextMenu.y = payload.y;
  contextMenu.entryId = group.id;
  contextMenu.copyText = copyText;
  contextMenu.canRewind = props.rewindableEntryIds.includes(group.id);
  contextMenu.canFork = true;
  contextMenu.canCopy = copyText.length > 0;
}

function closeContextMenu() {
  contextMenu.open = false;
  contextMenu.entryId = "";
  contextMenu.copyText = "";
  contextMenu.canCopy = false;
}

function onContextRewind() {
  const entryId = contextMenu.entryId;
  closeContextMenu();
  if (entryId) emit("rewind", entryId);
}

function onContextFork() {
  const entryId = contextMenu.entryId;
  closeContextMenu();
  if (entryId) emit("fork", entryId);
}

async function onContextCopy() {
  const text = contextMenu.copyText;
  closeContextMenu();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore clipboard failures
  }
}

function actionableCopyText(group: DisplayGroup): string {
  if (group.type === "message" && group.message?.role === "user") {
    return messageTextContent(group.message?.content).trim();
  }
  if (isGroupedAssistantGroup(group)) {
    return group.pieces
      .filter((piece) => piece.kind === "text")
      .map((piece) => piece.text)
      .join("\n")
      .trim();
  }
  return "";
}

function groupMatchesSearch(group: DisplayGroup, q: string): boolean {
  if (group.type === "message" && group.message) {
    const content = group.message.content;
    if (
      typeof content === "object" &&
      content !== null &&
      !Array.isArray(content) &&
      content.type === "file"
    ) {
      return content.name.toLowerCase().includes(q);
    }
    if (typeof content === "string") return content.toLowerCase().includes(q);
    if (Array.isArray(content)) {
      return content.some((p) => p.type === "text" && p.text.toLowerCase().includes(q));
    }
  }
  if (group.type === "grouped_assistant") {
    return group.pieces.some(
      (p) =>
        (p.kind === "text" && p.text.toLowerCase().includes(q)) ||
        (p.kind === "thinking" && p.text.toLowerCase().includes(q)),
    );
  }
  if (group.type === "compaction") return group.summary.toLowerCase().includes(q);
  if (group.type === "system") return group.content.toLowerCase().includes(q);
  return false;
}

function isSearchHit(group: DisplayGroup): boolean {
  const q = props.searchQuery.trim().toLowerCase();
  return props.searchOpen && !!q && groupMatchesSearch(group, q);
}

function assistantDisplayPieces(group: Extract<DisplayGroup, { type: "grouped_assistant" }>) {
  return group.pieces.filter((piece) => props.showThinkingBlocks || piece.kind !== "thinking");
}

function shouldRenderAssistantGroup(
  group: Extract<DisplayGroup, { type: "grouped_assistant" }>,
): boolean {
  if (group.assets.length > 0) return true;
  if (assistantDisplayPieces(group).length > 0) return true;
  if (!props.isStreaming || props.streamingGroupId !== group.id) return false;
  const hasPendingTool = group.pieces.some(
    (p) => (p.kind === "bash" || p.kind === "toolStep") && !p.result,
  );
  if (hasPendingTool) return true;
  const lastPiece = group.pieces[group.pieces.length - 1];
  if (!lastPiece) return true;
  if (lastPiece.kind === "text") return false;
  if (lastPiece.kind === "thinking" && !props.showThinkingBlocks) return true;
  return false;
}

function assistantShouldRender(index: number): boolean {
  const group = props.groups[index];
  if (!group || !isGroupedAssistantGroup(group)) return true;
  return shouldRenderAssistantGroup(group);
}

async function scrollToBottom() {
  await nextTick();
  if (props.groups.length > 0) {
    rowVirtualizer.value.scrollToIndex(props.groups.length - 1, { align: "end" });
  }
  await nextTick();
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight;
  }
}

defineExpose({ scrollToBottom, containerRef });
</script>

<style scoped>
.chat-virtual-spacer {
  width: 100%;
  position: relative;
}

.chat-virtual-row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.chat-load-older {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 12px 4px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.chat-row {
  background: var(--app-chat-message-bg);
}

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
