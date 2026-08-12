<template>
  <ToolActivityBar
    tool-name="bash"
    :call-args="callArgs"
    :result-content="resultContent"
    @open="$emit('open')"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import ToolActivityBar from "./ToolActivityBar.vue";

const props = defineProps<{
  command: string;
  intent?: string;
  resultContent?: Array<{ type: string; text: string }>;
}>();

defineEmits<{ open: [] }>();

const callArgs = computed(() => {
  const args: Record<string, unknown> = { command: props.command };
  if (props.intent?.trim()) args.intent = props.intent.trim();
  return args;
});
</script>
