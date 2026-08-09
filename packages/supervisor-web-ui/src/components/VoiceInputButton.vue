<template>
  <button
    type="button"
    class="voice-button"
    :class="{ 'voice-button--active': voice.recording.value }"
    :disabled="disabled || holdRecording"
    :aria-label="voice.recording.value ? '结束语音输入' : '开始语音输入'"
    :title="voice.recording.value ? '结束语音输入' : '开始语音输入'"
    @mousedown.prevent
    @click="onToggleClick"
  >
    <Mic v-if="!voice.recording.value" class="voice-icon" />
    <span v-else class="voice-bars" aria-hidden="true">
      <span
        v-for="(level, index) in voice.waveformBars.value"
        :key="index"
        class="voice-bars__bar"
        :style="{ height: `${level}px` }"
      />
    </span>
  </button>
</template>

<script setup lang="ts">
import { Mic } from "lucide-vue-next";
import type { VoiceRecognitionController } from "../composables/use-voice-recognition";

const props = defineProps<{
  voice: VoiceRecognitionController;
  disabled?: boolean;
  holdRecording?: boolean;
}>();

async function onToggleClick() {
  if (props.disabled || props.holdRecording) return;
  if (props.voice.recording.value) {
    await props.voice.stop();
  } else {
    void props.voice.start();
  }
}
</script>

<style scoped>
.voice-button {
  padding: 6px;
  border-radius: 8px;
  color: var(--app-toolbar-icon, var(--app-text-secondary));
  transition:
    background-color 0.15s,
    color 0.15s;
}

.voice-button:hover:not(:disabled):not(.voice-button--active) {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.voice-button--active,
.voice-button--active:hover:not(:disabled) {
  color: #07c160;
  background: color-mix(in srgb, #07c160 16%, transparent);
  box-shadow: 0 0 5px rgba(7, 193, 96, 0.35);
}

.voice-icon {
  width: 19px;
  height: 19px;
  stroke-width: 1.5;
}

.voice-bars {
  display: flex;
  width: 19px;
  height: 19px;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.voice-bars__bar {
  width: 2px;
  min-height: 4px;
  border-radius: 999px;
  background: currentColor;
  will-change: height;
}
</style>
