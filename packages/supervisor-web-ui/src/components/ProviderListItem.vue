<template>
  <div
    class="provider-list-item cursor-pointer flex items-center gap-3 px-4 py-3 transition-colors relative"
    :class="{ 'provider-list-item--active': active }"
    @click="$emit('select', provider.id)"
    @contextmenu.prevent="$emit('contextmenu', $event)"
  >
    <ProviderAvatar
      :provider-id="provider.id"
      :provider-name="provider.name"
      :icon="provider.icon"
      class="w-10 h-10 text-base"
    />

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="text-[13px] font-medium truncate provider-list-item__name">{{
          provider.name
        }}</span>
        <span
          class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium provider-list-item__badge"
          :class="
            provider.isEnabled ? 'provider-list-item__badge--on' : 'provider-list-item__badge--off'
          "
        >
          {{ provider.isEnabled ? "enabled" : "disabled" }}
        </span>
      </div>
      <div class="text-[11px] truncate mt-0.5 provider-list-item__meta">
        {{ provider.models.length }} models
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UIProvider } from "@/types/ui";
import ProviderAvatar from "./ProviderAvatar.vue";

const props = defineProps<{
  provider: UIProvider;
  active?: boolean;
}>();

defineEmits<{ select: [id: string]; contextmenu: [event: MouseEvent] }>();
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
