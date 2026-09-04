<template>
  <ResponsivePopover v-bind="$props" @update:open="emit('update:open', $event)">
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps" />
    </template>
  </ResponsivePopover>
</template>

<script setup lang="ts">
import ResponsivePopover from "./ResponsivePopover/index.vue";
import type { ResponsivePopoverProps } from "./ResponsivePopover/types";

defineOptions({ inheritAttrs: false });
defineProps<ResponsivePopoverProps>();
const emit = defineEmits<{ "update:open": [open: boolean] }>();
</script>
