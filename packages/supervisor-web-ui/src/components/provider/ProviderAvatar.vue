<template>
  <span
    class="provider-avatar inline-flex items-center justify-center rounded-md shrink-0 shadow-sm"
    :class="[
      resolvedIcon ? 'provider-avatar--icon' : fallbackClass,
      { 'provider-avatar--monochrome': isMonochrome },
    ]"
  >
    <img v-if="isImageUrl" :src="resolvedIcon!" alt="" class="provider-avatar__img" />
    <Icon v-else-if="resolvedIcon" :icon="resolvedIcon" class="provider-avatar__icon" />
    <span v-else class="provider-avatar__initial">{{ initial }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import { providerAvatarClass } from "@/utils/avatar-class";
import { resolveProviderIcon } from "@/constants/providers";

const props = defineProps<{
  providerId: string;
  providerName: string;
  icon?: string | null;
}>();

const resolvedIcon = computed(() =>
  resolveProviderIcon(props.providerId, props.providerName, props.icon ?? null),
);
const isMonochrome = computed(() =>
  ["/icons/openai.svg", "/icons/groq.svg", "/icons/moonshot.svg"].includes(
    resolvedIcon.value ?? "",
  ),
);
const isImageUrl = computed(() => {
  const icon = resolvedIcon.value;
  if (!icon) return false;
  return (
    icon.startsWith("http://") ||
    icon.startsWith("https://") ||
    icon.startsWith("data:") ||
    icon.startsWith("/") ||
    icon.startsWith("./")
  );
});
const initial = computed(() => props.providerName.trim().slice(0, 1).toUpperCase() || "?");
const fallbackClass = computed(() => providerAvatarClass(props.providerId));
</script>

<style scoped>
.provider-avatar--icon {
  background: var(--app-settings-card);
  border: 1px solid var(--app-border-subtle);
  color: var(--app-text-primary);
}

.provider-avatar__img {
  width: 18px;
  height: 18px;
  object-fit: contain;
  border-radius: 4px;
}

.provider-avatar--monochrome .provider-avatar__img {
  filter: var(--app-monochrome-icon-filter);
}

.provider-avatar__icon {
  width: 18px;
  height: 18px;
}

.provider-avatar__initial {
  color: #fff;
  font-weight: 600;
}
</style>
