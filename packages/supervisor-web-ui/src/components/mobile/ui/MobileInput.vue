<template>
  <input
    class="m-input"
    :class="{ 'm-input--error': error }"
    :value="modelValue"
    :aria-invalid="error || undefined"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    @change="emit('change', $event)"
  />
</template>

<script setup lang="ts">
defineProps<{ modelValue?: string | number; error?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string]; change: [event: Event] }>();
</script>
