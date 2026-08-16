<template>
  <div class="chat-input-toolbar flex items-center justify-between px-2 py-1.5 shrink-0">
    <div class="toolbar-group flex items-center">
      <button v-for="btn in leftButtons" :key="btn.id" type="button" class="toolbar-icon-btn" :title="btn.title" :disabled="disabled" @mousedown.prevent @click="emit('action', btn.id)"><component :is="btn.icon" class="w-[19px] h-[19px] stroke-[1.5]" /></button>
      <button type="button" class="toolbar-icon-btn inline-flex items-center" :title="t('chat.input.uploadImage')" :disabled="disabled" @mousedown.prevent @click="emit('action', 'upload-image')"><ImagePlus class="w-[19px] h-[19px] stroke-[1.5]" /></button>
      <span v-if="shadowRunning" class="shadow-loading-indicator" :title="t('chat.input.shadowWorking')" :aria-label="t('chat.input.shadowWorking')"><Loader2 class="w-[19px] h-[19px] animate-spin" /></span>
    </div>
    <div class="toolbar-group flex items-center shrink-0">
      <button type="button" class="toolbar-icon-btn btw-btn" :title="t('chat.input.btw')" :disabled="disabled" @mousedown.prevent @click="emit('action', 'btw')"><MessageCircleQuestion class="w-[19px] h-[19px] stroke-[1.5]" /></button>
      <VoiceInputButton :voice="voice" :disabled="disabled" :hold-recording="holdRecording" />
      <div class="toolbar-divider" />
      <button type="button" class="send-btn" :class="{ 'send-btn--active': canSend || interrupting, 'send-btn--interrupt': interrupting }" :disabled="interrupting ? false : !canSend" :aria-label="interrupting ? t('chat.input.interrupt') : t('chat.input.send')" :title="interrupting ? t('chat.input.interrupt') : t('chat.input.send')" @mousedown.prevent @click="onPrimaryAction"><Square v-if="interrupting" class="send-btn__stop-icon" aria-hidden="true" /><template v-else>{{ t('chat.input.send') }}</template></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FolderOpen, ImagePlus, Loader2, MessageCircleQuestion, Smile, Sparkles, Square } from "lucide-vue-next";
import { computed } from "vue";
import VoiceInputButton from "./VoiceInputButton.vue";
import type { VoiceRecognitionController } from "../../composables/use-voice-recognition";
import { useI18n } from "@/i18n";
export type ChatToolbarAction = "emoji" | "skill" | "attach" | "upload-image" | "voice" | "btw";
const props = defineProps<{ voice: VoiceRecognitionController; disabled?: boolean; canSend?: boolean; interrupting?: boolean; shadowRunning?: boolean; holdRecording?: boolean }>();
const emit = defineEmits<{ action: [action: ChatToolbarAction]; send: []; interrupt: [] }>();
const { t } = useI18n();
const leftButtons = computed(() => [
  { id: "emoji" as const, icon: Smile, title: t("chat.input.emoji") },
  { id: "skill" as const, icon: Sparkles, title: t("chat.input.skill") },
  { id: "attach" as const, icon: FolderOpen, title: t("chat.input.attach") },
]);
function onPrimaryAction() { if (props.interrupting) emit("interrupt"); else emit("send"); }
</script>

<style scoped>
.chat-input-toolbar { color: var(--app-toolbar-icon); } .toolbar-group { gap: 2px; } .toolbar-icon-btn { padding: 6px; border-radius: 8px; transition: background-color 0.15s, color 0.15s; } .toolbar-icon-btn:hover:not(:disabled) { background: var(--app-hover); color: var(--app-text-primary); } .toolbar-icon-btn:disabled { opacity: 0.4; } .shadow-loading-indicator { display: inline-flex; padding: 6px; color: #07c160; } .btw-btn { color: #576b95; } .toolbar-divider { width: 1px; height: 18px; margin: 0 4px; background: var(--app-border-subtle); }
.send-btn { min-width: 56px; height: 32px; padding: 5px 16px; border-radius: 8px; font-size: 13px; font-weight: 400; background: var(--app-send-disabled-bg); color: var(--app-send-disabled-text); display: inline-flex; align-items: center; justify-content: center; transition: background-color 0.15s, color 0.15s, min-width 0.15s, padding 0.15s; } .send-btn--active { background: var(--app-accent); color: #fff; } .send-btn--active:hover:not(:disabled) { background: var(--app-accent-hover); } .send-btn--interrupt { min-width: 32px; width: 32px; padding: 0; background: var(--app-accent); } .send-btn--interrupt:hover:not(:disabled) { background: var(--app-accent-hover); } .send-btn__stop-icon { width: 12px; height: 12px; fill: currentColor; } .send-btn:disabled { cursor: not-allowed; }
</style>
