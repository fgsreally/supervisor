<template>
  <div class="min-w-0 flex-1">
    <div class="text-[13px] text-gray-900 truncate">{{ label }}</div>
    <div
      v-if="showPath && path"
      class="text-[11px] font-mono text-gray-400 truncate mt-0.5"
      :title="path"
    >
      {{ path }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MockFileItem } from '../mock/resources'
import { getFileBaseName } from '../mock/resource-utils'

const props = defineProps<{
  item: MockFileItem
}>()

const label = computed(() => getFileBaseName(props.item.fileName))

const showPath = computed(() => props.item.layer === 'global')

const path = computed(() => props.item.path)
</script>
