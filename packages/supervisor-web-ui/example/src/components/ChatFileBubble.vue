<template>
  <div class="chat-file-bubble">
    <div class="chat-file-bubble__body">
      <div class="chat-file-bubble__info">
        <div class="chat-file-bubble__name">{{ file.name }}</div>
        <div class="chat-file-bubble__size">{{ file.size }}</div>
      </div>
      <div class="chat-file-bubble__icon" :class="iconClass">
        {{ iconLetter }}
      </div>
    </div>
    <div class="chat-file-bubble__footer">
      <span class="chat-file-bubble__footer-label">Supervisor</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { MockUserFileAttachment } from "../mock/types";

const props = defineProps<{
  file: MockUserFileAttachment;
}>();

const iconLetter = computed(() => {
  switch (props.file.ext) {
    case "docx":
      return "W";
    case "pdf":
      return "P";
    case "xlsx":
      return "X";
    default:
      return "F";
  }
});

const iconClass = computed(() => {
  switch (props.file.ext) {
    case "docx":
      return "chat-file-bubble__icon--docx";
    case "pdf":
      return "chat-file-bubble__icon--pdf";
    case "xlsx":
      return "chat-file-bubble__icon--xlsx";
    default:
      return "chat-file-bubble__icon--generic";
  }
});
</script>

<style scoped>
.chat-file-bubble {
  width: min(100%, 280px);
  background: var(--app-file-bubble-bg);
  border-radius: 4px;
  overflow: hidden;
}

.chat-file-bubble__body {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px 10px;
}

.chat-file-bubble__info {
  flex: 1;
  min-width: 0;
}

.chat-file-bubble__name {
  font-size: 14px;
  line-height: 1.4;
  color: var(--app-file-bubble-name);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.chat-file-bubble__size {
  margin-top: 4px;
  font-size: 12px;
  color: var(--app-file-bubble-size);
}

.chat-file-bubble__icon {
  width: 42px;
  height: 42px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 600;
  color: #ffffff;
  flex-shrink: 0;
}

.chat-file-bubble__icon--docx {
  background: #4a8cf7;
}

.chat-file-bubble__icon--pdf {
  background: #e74c3c;
}

.chat-file-bubble__icon--xlsx {
  background: #3cb371;
}

.chat-file-bubble__icon--generic {
  background: #8e8e8e;
}

.chat-file-bubble__footer {
  border-top: 1px solid var(--app-file-bubble-footer-border);
  padding: 6px 14px;
}

.chat-file-bubble__footer-label {
  font-size: 11px;
  color: var(--app-file-bubble-footer-text);
}
</style>
