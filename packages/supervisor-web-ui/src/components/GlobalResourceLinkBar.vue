<template>
  <div class="global-resource-link-bar shrink-0 px-2 py-2">
    <div class="text-[10px] font-medium mb-1.5 global-resource-link-bar__label">从全局库关联</div>
    <div class="flex flex-col gap-0.5 max-h-28 overflow-y-auto custom-scrollbar">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="global-resource-link-bar__btn text-left px-2 py-1.5 rounded text-[12px] truncate"
        :title="item.description"
        @click="emit('link', item)"
      >
        + {{ item.name }}
      </button>
      <div v-if="items.length === 0" class="text-[11px] text-muted px-2 py-1.5">无可用项</div>
    </div>
    <ExtensionInstallBox
      v-if="kind === 'extensions'"
      @installed="handleInstalled"
      @uninstalled="handleUninstalled"
    />
  </div>
</template>

<script setup lang="ts">
import ExtensionInstallBox from './ExtensionInstallBox.vue'
import type { UIResourceItem } from '@/types/ui'
import type { UIResourceKind } from '@/types/ui'

const props = defineProps<{
  items: UIResourceItem[]
  kind: UIResourceKind
}>()

const emit = defineEmits<{
  link: [item: UIResourceItem]
  installed: [id: string]
  uninstalled: [id: string]
}>()

function handleInstalled(id: string) {
  emit('installed', id)
}

function handleUninstalled(id: string) {
  emit('uninstalled', id)
}

// Reference props to silence unused warnings when no other usage exists.
void props
</script>

<style scoped>
.global-resource-link-bar {
  background: color-mix(in srgb, var(--app-accent) 6%, var(--app-resource-sidebar-bg));
}

.global-resource-link-bar__label {
  color: var(--app-text-muted);
}

.global-resource-link-bar__btn {
  color: var(--app-text-secondary);
}

.global-resource-link-bar__btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.text-muted {
  color: var(--app-text-muted);
}
</style>
