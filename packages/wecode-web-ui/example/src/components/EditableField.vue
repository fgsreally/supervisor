<template>
  <div class="flex flex-col gap-1 text-[14px]">
    <label v-if="label" class="editable-field-label text-[13px]">{{ label }}</label>
    <input
      v-if="type === 'text' || type === 'number'"
      :type="type"
      :value="stringValue"
      :placeholder="placeholder"
      class="editable-field-input w-full px-3 py-2 rounded-md border text-[13px] focus:outline-none focus:ring-1 focus:ring-[#07c160]/50"
      @input="onInput"
    />
    <select
      v-else-if="type === 'select'"
      :value="stringValue"
      class="editable-field-input w-full px-3 py-2 rounded-md border text-[13px] focus:outline-none focus:ring-1 focus:ring-[#07c160]/50"
      @change="onSelect"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
    </select>
    <textarea
      v-else
      :value="stringValue"
      :rows="rows ?? 3"
      :placeholder="placeholder"
      class="editable-field-input w-full px-3 py-2 rounded-md border text-[13px] leading-relaxed resize-y min-h-[4rem] focus:outline-none focus:ring-1 focus:ring-[#07c160]/50"
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
  border-color: var(--app-border);
  background: var(--app-settings-card);
  color: var(--app-text-primary);
}
</style>
