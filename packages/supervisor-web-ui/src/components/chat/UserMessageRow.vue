<template>
  <div
    class="flex justify-end items-start gap-2"
    @pointerdown="startLongPress"
    @pointerup="cancelLongPress"
    @pointercancel="cancelLongPress"
    @pointermove="onPointerMove"
    @contextmenu.prevent="openMessageActions"
  >
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
          <span class="slash-command-tag" :class="`slash-command-tag--${slashSource ?? 'custom'}`">
            <Sparkles v-if="slashSource === 'skill'" class="w-3.5 h-3.5" />
            <FileText v-else-if="slashSource === 'prompt'" class="w-3.5 h-3.5" />
            <Plug v-else-if="slashSource === 'mcp'" class="w-3.5 h-3.5" />
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
    <Teleport to="body">
      <Transition name="message-actions">
        <div
          v-if="messageActionsOpen"
          class="message-actions-backdrop"
          @click.self="messageActionsOpen = false"
        >
          <section class="message-actions-sheet">
            <button type="button" @click="confirmRewind">回到这里</button>
            <button type="button" @click="messageActionsOpen = false">取消</button>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import ChatFileBubble from "../ChatFileBubble.vue";
import ChatRichText from "../ChatRichText.vue";
import type { ChatUserFileAttachment } from "@/types/chat-entry";
import { FileText, Plug, RotateCcw, Sparkles, Terminal } from "lucide-vue-next";

const props = defineProps<{
  text: string;
  file?: ChatUserFileAttachment | null;
  timeLabel: string;
  searchHit?: boolean;
  deliveryState?: "queued" | "failed";
  slashSource?: "skill" | "prompt" | "custom" | "mcp";
  rewindable?: boolean;
}>();

const emit = defineEmits<{ rewind: [] }>();
const messageActionsOpen = ref(false);
let longPressTimer: ReturnType<typeof setTimeout> | undefined;
let longPressStart = { x: 0, y: 0 };

const slashParts = computed(() => props.text.match(/^(\/[\w-]+)(?:\s+([\s\S]*))?$/));
const slashCommand = computed(() => slashParts.value?.[1]?.slice(1) ?? "");
const slashRemainder = computed(() => slashParts.value?.[2]?.trim() ?? "");

function startLongPress(event: PointerEvent) {
  if (!props.rewindable || event.pointerType === "mouse") return;
  cancelLongPress();
  longPressStart = { x: event.clientX, y: event.clientY };
  longPressTimer = setTimeout(openMessageActions, 520);
}

function onPointerMove(event: PointerEvent) {
  if (
    Math.abs(event.clientX - longPressStart.x) > 10 ||
    Math.abs(event.clientY - longPressStart.y) > 10
  ) {
    cancelLongPress();
  }
}

function cancelLongPress() {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = undefined;
}

function openMessageActions() {
  cancelLongPress();
  if (props.rewindable) messageActionsOpen.value = true;
}

function confirmRewind() {
  messageActionsOpen.value = false;
  emit("rewind");
}

onBeforeUnmount(cancelLongPress);
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
    display: none;
  }
}

.message-actions-backdrop {
  position: fixed;
  z-index: 110;
  inset: 0;
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 30%);
}
.message-actions-sheet {
  width: 100%;
  padding: 8px 10px calc(10px + env(safe-area-inset-bottom));
}
.message-actions-sheet button {
  width: 100%;
  padding: 13px;
  border-radius: 12px;
  color: var(--app-text-primary);
  background: var(--app-popup-bg);
  font-size: 15px;
}
.message-actions-sheet button + button {
  margin-top: 8px;
}
.message-actions-enter-active,
.message-actions-leave-active {
  transition: opacity 0.2s ease;
}
.message-actions-enter-active .message-actions-sheet,
.message-actions-leave-active .message-actions-sheet {
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.message-actions-enter-from,
.message-actions-leave-to {
  opacity: 0;
}
.message-actions-enter-from .message-actions-sheet,
.message-actions-leave-to .message-actions-sheet {
  transform: translateY(100%);
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

.slash-command-tag--skill {
  color: #075f32;
  border-color: rgb(7 166 90 / 26%);
  background: rgb(231 248 239 / 92%);
}
.slash-command-tag--prompt {
  color: #3f5688;
  border-color: rgb(87 107 149 / 28%);
  background: rgb(232 239 250 / 94%);
}
.slash-command-tag--custom {
  color: #7a4b00;
  border-color: rgb(217 119 6 / 28%);
  background: rgb(255 244 224 / 94%);
}
.slash-command-tag--mcp {
  color: #5640a3;
  border-color: rgb(91 78 180 / 28%);
  background: rgb(238 234 255 / 94%);
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
