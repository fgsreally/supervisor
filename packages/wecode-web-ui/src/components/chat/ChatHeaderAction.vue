<template>
  <button
    type="button"
    class="chat-header-action"
    :class="{
      'chat-header-action--count': count != null,
      'chat-header-action--active': active,
    }"
    :title="title"
    :aria-label="title"
    :aria-pressed="active ? 'true' : 'false'"
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <slot />
    <span v-if="count != null" class="chat-header-action__count">{{ count }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  active?: boolean;
  count?: number | string | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();
</script>
