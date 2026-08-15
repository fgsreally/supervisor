<template>
  <ResponsiveDialog v-bind="$props" @close="emit('close')">
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps" />
    </template>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import ResponsiveDialog from "./ResponsiveDialog/index.vue";
import type { ResponsiveDialogProps } from "./ResponsiveDialog/frame.vue";

defineOptions({ inheritAttrs: false });
defineProps<ResponsiveDialogProps>();
const emit = defineEmits<{ close: [] }>();
</script>
