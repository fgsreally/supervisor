<template>
  <div class="flex-1 overflow-y-auto custom-scrollbar" ref="containerRef">
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

      <div :class="messageRowClass(group)">
        <UserMessageRow
          v-if="group.type === 'message' && group.message?.role === 'user'"
          :text="userText(group)"
          :file="userFileAttachment(group)"
          :time-label="messageTimeLabel(group)"
          :search-hit="isSearchHit(group)"
          :delivery-state="group.deliveryState"
          :slash-source="group.slashSource"
          :rewindable="rewindableEntryIds.includes(group.id)"
          @rewind="emit('rewind', group.id)"
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
          :search-hit="isSearchHit(group)"
          :avatar-label="assistantAvatarLabel"
          :avatar-color="assistantAvatarColor"
          @open-tool="(name, args, result) => emit('open-tool', name, args, result)"
          @open-bash="(cmd, result, intent) => emit('open-bash', cmd, result, intent)"
          @navigate="emit('navigate', $event)"
          @answered="emit('answered')"
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

        <div v-else-if="group.type === 'system'" class="flex justify-center px-4">
          <span class="text-[12px] text-center" style="color: var(--app-text-muted)">{{
            group.content
          }}</span>
        </div>
      </div>
    </template>

    <div v-if="showStreamingPlaceholder" class="py-2 md:py-3 px-3 md:px-5 chat-row">
      <div class="flex justify-start items-start gap-2">
        <div
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
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from "vue";
import { Loader2, Terminal } from "lucide-vue-next";
import type { ChatCompactionEntry } from "@/types/chat-entry";
import type { ChatUserFileAttachment } from "@/types/chat-entry";
import {
  isGroupedAssistantGroup,
  isDisplayGroupInherited,
  type DisplayGroup,
} from "@/utils/flatten-messages";
import { messageTextContent } from "@/utils/message-content";
import { formatListTime } from "@/utils/format-time";
import UserMessageRow from "./UserMessageRow.vue";
import AssistantMessageGroup from "./AssistantMessageGroup.vue";
import CompactionBanner from "../CompactionBanner.vue";
import MessageAssets from "./MessageAssets.vue";

const props = defineProps<{
  sessionId: string;
  groups: DisplayGroup[];
  showThinkingBlocks: boolean;
  isStreaming: boolean;
  streamingGroupId: string | null;
  showStreamingPlaceholder: boolean;
  streamingTimeLabel: string;
  searchOpen: boolean;
  searchQuery: string;
  assistantAvatarLabel?: string;
  assistantAvatarColor?: string;
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
}>();

const containerRef = ref<HTMLElement | null>(null);

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

function messageTimeLabel(group: DisplayGroup): string {
  const createdAt = "createdAt" in group ? group.createdAt : undefined;
  if (createdAt && createdAt > 1_000_000_000_000) {
    return formatListTime(new Date(createdAt).toISOString());
  }
  const raw = Number.parseInt(group.id, 10);
  if (Number.isFinite(raw) && raw > 1_000_000_000_000) {
    return formatListTime(new Date(raw).toISOString());
  }
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
