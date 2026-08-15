<template>
  <ResponsiveSplitSurfaceFrame
    v-bind="$props"
    platform="pc"
    @close="emit('close')"
    @resize-start="emit('resize-start', $event)"
    @update:active-tab-id="emit('update:activeTabId', $event)"
    @close-tab="emit('close-tab', $event)"
  >
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps" />
    </template>
  </ResponsiveSplitSurfaceFrame>
</template>

<script setup lang="ts">
import ResponsiveSplitSurfaceFrame, { type ResponsiveSplitSurfaceProps } from "./frame.vue";

defineOptions({ inheritAttrs: false });
defineProps<ResponsiveSplitSurfaceProps>();
const emit = defineEmits<{
  close: [];
  "resize-start": [event: PointerEvent];
  "update:activeTabId": [id: string];
  "close-tab": [id: string];
}>();
</script>
