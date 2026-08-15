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
        v-for="(level, index) in toolbarBars"
        :key="index"
        class="voice-bars__bar"
        :style="{ height: `${level}px` }"
      />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Mic } from "lucide-vue-next";
import type { VoiceRecognitionController } from "../../composables/use-voice-recognition";

const TOOLBAR_BAR_COUNT = 4;

const props = defineProps<{
  voice: VoiceRecognitionController;
  disabled?: boolean;
  holdRecording?: boolean;
}>();

const toolbarBars = computed(() => {
  const bars = props.voice.waveformBars.value;
  if (bars.length <= TOOLBAR_BAR_COUNT) return bars;
  const step = bars.length / TOOLBAR_BAR_COUNT;
  return Array.from({ length: TOOLBAR_BAR_COUNT }, (_, index) => {
    const source = bars[Math.min(bars.length - 1, Math.floor(index * step + step / 2))];
    return Math.min(15, Math.max(4, Math.round((source ?? 4) * 0.7)));
  });
});

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
