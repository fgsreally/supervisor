<template>
  <textarea
    class="m-textarea"
    :class="{ 'm-textarea--error': error }"
    :value="modelValue"
    :aria-invalid="error || undefined"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<script setup lang="ts">
defineProps<{ modelValue?: string; error?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>
