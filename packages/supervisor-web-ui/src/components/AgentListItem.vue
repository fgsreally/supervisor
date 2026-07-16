<template>
  <div
    class="agent-list-item cursor-pointer flex items-center gap-3 px-4 py-3 transition-colors relative"
    :class="{ 'agent-list-item--active': active }"
    @click="$emit('select', agent.id)"
  >
    <div
      class="w-10 h-10 rounded-md flex items-center justify-center text-white font-semibold text-base shrink-0 shadow-sm"
      :class="avatarClass"
    >
      {{ agent.name.substring(0, 1).toUpperCase() }}
    </div>

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
import { agentAvatarClass } from "../utils/avatar-class";
import type { Agent } from "@/api";

const props = defineProps<{
  agent: Agent;
  active?: boolean;
}>();

defineEmits<{ select: [id: string] }>();

const avatarClass = computed(() => agentAvatarClass(props.agent.id));

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
}

.agent-list-item--active {
  background: var(--app-list-item-active);
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
