<template>
  <div class="shadow-message-row" :class="`shadow-message-row--${level ?? 'info'}`">
    <Loader2 v-if="status === 'running'" class="animate-spin" />
    <Sparkles v-else />
    <div>
      <small>Shadow</small>
      <p>{{ text || statusText }}</p>
    </div>
  </div>
</template>
<script setup lang="ts">
import { Loader2, Sparkles } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import { computed } from "vue";

const props = defineProps<{
  text: string;
  status: "running" | "completed" | "failed";
  level?: "error" | "warning" | "info";
}>();
const { t } = useI18n();
const statusText = computed(() => {
  if (props.status === "running") return t("chat.shadowWorking");
  if (props.status === "failed") return t("chat.shadowFailed");
  return t("chat.shadowCompleted");
});
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
.shadow-message-row--error {
  color: var(--app-danger);
  border-color: color-mix(in srgb, var(--app-danger) 42%, var(--app-border));
}
.shadow-message-row--warning {
  color: var(--app-warning);
  border-color: color-mix(in srgb, var(--app-warning) 42%, var(--app-border));
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
