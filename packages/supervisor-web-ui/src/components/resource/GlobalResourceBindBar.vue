<template>
  <div class="global-resource-bind-bar shrink-0 min-w-0 overflow-x-hidden px-2 py-2">
    <div class="global-resource-bind-bar__label mb-1.5 text-[10px] font-medium">{{ t("resource.addFromGlobal") }}</div>
    <div class="custom-scrollbar flex max-h-28 flex-col gap-0.5 overflow-y-auto">
      <div
        v-for="item in items"
        :key="item.id"
        class="global-resource-bind-bar__row flex items-center gap-1 rounded px-1 py-0.5"
      >
        <button
          type="button"
          class="global-resource-bind-bar__preview min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-[12px]"
          :title="item.description"
          @click="emit('preview', item)"
        >
          {{ item.name }}
        </button>
        <button
          type="button"
          class="global-resource-bind-bar__add flex h-7 w-7 shrink-0 items-center justify-center rounded"
          :disabled="!!bindingItemId"
          :title="t('resource.addNamed', { name: item.name })"
          :aria-label="t('resource.addNamed', { name: item.name })"
          @click="emit('bind', item)"
        >
          <Loader2 v-if="bindingItemId === item.id" class="global-resource-bind-bar__spinner" />
          <Plus v-else class="h-4 w-4" />
        </button>
      </div>
      <div v-if="items.length === 0" class="text-muted px-2 py-1.5 text-[11px]">{{ t("resource.noAvailableItems") }}</div>
    </div>
    <ExtensionInstallBox
      v-if="kind === 'extensions'"
      @installed="emit('installed', $event)"
      @uninstalled="emit('uninstalled', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { Loader2, Plus } from "lucide-vue-next";
import ExtensionInstallBox from "./ExtensionInstallBox.vue";
import type { UIResourceItem, UIResourceKind } from "@/types/ui";
import { useI18n } from "@/i18n";

defineProps<{
  items: UIResourceItem[];
  kind: UIResourceKind;
  bindingItemId?: string | null;
}>();
const { t } = useI18n();

const emit = defineEmits<{
  bind: [item: UIResourceItem];
  preview: [item: UIResourceItem];
  installed: [id: string];
  uninstalled: [id: string];
}>();
</script>

<style scoped>
.global-resource-bind-bar {
  background: color-mix(in srgb, var(--app-accent) 6%, var(--app-resource-sidebar-bg));
}

.global-resource-bind-bar__label,
.text-muted {
  color: var(--app-text-muted);
}

.global-resource-bind-bar__preview,
.global-resource-bind-bar__add {
  cursor: pointer;
  color: var(--app-text-secondary);
}

.global-resource-bind-bar__row:hover,
.global-resource-bind-bar__preview:hover,
.global-resource-bind-bar__add:hover:not(:disabled) {
  color: var(--app-text-primary);
  background: var(--app-hover);
}

.global-resource-bind-bar__add:disabled {
  cursor: wait;
  opacity: 0.65;
}

.global-resource-bind-bar__spinner {
  width: 0.85rem;
  height: 0.85rem;
  flex: none;
  animation: resource-spin 0.8s linear infinite;
}

@keyframes resource-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
