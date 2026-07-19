<template>
  <div class="recording-step">
    <ToolActivityBar
      :tool-name="toolName"
      :call-args="callArgs"
      :result-content="resultContent"
      :pending="pending"
      :is-error="isError"
      @open="$emit('open')"
    />
    <video
      v-if="recordingUrl"
      class="recording-step__video"
      :src="recordingUrl"
      controls
      preload="metadata"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ToolActivityBar from "../ToolActivityBar.vue";

const props = defineProps<{
  sessionId: string;
  toolName: string;
  callArgs?: Record<string, unknown>;
  resultContent?: Array<{ type: string; text: string }>;
  pending?: boolean;
  isError?: boolean;
}>();

defineEmits<{ open: [] }>();

const recordingUrl = computed(() => {
  if (props.pending || props.isError) return undefined;
  const isStop =
    (props.toolName === "desktop_recording" && props.callArgs?.action === "stop") ||
    (props.toolName === "browser" && props.callArgs?.action === "stop_recording");
  if (!isStop) return undefined;
  const text = props.resultContent?.map((item) => item.text).join("\n") ?? "";
  const filename = /([^/\\\s]+\.webm)\s*$/.exec(text)?.[1];
  return filename
    ? `/sessions/${encodeURIComponent(props.sessionId)}/recordings/${encodeURIComponent(filename)}`
    : undefined;
});
</script>

<style scoped>
.recording-step__video {
  display: block;
  width: min(720px, 100%);
  margin-top: 8px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: #000;
}
</style>
