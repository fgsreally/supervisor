<template>
  <div class="llm-error-row flex justify-start items-start gap-2">
    <div
      class="chat-avatar chat-avatar--agent shrink-0"
      :style="{ backgroundColor: avatarColor }"
    >
      {{ avatarLabel }}
    </div>
    <div class="max-w-[75%] flex flex-col items-start min-w-0 w-full">
      <div class="llm-error-card">
        <div class="llm-error-card__title">回复失败</div>
        <div class="llm-error-card__body">{{ content }}</div>
        <button
          type="button"
          class="llm-error-card__retry"
          :disabled="retrying"
          @click="$emit('retry')"
        >
          <Loader2 v-if="retrying" class="w-3.5 h-3.5 animate-spin" />
          <RefreshCw v-else class="w-3.5 h-3.5" />
          {{ retrying ? "重试中…" : "重试" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loader2, RefreshCw } from "lucide-vue-next";

defineProps<{
  content: string;
  retrying?: boolean;
  avatarLabel?: string;
  avatarColor?: string;
}>();

defineEmits<{ retry: [] }>();
</script>

<style scoped>
.llm-error-card {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--app-bubble-radius, 12px);
  border: 1px solid color-mix(in srgb, #e11d48 35%, transparent);
  background: color-mix(in srgb, #e11d48 8%, var(--app-bubble-assistant, #fff));
  color: var(--app-text-primary);
}

.llm-error-card__title {
  font-size: 13px;
  font-weight: 600;
  color: #e11d48;
  margin-bottom: 6px;
}

.llm-error-card__body {
  font-size: 13px;
  line-height: 1.5;
  color: var(--app-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 10px;
}

.llm-error-card__retry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  background: #e11d48;
  transition: opacity 0.15s;
}

.llm-error-card__retry:hover:not(:disabled) {
  opacity: 0.9;
}

.llm-error-card__retry:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat-avatar {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}
</style>
