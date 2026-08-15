<template>
  <textarea
    :value="modelValue"
    class="editable-textarea custom-scrollbar"
    :class="mono ? 'editable-textarea--mono' : 'editable-textarea--sans'"
    :placeholder="placeholder"
    @input="onInput"
  />
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
  placeholder?: string;
  mono?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

function onInput(e: Event) {
  emit("update:modelValue", (e.target as HTMLTextAreaElement).value);
}
</script>

<style scoped>
.editable-textarea {
  width: 100%;
  height: 100%;
  min-height: 12rem;
  padding: var(--app-space-4);
  resize: none;
  border: 0;
  outline: none;
  color: var(--app-text-primary);
  background: var(--app-input-bg);
  font-size: var(--app-font-body);
  line-height: 1.625;
}

.editable-textarea--mono {
  font-family: var(--app-font-mono);
}

.editable-textarea--sans {
  font-family: var(--app-font-family);
}

@media (min-width: 768px) {
  .editable-textarea {
    padding: var(--app-space-4) var(--app-space-6);
  }
}
</style>
