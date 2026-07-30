<template>
  <button
    type="button"
    class="m-switch"
    :class="{ 'm-switch--checked': modelValue }"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="m-switch__track"><span class="m-switch__thumb" /></span>
    <span v-if="$slots.default" class="m-switch__label"><slot /></span>
  </button>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>
