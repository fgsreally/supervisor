<template>
  <div class="global-resource-bind-bar shrink-0 px-2 py-2">
    <div class="text-[10px] font-medium mb-1.5 global-resource-bind-bar__label">从全局库绑定</div>
    <div class="flex flex-col gap-0.5 max-h-28 overflow-y-auto custom-scrollbar">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        :disabled="!!bindingItemId"
        class="global-resource-bind-bar__btn text-left px-2 py-1.5 rounded text-[12px] truncate"
        :title="item.description"
        @click="emit('bind', item)"
      >
        <Loader2 v-if="bindingItemId === item.id" class="global-resource-bind-bar__spinner" />
        <span v-else>+</span> {{ item.name }}
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
import ExtensionInstallBox from "./ExtensionInstallBox.vue";
import { Loader2 } from "lucide-vue-next";
import type { UIResourceItem } from "@/types/ui";
import type { UIResourceKind } from "@/types/ui";

const props = defineProps<{
  items: UIResourceItem[];
  kind: UIResourceKind;
  bindingItemId?: string | null;
}>();

const emit = defineEmits<{
  bind: [item: UIResourceItem];
  installed: [id: string];
  uninstalled: [id: string];
}>();

function handleInstalled(id: string) {
  emit("installed", id);
}

function handleUninstalled(id: string) {
  emit("uninstalled", id);
}

// Reference props to silence unused warnings when no other usage exists.
void props;
</script>

<style scoped>
.global-resource-bind-bar {
  background: color-mix(in srgb, var(--app-accent) 6%, var(--app-resource-sidebar-bg));
}

.global-resource-bind-bar__label {
  color: var(--app-text-muted);
}

.global-resource-bind-bar__btn {
  color: var(--app-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.global-resource-bind-bar__btn:disabled {
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

.global-resource-bind-bar__btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.text-muted {
  color: var(--app-text-muted);
}
</style>
