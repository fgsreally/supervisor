<template>
  <MobileDrawer
    :open="open"
    :ariaLabel="title || '操作'"
    :title="title"
    size="auto"
    :resizable="false"
    show-footer
    @close="emit('close')"
  >
    <slot />
  </MobileDrawer>
</template>

<script setup lang="ts">
import MobileDrawer from "./MobileDrawer.vue";

defineProps<{ open: boolean; title?: string }>();
const emit = defineEmits<{ close: [] }>();
</script>
