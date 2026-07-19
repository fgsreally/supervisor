<template>
  <CodexCommandLayer
    v-if="backendType === 'codex'"
    ref="codexRef"
    :session-id="sessionId"
    @insert="emit('insert', $event)"
  />
</template>

<script setup lang="ts">
import { ref } from "vue";
import CodexCommandLayer from "./codex/CommandLayer.vue";

defineProps<{ sessionId: string; backendType?: string }>();
const emit = defineEmits<{ insert: [text: string] }>();
const codexRef = ref<InstanceType<typeof CodexCommandLayer> | null>(null);

function handleCommand(text: string): boolean {
  return codexRef.value?.handleCommand(text) ?? false;
}

defineExpose({ handleCommand });
</script>
