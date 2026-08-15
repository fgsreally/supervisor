<template>
  <ResponsiveSplitSurface v-bind="$props" @close="emit('close')">
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps" />
    </template>
  </ResponsiveSplitSurface>
</template>

<script setup lang="ts">
import ResponsiveSplitSurface from "./ResponsiveSplitSurface/index.vue";
import type { ResponsiveSplitSurfaceProps } from "./ResponsiveSplitSurface/frame.vue";

defineOptions({ inheritAttrs: false });
defineProps<ResponsiveSplitSurfaceProps>();
const emit = defineEmits<{ close: [] }>();
</script>
