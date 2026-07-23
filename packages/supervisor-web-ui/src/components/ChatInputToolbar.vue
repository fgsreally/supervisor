<template>
  <div class="chat-input-toolbar flex items-center justify-between px-2 py-1.5 shrink-0">
    <div class="flex items-center gap-0.5">
      <select
        v-if="customCommands?.length"
        class="slash-select"
        title="Custom Slash"
        :disabled="disabled"
        value=""
        @change="onSlashSelect"
      >
        <option value="" disabled>Slash</option>
        <option v-for="command in customCommands" :key="command.name" :value="command.name">
          /{{ command.name }}
        </option>
      </select>
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
        title="截图"
        :disabled="disabled"
        @mousedown.prevent
        @click="emit('action', 'screenshot')"
      >
        <Scissors class="w-[19px] h-[19px] stroke-[1.5]" />
      </button>

      <VoiceInputButton
        :disabled="disabled"
        @transcript="emit('transcript', $event)"
        @error="emit('voice-error', $event)"
      />
    </div>

    <div class="flex items-center gap-2 shrink-0">
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
      <button
        type="button"
        class="toolbar-icon-btn"
        title="对讲"
        :disabled="disabled"
        @mousedown.prevent
      >
        <AudioLines class="w-[19px] h-[19px] stroke-[1.5]" />
      </button>
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
import {
  AudioLines,
  FolderOpen,
  MessageCircleQuestion,
  Scissors,
  Smile,
  Sparkles,
  Square,
} from "lucide-vue-next";
import VoiceInputButton from "./VoiceInputButton.vue";

export type ChatToolbarAction = "emoji" | "skill" | "attach" | "screenshot" | "voice" | "btw";

const props = defineProps<{
  disabled?: boolean;
  canSend?: boolean;
  interrupting?: boolean;
  customCommands?: Array<{ name: string; description: string }>;
}>();

const emit = defineEmits<{
  action: [action: ChatToolbarAction];
  slash: [name: string];
  send: [];
  interrupt: [];
  transcript: [text: string];
  "voice-error": [message: string];
}>();

const leftButtons = [
  { id: "emoji" as const, icon: Smile, title: "表情" },
  { id: "skill" as const, icon: Sparkles, title: "技能" },
  { id: "attach" as const, icon: FolderOpen, title: "发送文件" },
];

function onPrimaryAction() {
  if (props.interrupting) emit("interrupt");
  else emit("send");
}

function onSlashSelect(event: Event) {
  const select = event.target as HTMLSelectElement;
  if (select.value) emit("slash", select.value);
  select.value = "";
}
</script>

<style scoped>
.chat-input-toolbar {
  color: var(--app-toolbar-icon);
}

.toolbar-icon-btn {
  padding: 6px;
  border-radius: 8px;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.slash-select {
  max-width: 86px;
  padding: 5px 7px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 12px;
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
  background: var(--app-border-subtle);
}

.send-btn {
  min-width: 56px;
  padding: 5px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 400;
  background: var(--app-send-disabled-bg);
  color: var(--app-send-disabled-text);
  transition:
    background-color 0.15s,
    color 0.15s;
}

.send-btn--active {
  background: var(--app-accent);
  color: #ffffff;
}

.send-btn--active:hover:not(:disabled) {
  background: var(--app-accent-hover);
}

.send-btn--interrupt {
  background: var(--app-danger, #dc2626);
}

.send-btn__stop-icon {
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.send-btn:disabled {
  cursor: not-allowed;
}
</style>
