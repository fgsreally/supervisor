<template>
  <div class="min-w-0 flex-1">
    <div class="resource-file-name text-[13px] truncate">{{ label }}</div>
    <div
      v-if="item.layer === 'global' && item.path"
      class="resource-file-path text-[11px] font-mono truncate mt-0.5"
      :title="item.path"
    >
      {{ item.path }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UIFileItem } from '@/types/ui'
import { getFileBaseName } from '@/utils/resource-utils'

const props = defineProps<{
  item: UIFileItem
}>()

const label = computed(() => getFileBaseName(props.item.fileName))
</script>

<style scoped>
.resource-file-name {
  color: var(--app-text-primary);
}

.resource-file-path {
  color: var(--app-text-muted);
}
</style>
