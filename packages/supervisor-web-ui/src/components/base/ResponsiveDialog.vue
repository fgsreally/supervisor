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
// 未传入的 Boolean prop 会被转成 false，默认值需与 frame.vue 一致。
withDefaults(defineProps<ResponsiveDialogProps>(), {
  showClose: true,
  dismissOnBackdrop: true,
});
const emit = defineEmits<{ close: [] }>();
</script>
