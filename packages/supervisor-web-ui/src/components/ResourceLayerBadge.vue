<template>
  <span
    v-if="layer === 'global'"
    class="resource-layer-badge inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0"
    title="来自 ~/.pi/supervisor/"
  >
    global
  </span>
</template>

<script setup lang="ts">
import type { UIResourceLayer } from '@/types/ui'

defineProps<{
  layer: UIResourceLayer
}>()
</script>

<style scoped>
.resource-layer-badge {
  background: color-mix(in srgb, var(--app-text-link) 14%, transparent);
  color: var(--app-text-link);
  border: 1px solid color-mix(in srgb, var(--app-text-link) 28%, transparent);
}
</style>
