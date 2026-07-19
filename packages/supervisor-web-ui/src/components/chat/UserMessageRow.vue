<template>
  <div class="flex justify-end items-start gap-2">
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
        <ChatRichText :content="text" class="relative z-10" />
      </div>
    </div>
    <div class="chat-avatar chat-avatar--user shrink-0">U</div>
  </div>
</template>

<script setup lang="ts">
import ChatFileBubble from "../ChatFileBubble.vue";
import ChatRichText from "../ChatRichText.vue";
import type { ChatUserFileAttachment } from "@/types/chat-entry";

defineProps<{
  text: string;
  file?: ChatUserFileAttachment | null;
  timeLabel: string;
  searchHit?: boolean;
  deliveryState?: "queued" | "failed";
}>();
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
