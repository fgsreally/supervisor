<template>
  <div class="flex justify-end items-start gap-2">
    <button
      v-if="rewindable"
      type="button"
      class="message-rewind"
      title="回到这一步"
      aria-label="回到这一步"
      @click="emit('rewind')"
    >
      <RotateCcw class="h-3.5 w-3.5" />
    </button>
    <div class="max-w-[75%] flex flex-col items-end min-w-0">
      <span class="chat-msg-time chat-msg-time--user">{{ timeLabel }}</span>
      <span v-if="deliveryState" class="chat-msg-delivery" :class="deliveryState">
        {{ deliveryState === "queued" ? "排队中" : "发送失败" }}
      </span>
      <ChatFileBubble v-if="file" :file="file" class="relative" />
      <div
        v-else
        class="relative px-3.5 py-2.5 text-[14px] chat-bubble chat-bubble--user"
        :style="{ background: 'var(--app-bubble-user)', borderRadius: 'var(--app-bubble-radius)' }"
        :class="{ 'ring-2 ring-[#07c160]/40': searchHit }"
      >
        <div
          class="absolute top-3 w-2 h-2 rotate-45 -right-1 chat-bubble-tail"
          :style="{ background: 'var(--app-bubble-user)' }"
        />
        <div v-if="slashCommand" class="relative z-10 slash-message">
          <span class="slash-command-tag">
            <Sparkles v-if="slashSource === 'skill'" class="w-3.5 h-3.5" />
            <FileText v-else-if="slashSource === 'prompt'" class="w-3.5 h-3.5" />
            <Terminal v-else class="w-3.5 h-3.5" />
            <strong>{{ slashCommand }}</strong>
          </span>
          <span v-if="slashRemainder" class="slash-command-divider" />
          <ChatRichText
            v-if="slashRemainder"
            class="slash-command-content"
            :content="slashRemainder"
          />
        </div>
        <ChatRichText v-else :content="text" class="relative z-10" />
      </div>
    </div>
    <div class="chat-avatar chat-avatar--user shrink-0">U</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ChatFileBubble from "../ChatFileBubble.vue";
import ChatRichText from "../ChatRichText.vue";
import type { ChatUserFileAttachment } from "@/types/chat-entry";
import { FileText, RotateCcw, Sparkles, Terminal } from "lucide-vue-next";

const props = defineProps<{
  text: string;
  file?: ChatUserFileAttachment | null;
  timeLabel: string;
  searchHit?: boolean;
  deliveryState?: "queued" | "failed";
  slashSource?: "skill" | "prompt" | "custom";
  rewindable?: boolean;
}>();

const emit = defineEmits<{ rewind: [] }>();

const slashParts = computed(() => props.text.match(/^(\/[\w-]+)(?:\s+([\s\S]*))?$/));
const slashCommand = computed(() => slashParts.value?.[1] ?? "");
const slashRemainder = computed(() => slashParts.value?.[2]?.trim() ?? "");
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

.message-rewind {
  display: inline-grid;
  width: 26px;
  height: 26px;
  margin-top: 17px;
  flex: none;
  place-items: center;
  border-radius: 6px;
  color: var(--app-text-muted);
  opacity: 0;
  transition:
    opacity 0.15s ease,
    color 0.15s ease,
    background-color 0.15s ease;
}

:global(.chat-row:hover) .message-rewind,
.message-rewind:focus-visible {
  opacity: 1;
}

.message-rewind:hover,
.message-rewind:focus-visible {
  color: #07a65a;
  background: var(--app-hover);
  outline: none;
}

@media (hover: none) {
  .message-rewind {
    opacity: 0.72;
  }
}

.chat-msg-time--user {
  align-self: flex-end;
  margin-right: 2px;
}

.chat-msg-delivery {
  margin: 0 2px 4px 0;
  color: var(--app-text-muted);
  font-size: 11px;
}

.chat-msg-delivery.failed {
  color: #dc2626;
}

.slash-message {
  display: flex;
  align-items: center;
  gap: 9px;
}

.slash-command-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid rgb(7 166 90 / 24%);
  border-radius: 6px;
  color: #075f32;
  background: rgb(255 255 255 / 72%);
  font-size: 12px;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.slash-command-tag:hover {
  background: rgb(255 255 255 / 92%);
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
}

.slash-command-divider {
  width: 1px;
  align-self: stretch;
  background: rgb(25 25 25 / 12%);
}

.slash-command-content {
  min-width: 0;
  color: #191919;
}

@media (max-width: 480px) {
  .slash-message {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .slash-command-divider {
    display: none;
  }
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

.chat-avatar--user {
  background: #d1d5db;
  color: #4b5563;
}

.chat-bubble--user {
  color: #191919;
}
</style>
