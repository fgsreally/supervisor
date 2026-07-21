<template>
  <div class="shadow-message-row">
    <Sparkles />
    <div>
      <small>Shadow</small>
      <p>{{ text }}</p>
      <span v-if="queued">等待主 Agent 处理</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { Sparkles } from "lucide-vue-next";
defineProps<{ text: string; queued?: boolean }>();
</script>
<style scoped>
.shadow-message-row {
  max-width: min(76%, 720px);
  margin: 4px auto;
  display: flex;
  gap: 9px;
  padding: 9px 12px;
  border: 1px solid color-mix(in srgb, var(--app-accent) 25%, var(--app-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-accent) 7%, var(--app-chat-bg));
  color: var(--app-text-primary);
}
.shadow-message-row > svg {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--app-accent);
  margin-top: 2px;
}
small {
  color: var(--app-accent);
  font-size: 11px;
}
p {
  margin-top: 2px;
  font-size: 13px;
  line-height: 1.55;
}
span {
  color: var(--app-text-muted);
  font-size: 10px;
}
</style>
