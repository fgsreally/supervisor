<template>
  <span
    v-if="layer === 'global'"
    class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0 bg-sky-50 text-sky-700 border border-sky-100"
    title="来自 ~/.pi/supervisor/"
  >
    global
  </span>
</template>

<script setup lang="ts">
import type { ResourceLayer } from "../mock/resources";

defineProps<{
  layer: ResourceLayer;
}>();
</script>
