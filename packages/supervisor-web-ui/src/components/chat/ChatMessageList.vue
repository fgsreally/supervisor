<template>
  <div class="min-h-0 flex-1 overflow-y-auto custom-scrollbar" ref="containerRef">
    <template v-for="(group, groupIndex) in groups" :key="group.id">
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

      <div
        v-if="showDateDivider(groupIndex)"
        class="chat-date-divider"
        style="background: var(--app-chat-message-bg)"
      >
        <span>{{ dateDividerLabel(group) }}</span>
      </div>

      <div
        v-if="(group.type === 'notice' || group.type === 'system') && group.content"
        class="chat-date-divider"
        style="background: var(--app-chat-message-bg)"
      >
        <span>{{ group.content }}</span>
      </div>

      <div
        v-else-if="group.type === 'llm_error'"
        class="py-2 md:py-3 px-3 md:px-5 chat-row"
        style="background: var(--app-chat-message-bg)"
      >
        <LlmErrorCard
          :content="group.content"
          :retrying="retrying"
          :avatar-label="assistantAvatarLabel"
          :avatar-color="assistantAvatarColor"
          @retry="emit('retry-error')"
        />
      </div>

      <div v-else :class="messageRowClass(group)">
        <ShadowMessageRow
          v-if="group.type === 'message' && group.message?.role === 'user' && group.shadowSource"
          :text="userText(group)"
          :queued="group.deliveryState === 'queued'"
        />
        <UserMessageRow
          v-else-if="group.type === 'message' && group.message?.role === 'user'"
          :text="userText(group)"
          :file="userFileAttachment(group)"
          :time-label="messageTimeLabel(group)"
          :search-hit="isSearchHit(group)"
          :delivery-state="group.deliveryState"
          :slash-source="group.slashSource"
          :rewindable="rewindableEntryIds.includes(group.id)"
          @rewind="emit('rewind', group.id)"
          @open-actions="openActions(group, $event)"
        />
        <div v-else-if="group.type === 'slash'" class="slash-row">
          <Terminal class="w-4 h-4 shrink-0" />
          <span class="slash-tag">Custom</span>
          <code>{{ group.content }}</code>
        </div>
        <MessageAssets
          v-if="group.type === 'message' && group.message?.role === 'user' && group.assets?.length"
          :session-id="sessionId"
          :assets="group.assets"
        />

        <AssistantMessageGroup
          v-else-if="isGroupedAssistantGroup(group) && shouldRenderAssistantGroup(group)"
          :session-id="sessionId"
          :group="group"
          :show-thinking-blocks="showThinkingBlocks"
          :is-streaming="isStreaming"
          :streaming-group-id="streamingGroupId"
          :time-label="messageTimeLabel(group)"
          :duration-label="assistantDurationLabel(groupIndex)"
          :search-hit="isSearchHit(group)"
          :avatar-label="assistantAvatarLabel"
          :avatar-color="assistantAvatarColor"
          :avatar-icon="assistantAvatarIcon"
          :avatar-agent-id="assistantAvatarAgentId"
          @open-tool="(name, args, result) => emit('open-tool', name, args, result)"
          @open-bash="(cmd, result, intent) => emit('open-bash', cmd, result, intent)"
          @navigate="emit('navigate', $event)"
          @answered="emit('answered')"
          @open-actions="openActions(group, $event)"
        />
        <MessageAssets
          v-if="group.type === 'grouped_assistant' && group.assets.length"
          class="assistant-assets"
          :session-id="sessionId"
          :assets="group.assets"
        />

        <CompactionBanner
          v-else-if="group.type === 'compaction'"
          :entry="group"
          @open="emit('open-compaction', group)"
        />
      </div>
    </template>

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
import { nextTick, reactive, ref } from "vue";
import { Loader2, Terminal } from "lucide-vue-next";
import type { ChatCompactionEntry } from "@/types/chat-entry";
import type { ChatUserFileAttachment } from "@/types/chat-entry";
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
import UserMessageRow from "./UserMessageRow.vue";
import ShadowMessageRow from "./ShadowMessageRow.vue";
import AssistantMessageGroup from "./AssistantMessageGroup.vue";
import LlmErrorCard from "./LlmErrorCard.vue";
import CompactionBanner from "../CompactionBanner.vue";
import MessageAssets from "./MessageAssets.vue";
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
}>();

const emit = defineEmits<{
  "open-tool": [
    toolName: string,
    callArgs?: Record<string, unknown>,
    result?: Array<{ type: string; text: string }>,
  ];
  "open-bash": [command: string, result?: Array<{ type: string; text: string }>, intent?: string];
  navigate: [sessionId: string];
  "open-compaction": [entry: ChatCompactionEntry];
  answered: [];
  rewind: [entryId: string];
  fork: [entryId: string];
  "retry-error": [];
}>();

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

function messageRowClass(group: DisplayGroup): string {
  const pad = "py-2 md:py-3 px-3 md:px-5";
  return isDisplayGroupInherited(group) ? `${pad} chat-row-inherited` : `${pad} chat-row`;
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
    // ignore clipboard failures (permissions / insecure context)
  }
}

function actionableCopyText(group: DisplayGroup): string {
  if (group.type === "message" && group.message?.role === "user") {
    return userText(group).trim();
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

function isUserFileMessage(group: DisplayGroup): boolean {
  if (group.type !== "message" || group.message?.role !== "user") return false;
  const content = group.message.content;
  return (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content) &&
    content.type === "file"
  );
}

function userFileAttachment(group: DisplayGroup): ChatUserFileAttachment | null {
  if (!isUserFileMessage(group) || group.type !== "message") return null;
  const content = group.message?.content;
  if (
    typeof content !== "object" ||
    content === null ||
    Array.isArray(content) ||
    content.type !== "file"
  )
    return null;
  return content;
}

function userText(group: DisplayGroup): string {
  if (group.type !== "message") return "";
  return messageTextContent(group.message?.content);
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

async function scrollToBottom() {
  await nextTick();
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight;
  }
}

defineExpose({ scrollToBottom, containerRef });
</script>

<style scoped>
.chat-date-divider {
  display: flex;
  justify-content: center;
  padding: 10px 12px 4px;
}

.chat-date-divider span {
  padding: 3px 10px;
  border-radius: 4px;
  color: var(--app-text-secondary);
  background: color-mix(in srgb, var(--app-hover) 80%, transparent);
  font-size: 12px;
  line-height: 1.4;
}

.slash-row {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 4px 16px;
  padding: 8px 10px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 8px;
  color: var(--app-text-secondary);
  background: var(--app-hover);
}

.slash-tag {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  background: var(--app-chat-bg);
}
</style>

<style scoped>
.chat-row {
  background: var(--app-chat-message-bg);
}

.chat-row-inherited {
  background: var(--app-chat-message-inherited);
}

.assistant-assets {
  margin-left: 44px;
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
