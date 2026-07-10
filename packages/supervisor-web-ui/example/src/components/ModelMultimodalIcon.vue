<template>
  <span
    class="inline-flex items-center justify-center"
    :class="supportsMultimodal ? 'text-blue-500' : 'text-gray-300'"
    :title="supportsMultimodal ? '支持图像输入（多模态）' : '仅文本'"
  >
    <Image class="w-4 h-4" :stroke-width="supportsMultimodal ? 2 : 1.5" />
  </span>
</template>

<script setup lang="ts">
import { Image } from 'lucide-vue-next'

defineProps<{
  supportsMultimodal: boolean
}>()
</script>
