<template>
  <button
    type="button"
    class="m-icon-button"
    :aria-label="label"
    :title="title || label"
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
defineProps<{ label: string; title?: string; disabled?: boolean }>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>
