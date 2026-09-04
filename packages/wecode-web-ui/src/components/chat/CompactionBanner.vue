<template>
  <div class="compaction-banner">
    <span class="compaction-banner__line" /><button type="button" @click="$emit('open')">
      {{ t("chat.message.contextCompacted") }}</button
    ><span class="compaction-banner__line" />
  </div>
</template>
<script setup lang="ts">
import type { ChatCompactionEntry } from "@/types/chat-entry";
import { useI18n } from "@/i18n";
const { t } = useI18n();
defineProps<{ entry: ChatCompactionEntry }>();
defineEmits<{ open: [] }>();
</script>
<style scoped>
.compaction-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 8px;
}
.compaction-banner__line {
  height: 1px;
  flex: 1;
  background: var(--app-border-subtle);
}
button {
  flex: none;
  padding: 3px 9px;
  border-radius: 5px;
  background: var(--app-hover);
  color: var(--app-text-muted);
  font-size: var(--app-font-micro);
  font-weight: var(--app-font-weight-medium);
}
button:hover {
  color: var(--app-text-secondary);
  background: var(--app-list-active-bg);
}
</style>
