<template>
  <div
    class="provider-list-item cursor-pointer flex items-center gap-3 px-4 py-3 transition-colors relative"
    :class="{
      'provider-list-item--active': active,
      'provider-list-item--disabled': !provider.isEnabled,
    }"
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
        <span v-if="!provider.isEnabled" class="provider-list-item__disabled-badge">已禁用</span>
      </div>
      <div class="text-[11px] truncate mt-0.5 provider-list-item__meta">
        {{ provider.models.length }} 个模型
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

.provider-list-item--disabled .provider-avatar {
  filter: grayscale(1);
  opacity: 0.62;
}

.provider-list-item__disabled-badge {
  flex: none;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--app-hover);
  color: var(--app-text-secondary);
  font-size: 10px;
}

.provider-list-item--active .provider-list-item__name,
.provider-list-item--active .provider-list-item__meta {
  color: var(--app-list-item-active-text);
}
</style>
