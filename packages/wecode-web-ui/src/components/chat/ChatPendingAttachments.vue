<template>
  <div v-if="attachments.length" class="pending-attachments">
    <div v-for="attachment in attachments" :key="attachment.id" class="pending-attachments__item">
      <Paperclip class="pending-attachments__icon" aria-hidden="true" />
      <span class="pending-attachments__name" :title="attachment.name">{{ attachment.name }}</span>
      <span class="pending-attachments__size">{{ formatBytes(attachment.size) }}</span>
      <button
        type="button"
        class="pending-attachments__remove"
        :title="t('common.remove')"
        @click="emit('remove', attachment.id)"
      >
        <X class="h-3 w-3" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Paperclip, X } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import type { PendingChatAttachment } from "@/types/chat-compose";

defineProps<{ attachments: PendingChatAttachment[] }>();
const emit = defineEmits<{ remove: [id: string] }>();
const { t } = useI18n();

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<style scoped>
.pending-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding: 0.5rem 0.75rem 0;
}

.pending-attachments__item {
  display: inline-flex;
  align-items: center;
  max-width: min(22rem, 100%);
  gap: 0.35rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--app-border);
  border-radius: 0.45rem;
  color: var(--app-text-primary);
  background: var(--app-bubble-assistant);
  font-size: var(--app-font-control);
}

.pending-attachments__icon {
  flex: 0 0 auto;
  color: var(--app-accent);
}

.pending-attachments__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pending-attachments__size {
  flex: 0 0 auto;
  color: var(--app-text-muted);
  font-size: var(--app-font-caption);
}

.pending-attachments__remove {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 0.2rem;
  border: 0;
  border-radius: 999px;
  color: var(--app-text-secondary);
  background: transparent;
}

.pending-attachments__remove:hover {
  color: var(--app-danger);
  background: var(--app-hover);
}
</style>
