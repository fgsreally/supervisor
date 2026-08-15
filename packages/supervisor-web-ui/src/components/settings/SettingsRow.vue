<template>
  <div
    class="settings-row flex items-center gap-3 px-6 py-3.5 border-b last:border-b-0 cursor-pointer transition-colors"
  >
    <div class="flex-1 min-w-0">
      <div class="text-[15px] settings-row-label">{{ label }}</div>
      <div v-if="hint" class="text-xs mt-0.5 settings-row-hint">{{ hint }}</div>
    </div>
    <slot name="trailing">
      <ChevronRight class="w-5 h-5 shrink-0 settings-row-chevron" />
    </slot>
  </div>
</template>

<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";

defineProps<{
  label: string;
  hint?: string;
}>();
</script>

<style scoped>
.settings-row {
  border-color: var(--app-border-subtle);
}

.settings-row:hover {
  background: var(--app-hover);
}

.settings-row-label {
  color: var(--app-text-primary);
}

.settings-row-hint {
  color: var(--app-text-muted);
}

.settings-row-chevron {
  color: var(--app-text-muted);
}
</style>
