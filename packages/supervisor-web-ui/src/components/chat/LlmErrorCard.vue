<template>
  <div class="llm-error-row flex justify-start items-start gap-2"><div class="chat-avatar chat-avatar--agent shrink-0" :style="{ backgroundColor: avatarColor }">{{ avatarLabel }}</div><div class="max-w-[75%] flex flex-col items-start min-w-0 w-full"><div class="llm-error-card"><div class="llm-error-card__title">{{ t("chat.message.replyFailed") }}</div><div class="llm-error-card__body">{{ content }}</div><button type="button" class="llm-error-card__retry" :disabled="retrying" @click="$emit('retry')"><Loader2 v-if="retrying" class="w-3.5 h-3.5 animate-spin" /><RefreshCw v-else class="w-3.5 h-3.5" />{{ retrying ? t("chat.message.retrying") : t("chat.message.retry") }}</button></div></div></div>
</template>
<script setup lang="ts">
import { Loader2, RefreshCw } from "lucide-vue-next";
import { useI18n } from "@/i18n";
const { t } = useI18n();
defineProps<{ content: string; retrying?: boolean; avatarLabel?: string; avatarColor?: string }>();
defineEmits<{ retry: [] }>();
</script>
<style scoped>
.llm-error-card { width: 100%; padding: 12px 14px; border-radius: var(--app-bubble-radius, 12px); border: 1px solid color-mix(in srgb, #ff4d4f 55%, transparent); background: color-mix(in srgb, #ff4d4f 18%, transparent); backdrop-filter: blur(6px); box-shadow: inset 0 0 0 1px color-mix(in srgb, #ff4d4f 12%, transparent); color: #ff7875; } .llm-error-card__title { margin-bottom: 6px; color: #ff4d4f; font-size: 13px; font-weight: 600; } .llm-error-card__body { margin-bottom: 10px; color: #ff7875; font-size: 13px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; } .llm-error-card__retry { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 6px; color: #fff; background: #ff4d4f; font-size: 12px; font-weight: 500; } .llm-error-card__retry:hover:not(:disabled) { opacity: .9; } .llm-error-card__retry:disabled { opacity: .6; cursor: not-allowed; } .chat-avatar { display: flex; width: 36px; height: 36px; align-items: center; justify-content: center; border-radius: 4px; color: #fff; font-size: 14px; font-weight: 600; }
</style>
