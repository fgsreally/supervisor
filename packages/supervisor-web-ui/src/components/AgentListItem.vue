<template>
  <div
    class="agent-list-item cursor-pointer flex items-center gap-3 px-4 py-3 transition-colors relative"
    :class="{ 'agent-list-item--active': active }"
    @click="$emit('select', agent.id)"
  >
    <AgentAvatar
      :agent-id="agent.id"
      :agent-name="agent.name"
      :icon="agent.icon"
      class="w-10 h-10 text-base"
    />

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="text-[13px] font-medium truncate agent-list-item__name">{{ agent.name }}</span>
        <span
          class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium agent-list-item__preset"
        >
          {{ presetLabel }}
        </span>
      </div>
      <div class="text-[11px] truncate mt-0.5 agent-list-item__desc">
        {{ agent.description ?? "" }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAgentStore } from "@/store";
import type { Agent } from "@/api";
import AgentAvatar from "./AgentAvatar.vue";

const props = defineProps<{
  agent: Agent;
  active?: boolean;
}>();

defineEmits<{ select: [id: string] }>();

const presetLabel = computed(() => {
  switch (props.agent.toolsPreset) {
    case "coding":
      return "coding";
    case "readonly":
      return "readonly";
    case "none":
      return "no tools";
    default:
      return props.agent.toolsPreset;
  }
});
</script>

<style scoped>
.agent-list-item:hover {
  background: var(--app-list-item-hover);
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--app-accent) 65%, transparent);
}

.agent-list-item--active {
  background: var(--app-list-item-active);
  box-shadow: inset 3px 0 0 var(--app-accent);
}

.agent-list-item--active:hover {
  background: color-mix(in srgb, var(--app-list-item-active) 90%, var(--app-hover));
}

.agent-list-item__name {
  color: var(--app-text-primary);
}

.agent-list-item__preset {
  background: color-mix(in srgb, var(--app-hover) 70%, transparent);
  color: var(--app-text-secondary);
}

.agent-list-item__desc {
  color: var(--app-text-secondary);
}

.agent-list-item--active .agent-list-item__name,
.agent-list-item--active .agent-list-item__preset,
.agent-list-item--active .agent-list-item__desc {
  color: var(--app-list-item-active-text);
}

.agent-list-item--active .agent-list-item__preset {
  background: color-mix(in srgb, var(--app-list-item-active-text) 18%, transparent);
}
</style>
