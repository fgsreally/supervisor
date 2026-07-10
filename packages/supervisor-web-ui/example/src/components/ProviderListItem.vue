<template>
  <div
    class="provider-list-item cursor-pointer flex items-center gap-3 px-4 py-3 transition-colors relative"
    :class="{ 'provider-list-item--active': active }"
    @click="$emit('select', provider.id)"
  >
    <div
      class="w-10 h-10 rounded-md flex items-center justify-center text-white font-semibold text-base shrink-0 shadow-sm"
      :class="avatarClass"
    >
      {{ provider.name.substring(0, 1).toUpperCase() }}
    </div>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="text-[13px] font-medium truncate provider-list-item__name">{{ provider.name }}</span>
        <span
          class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium provider-list-item__badge"
          :class="provider.isEnabled ? 'provider-list-item__badge--on' : 'provider-list-item__badge--off'"
        >
          {{ provider.isEnabled ? 'enabled' : 'disabled' }}
        </span>
      </div>
      <div class="text-[11px] truncate mt-0.5 provider-list-item__meta">{{ provider.activeModelId }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MockProvider } from '../mock/providers'
import { providerAvatarClass } from '../utils/avatar-class'

const props = defineProps<{
  provider: MockProvider
  active?: boolean
}>()

defineEmits<{ select: [id: string] }>()

const avatarClass = computed(() => providerAvatarClass(props.provider.id))
</script>

<style scoped>
.provider-list-item:hover {
  background: var(--app-list-item-hover);
}

.provider-list-item--active {
  background: var(--app-list-item-active);
}

.provider-list-item__name {
  color: var(--app-text-primary);
}

.provider-list-item__meta {
  color: var(--app-text-secondary);
}

.provider-list-item__badge--on {
  background: color-mix(in srgb, var(--app-accent) 18%, transparent);
  color: var(--app-accent);
}

.provider-list-item__badge--off {
  background: color-mix(in srgb, var(--app-hover) 80%, transparent);
  color: var(--app-text-secondary);
}

.provider-list-item--active .provider-list-item__name,
.provider-list-item--active .provider-list-item__meta,
.provider-list-item--active .provider-list-item__badge {
  color: var(--app-list-item-active-text);
}

.provider-list-item--active .provider-list-item__badge {
  background: color-mix(in srgb, var(--app-list-item-active-text) 18%, transparent);
}
</style>
