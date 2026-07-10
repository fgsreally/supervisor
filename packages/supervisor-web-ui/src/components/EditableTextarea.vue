<template>
  <textarea
    :value="modelValue"
    class="w-full h-full min-h-[12rem] resize-none focus:outline-none font-mono text-[13px] leading-relaxed text-gray-900 bg-white custom-scrollbar p-4 md:p-6"
    :class="mono ? 'font-mono' : 'font-sans'"
    :placeholder="placeholder"
    @input="onInput"
  />
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string
  placeholder?: string
  mono?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
}
</script>
