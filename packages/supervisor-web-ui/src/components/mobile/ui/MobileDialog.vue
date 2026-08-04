<template>
  <ResponsiveDialog :open="open" :title="title" @close="emit('close')">
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import ResponsiveDialog from "@/components/ui/ResponsiveDialog.vue";

defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
</script>
