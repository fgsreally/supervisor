<template>
  <AssistantMessageGroup
    session-id="shadow"
    :group="shadowGroup"
    :show-thinking-blocks="false"
    :is-streaming="status === 'running'"
    :streaming-group-id="status === 'running' ? shadowGroup.id : null"
    :time-label="timeLabel"
    :duration-label="null"
    :tone="level === 'warning' || level === 'error' ? level : undefined"
  >
    <template #avatar>
      <div class="shadow-avatar" aria-label="Shadow">
        <Loader2 v-if="status === 'running'" class="animate-spin" />
        <svg v-else class="shadow-avatar__mark" viewBox="0 0 24 24" aria-hidden="true">
          <ellipse cx="14" cy="19" rx="8" ry="2.5" fill="currentColor" opacity="0.5" />
          <circle cx="9" cy="7" r="3.25" fill="white" />
          <path d="M3.5 18c.7-4.2 2.5-6.3 5.5-6.3s4.8 2.1 5.5 6.3z" fill="white" />
        </svg>
      </div>
    </template>
  </AssistantMessageGroup>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Loader2 } from "lucide-vue-next";
import type { DisplayGroup } from "@/utils/flatten-messages";
import AssistantMessageGroup from "./AssistantMessageGroup.vue";

const props = defineProps<{
  text: string;
  status: "running" | "completed" | "failed";
  level?: "error" | "warning" | "info";
  timeLabel: string;
}>();

const shadowGroup = computed<Extract<DisplayGroup, { type: "grouped_assistant" }>>(() => ({
  id: "shadow-message",
  type: "grouped_assistant",
  role: "assistant",
  pieces: props.text ? [{ kind: "text", text: props.text }] : [],
  assets: [],
}));
</script>

<style scoped>
.shadow-avatar {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  flex: none;
  place-items: center;
  border-radius: 0.375rem;
  background: linear-gradient(135deg, #080f0c 0 48%, #087443 49% 100%);
  color: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}
.shadow-avatar > svg {
  width: 1.1rem;
  height: 1.1rem;
}
.shadow-avatar__mark {
  width: 1.3rem;
  height: 1.3rem;
  color: rgb(0 0 0 / 72%);
}
</style>
