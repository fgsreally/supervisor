<template>
  <div>
    <div
      v-if="showBranchDivider"
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
      v-if="showDateDivider"
      class="chat-date-divider"
      style="background: var(--app-chat-message-bg)"
    >
      <span>{{ dateDividerLabel }}</span>
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

    <div v-else :class="messageRowClass">
      <ShadowMessageRow
        v-if="group.type === 'message' && group.message?.role === 'user' && group.shadowSource"
        :text="userText"
        :queued="group.deliveryState === 'queued'"
      />
      <UserMessageRow
        v-else-if="group.type === 'message' && group.message?.role === 'user'"
        :text="userText"
        :file="userFile"
        :time-label="timeLabel"
        :search-hit="searchHit"
        :delivery-state="group.deliveryState"
        :slash-source="group.slashSource"
        :rewindable="rewindable"
        @rewind="emit('rewind', group.id)"
        @open-actions="emit('open-actions', $event)"
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
        v-else-if="isGroupedAssistantGroup(group) && shouldRender"
        :session-id="sessionId"
        :group="group"
        :show-thinking-blocks="showThinkingBlocks"
        :is-streaming="isStreaming"
        :streaming-group-id="streamingGroupId"
        :time-label="timeLabel"
        :duration-label="durationLabel"
        :search-hit="searchHit"
        :avatar-label="assistantAvatarLabel"
        :avatar-color="assistantAvatarColor"
        :avatar-icon="assistantAvatarIcon"
        :avatar-agent-id="assistantAvatarAgentId"
        @open-tool="(name, args, result, entryId) => emit('open-tool', name, args, result, entryId)"
        @open-bash="(cmd, result, intent, entryId) => emit('open-bash', cmd, result, intent, entryId)"
        @navigate="emit('navigate', $event)"
        @answered="emit('answered')"
        @open-actions="emit('open-actions', $event)"
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
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Terminal } from "lucide-vue-next";
import type { ChatCompactionEntry, ChatUserFileAttachment } from "@/types/chat-entry";
import {
  isDisplayGroupInherited,
  isGroupedAssistantGroup,
  type DisplayGroup,
} from "@/utils/flatten-messages";
import { messageTextContent } from "@/utils/message-content";
import UserMessageRow from "./UserMessageRow.vue";
import ShadowMessageRow from "./ShadowMessageRow.vue";
import AssistantMessageGroup from "./AssistantMessageGroup.vue";
import LlmErrorCard from "./LlmErrorCard.vue";
import CompactionBanner from "../CompactionBanner.vue";
import MessageAssets from "./MessageAssets.vue";

const props = defineProps<{
  sessionId: string;
  group: DisplayGroup;
  showBranchDivider: boolean;
  showDateDivider: boolean;
  dateDividerLabel: string;
  timeLabel: string;
  durationLabel: string | null;
  searchHit: boolean;
  rewindable: boolean;
  showThinkingBlocks: boolean;
  isStreaming: boolean;
  streamingGroupId: string | null;
  shouldRender: boolean;
  retrying?: boolean;
  assistantAvatarLabel?: string;
  assistantAvatarColor?: string;
  assistantAvatarIcon?: string | null;
  assistantAvatarAgentId?: string;
}>();

const emit = defineEmits<{
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
  "retry-error": [];
  "open-actions": [payload: { mode: "menu" | "sheet"; x: number; y: number }];
}>();

const messageRowClass = computed(() => {
  const pad = "py-2 md:py-3 px-3 md:px-5";
  return isDisplayGroupInherited(props.group) ? `${pad} chat-row-inherited` : `${pad} chat-row`;
});

const userText = computed(() => {
  if (props.group.type !== "message") return "";
  return messageTextContent(props.group.message?.content);
});

const userFile = computed((): ChatUserFileAttachment | null => {
  if (props.group.type !== "message" || props.group.message?.role !== "user") return null;
  const content = props.group.message.content;
  if (
    typeof content !== "object" ||
    content === null ||
    Array.isArray(content) ||
    content.type !== "file"
  ) {
    return null;
  }
  return content;
});
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

.chat-row {
  background: var(--app-chat-message-bg);
}

.chat-row-inherited {
  background: var(--app-chat-message-inherited);
}

.assistant-assets {
  margin-left: 44px;
}
</style>
