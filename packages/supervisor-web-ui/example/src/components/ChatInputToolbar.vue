<template>
  <div class="chat-input-toolbar flex items-center justify-between px-2 py-1.5 shrink-0">
    <div class="flex items-center gap-0.5">
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

      <button
        type="button"
        class="toolbar-icon-btn inline-flex items-center"
        title="语音"
        :disabled="disabled"
        @mousedown.prevent
        @click="emit('action', 'voice')"
      >
        <Mic class="w-[19px] h-[19px] stroke-[1.5]" />
      </button>
    </div>

    <div class="flex items-center gap-2 shrink-0">
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
        :class="{ 'send-btn--active': canSend }"
        :disabled="!canSend"
        @mousedown.prevent
        @click="emit('send')"
      >
        发送
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AudioLines, FolderOpen, Mic, Scissors, Smile, Sparkles } from "lucide-vue-next";

export type ChatToolbarAction = "emoji" | "skill" | "attach" | "screenshot" | "voice";

defineProps<{
  disabled?: boolean;
  canSend?: boolean;
}>();

const emit = defineEmits<{
  action: [action: ChatToolbarAction];
  send: [];
}>();

const leftButtons = [
  { id: "emoji" as const, icon: Smile, title: "表情" },
  { id: "skill" as const, icon: Sparkles, title: "技能" },
  { id: "attach" as const, icon: FolderOpen, title: "发送文件" },
];
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

.toolbar-icon-btn:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.toolbar-icon-btn:disabled {
  opacity: 0.4;
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

.send-btn:disabled {
  cursor: not-allowed;
}
</style>
