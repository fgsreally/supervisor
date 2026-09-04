<template>
  <div class="flex flex-col gap-1 text-[14px]">
    <label v-if="label" class="editable-field-label text-[13px]">{{ label }}</label>
    <input
      v-if="type === 'text' || type === 'number'"
      :type="type"
      :value="stringValue"
      :placeholder="placeholder"
      class="editable-field-input"
      @input="onInput"
    />
    <select
      v-else-if="type === 'select'"
      :value="stringValue"
      class="editable-field-input"
      @change="onSelect"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
    </select>
    <textarea
      v-else
      :value="stringValue"
      :rows="rows ?? 3"
      :placeholder="placeholder"
      class="editable-field-input editable-field-input--textarea"
      @input="onInput"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  label?: string;
  modelValue: string | number | boolean;
  type?: "text" | "number" | "textarea" | "select";
  placeholder?: string;
  rows?: number;
  options?: Array<{ value: string; label: string }>;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string | number | boolean] }>();

const stringValue = computed(() => String(props.modelValue));

function onInput(e: Event) {
  const el = e.target as HTMLInputElement | HTMLTextAreaElement;
  emit("update:modelValue", props.type === "number" ? Number(el.value) : el.value);
}

function onSelect(e: Event) {
  emit("update:modelValue", (e.target as HTMLSelectElement).value);
}
</script>

<style scoped>
.editable-field-label {
  color: var(--app-text-secondary);
}

.editable-field-input {
  width: 100%;
  min-height: var(--app-control-height);
  padding: 0.5rem 0.75rem;
  border: var(--app-control-border-width) solid var(--app-border);
  border-radius: var(--app-radius-control);
  font-size: var(--app-font-control);
  outline: none;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
}

.editable-field-input--textarea {
  min-height: 4rem;
  resize: vertical;
  line-height: 1.5;
}

.editable-field-input:focus {
  border-color: var(--app-accent);
  box-shadow: var(--app-focus-ring);
}
</style>
