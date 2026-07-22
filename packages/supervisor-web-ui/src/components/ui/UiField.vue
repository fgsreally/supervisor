<template>
  <component :is="as" class="ui-field" :value="modelValue" @input="onInput" @change="onChange">
    <slot />
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ as?: "input" | "textarea" | "select"; modelValue?: unknown }>(), {
  as: "input",
});

const emit = defineEmits<{
  "update:modelValue": [value: unknown];
  change: [event: Event];
}>();

function valueOf(event: Event): unknown {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (target instanceof HTMLSelectElement) {
    const option = target.selectedOptions[0] as
      | (HTMLOptionElement & { _value?: unknown })
      | undefined;
    return option && "_value" in option ? option._value : target.value;
  }
  return target.value;
}

function onInput(event: Event): void {
  emit("update:modelValue", valueOf(event));
}

function onChange(event: Event): void {
  emit("update:modelValue", valueOf(event));
  emit("change", event);
}
</script>

<style scoped>
.ui-field {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  outline: none;
}

.ui-field:focus {
  border-color: var(--app-accent);
  box-shadow: 0 0 0 2px rgb(7 193 96 / 12%);
}
</style>
