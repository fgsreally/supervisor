<template>
  <ResponsiveDialogFrame v-bind="$props" variant="sheet" @close="emit('close')">
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps" />
    </template>
  </ResponsiveDialogFrame>
</template>

<script setup lang="ts">
import ResponsiveDialogFrame, { type ResponsiveDialogProps } from "./frame.vue";

defineOptions({ inheritAttrs: false });
defineProps<ResponsiveDialogProps>();
const emit = defineEmits<{ close: [] }>();
</script>
