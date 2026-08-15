<template>
  <span
    class="agent-avatar inline-flex items-center justify-center rounded-md shrink-0 shadow-sm"
    :class="[
      icon ? 'agent-avatar--image' : fallbackClass,
      { 'agent-avatar--bundled': bundledColor },
    ]"
    :style="bundledColor ? { backgroundColor: bundledColor } : undefined"
  >
    <img v-if="isImage" :src="icon!" :alt="agentName" class="agent-avatar__image" />
    <Icon v-else-if="icon" :icon="icon" class="agent-avatar__icon" />
    <span v-else class="agent-avatar__initial">{{ initial }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import { agentAvatarClass } from "@/utils/avatar-class";
import { resolveBundledIconColor } from "@/constants/providers";

const props = defineProps<{
  agentId: string;
  agentName: string;
  icon?: string | null;
}>();

const icon = computed(() => props.icon?.trim() || null);
const bundledColor = computed(() => resolveBundledIconColor(icon.value));
const isImage = computed(() => {
  const value = icon.value;
  return Boolean(
    value &&
    (value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("data:") ||
      value.startsWith("/") ||
      value.startsWith("./")),
  );
});
const initial = computed(() => props.agentName.trim().slice(0, 1).toUpperCase() || "?");
const fallbackClass = computed(() => agentAvatarClass(props.agentId));
</script>

<style scoped>
.agent-avatar--image {
  background: var(--app-settings-card);
  border: 1px solid var(--app-border-subtle);
}

.agent-avatar--bundled {
  border-color: transparent;
}

.agent-avatar--bundled .agent-avatar__image {
  filter: brightness(0) invert(1);
}

.agent-avatar__image,
.agent-avatar__icon {
  width: 62%;
  height: 62%;
  object-fit: contain;
}

.agent-avatar--image:not(.agent-avatar--bundled) .agent-avatar__image {
  width: 100%;
  height: 100%;
  border-radius: inherit;
}

.agent-avatar__initial {
  color: #ffffff;
  font-weight: 600;
}
</style>
