<template>
  <div class="injected-row">
    <AgentAvatar
      v-if="avatarIcon"
      class="injected-avatar"
      :agent-id="agentId || source"
      :agent-name="senderName"
      :icon="avatarIcon"
    />
    <div v-else class="injected-avatar injected-avatar--text" :style="{ background: avatarColor }">
      {{ senderName.slice(0, 1) }}
    </div>
    <div class="injected-content">
      <small>{{ senderName }}</small>
      <p>{{ text }}</p>
      <span v-if="queued">{{ t("chat.queued.waiting") }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/i18n";
import { useAgentStore, useSessionStore } from "@/store";
import AgentAvatar from "../agent/AgentAvatar.vue";

const props = defineProps<{ text: string; source: string; queued?: boolean }>();
const sessions = useSessionStore();
const agents = useAgentStore();
const { t } = useI18n();

const sourceId = computed(() => props.source.split(":").at(-1) ?? "");
const sourceSession = computed(() =>
  props.source.includes(":parent:")
    ? sessions.sessions.find((item) => item.id === sourceId.value)
    : null,
);
const sourceAgent = computed(() => {
  const id = props.source.startsWith("shadow:") ? sourceId.value : sourceSession.value?.agentId;
  return agents.agents.find((item) => item.id === id);
});
const senderName = computed(
  () => sourceAgent.value?.name ?? sourceSession.value?.title ?? t("chat.agentMessage"),
);
const agentId = computed(() => sourceAgent.value?.id ?? sourceSession.value?.agentId ?? "");
const avatarIcon = computed(
  () => sourceAgent.value?.avatar ?? sourceSession.value?.avatar?.icon ?? null,
);
const avatarColor = computed(() => sourceSession.value?.avatar?.color ?? "var(--app-accent)");
</script>

<style scoped>
.injected-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: min(82%, 760px);
}
.injected-avatar {
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 6px;
}
.injected-avatar--text {
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 600;
}
.injected-content {
  min-width: 0;
  padding: 8px 11px;
  border-radius: 7px;
  background: var(--app-bubble-assistant);
  color: var(--app-text-primary);
}
small {
  display: block;
  margin-bottom: 2px;
  color: var(--app-text-secondary);
  font-size: 11px;
}
p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.5;
}
span {
  color: var(--app-text-muted);
  font-size: 10px;
}
</style>
