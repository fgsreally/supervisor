<template>
  <select
    class="m-select"
    :class="{ 'm-select--error': error }"
    :value="modelValue"
    :aria-invalid="error || undefined"
    @change="onChange"
  >
    <slot />
  </select>
</template>

<script setup lang="ts">
defineProps<{ modelValue?: string | number; error?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string]; change: [event: Event] }>();

function onChange(event: Event) {
  emit("update:modelValue", (event.target as HTMLSelectElement).value);
  emit("change", event);
}
</script>
