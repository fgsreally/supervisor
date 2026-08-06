<template>
  <div class="chat-input-toolbar flex items-center justify-between px-2 py-1.5 shrink-0">
    <div class="toolbar-group flex items-center">
      <button
        v-for="btn in leftButtons"
        :key="btn.id"
        type="button"
        class="toolbar-icon-btn"
        :title="btn.title"
        :disabled="disabled"
        @mousedown.prevent
        @click="emit('action', btn.id)"
      >
        <component :is="btn.icon" class="w-[19px] h-[19px] stroke-[1.5]" />
      </button>

      <button
        type="button"
        class="toolbar-icon-btn inline-flex items-center"
        title="上传图片"
        :disabled="disabled"
        @mousedown.prevent
        @click="emit('action', 'upload-image')"
      >
        <ImagePlus class="w-[19px] h-[19px] stroke-[1.5]" />
      </button>
    </div>

    <div class="toolbar-group flex items-center shrink-0">
      <button
        type="button"
        class="toolbar-icon-btn btw-btn"
        title="顺便问一下"
        :disabled="disabled"
        @mousedown.prevent
        @click="emit('action', 'btw')"
      >
        <MessageCircleQuestion class="w-[19px] h-[19px] stroke-[1.5]" />
      </button>
      <VoiceInputButton
        :disabled="disabled"
        @start="emit('voice-start')"
        @end="emit('voice-end')"
        @preview="emit('voice-preview', $event)"
        @transcript="emit('transcript', $event)"
        @error="emit('voice-error', $event)"
      />
      <div class="toolbar-divider" />
      <button
        type="button"
        class="send-btn"
        :class="{
          'send-btn--active': canSend || interrupting,
          'send-btn--interrupt': interrupting,
        }"
        :disabled="interrupting ? false : !canSend"
        :aria-label="interrupting ? '打断当前会话' : '发送消息'"
        :title="interrupting ? '打断当前会话' : '发送消息'"
        @mousedown.prevent
        @click="onPrimaryAction"
      >
        <Square v-if="interrupting" class="send-btn__stop-icon" aria-hidden="true" />
        <template v-else>发送</template>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FolderOpen, ImagePlus, MessageCircleQuestion, Smile, Sparkles, Square } from "lucide-vue-next";
import VoiceInputButton from "./VoiceInputButton.vue";

export type ChatToolbarAction = "emoji" | "skill" | "attach" | "upload-image" | "voice" | "btw";

const props = defineProps<{
  disabled?: boolean;
  canSend?: boolean;
  interrupting?: boolean;
}>();

const emit = defineEmits<{
  action: [action: ChatToolbarAction];
  send: [];
  interrupt: [];
  "voice-start": [];
  "voice-end": [];
  "voice-preview": [text: string];
  transcript: [text: string];
  "voice-error": [message: string];
}>();

const leftButtons = [
  { id: "emoji" as const, icon: Smile, title: "表情" },
  { id: "skill" as const, icon: Sparkles, title: "斜杠命令（/goal /plan /技能 /Prompt）" },
  { id: "attach" as const, icon: FolderOpen, title: "发送文件" },
];

function onPrimaryAction() {
  if (props.interrupting) emit("interrupt");
  else emit("send");
}
</script>

<style scoped>
.chat-input-toolbar {
  color: var(--app-toolbar-icon);
}

.toolbar-group {
  gap: 2px;
}

.toolbar-icon-btn {
  padding: 6px;
  border-radius: 8px;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.toolbar-icon-btn:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.toolbar-icon-btn:disabled {
  opacity: 0.4;
}

.btw-btn {
  color: #576b95;
}

.toolbar-divider {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--app-border-subtle);
}

.send-btn {
  min-width: 56px;
  height: 32px;
  padding: 5px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 400;
  background: var(--app-send-disabled-bg);
  color: var(--app-send-disabled-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.15s,
    color 0.15s,
    min-width 0.15s,
    padding 0.15s;
}

.send-btn--active {
  background: var(--app-accent);
  color: #ffffff;
}

.send-btn--active:hover:not(:disabled) {
  background: var(--app-accent-hover);
}

.send-btn--interrupt {
  min-width: 32px;
  width: 32px;
  padding: 0;
  background: var(--app-accent);
}

.send-btn--interrupt:hover:not(:disabled) {
  background: var(--app-accent-hover);
}

.send-btn__stop-icon {
  width: 12px;
  height: 12px;
  fill: currentColor;
}

.send-btn:disabled {
  cursor: not-allowed;
}
</style>
