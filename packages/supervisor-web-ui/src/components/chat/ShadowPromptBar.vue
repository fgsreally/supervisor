<template>
  <div v-if="enabled" class="shadow-prompt-bar">
    <button
      type="button"
      class="shadow-prompt-bar__trigger"
      :aria-expanded="open"
      :title="t('chat.shadowPrompt.open')"
      @click="open = true"
    >
      <Sparkles aria-hidden="true" />
      <span class="shadow-prompt-bar__label">{{
        current?.name || t("chat.shadowPrompt.custom")
      }}</span>
      <span v-if="current" class="shadow-prompt-bar__state">{{
        t("chat.shadowPrompt.active")
      }}</span>
      <ChevronUp v-if="open && !isMobile" aria-hidden="true" />
      <ChevronDown v-else aria-hidden="true" />
    </button>

    <div v-if="open && !isMobile" class="shadow-prompt-bar__desktop-panel">
      <ShadowPromptEditor :session-id="sessionId" :current="current" @saved="onSaved" />
    </div>

    <ResponsiveDialog
      v-if="isMobile"
      :open="open"
      :title="t('chat.shadowPrompt.title')"
      :description="t('chat.shadowPrompt.description')"
      panel-class="shadow-prompt-bar__mobile-dialog"
      @close="open = false"
    >
      <ShadowPromptEditor :session-id="sessionId" :current="current" @saved="onSaved" />
    </ResponsiveDialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-vue-next";
import type * as api from "@/api";
import ResponsiveDialog from "../base/ResponsiveDialog/index.vue";
import { useMobileViewport } from "../../composables/use-mobile-viewport";
import { useI18n } from "@/i18n";
import ShadowPromptEditor, { type ShadowPromptValue } from "./ShadowPromptEditor.vue";

defineProps<{
  enabled: boolean;
  sessionId: string;
  current?: ShadowPromptValue | null;
}>();
const emit = defineEmits<{ saved: [session: api.Session] }>();
const { t } = useI18n();
const isMobile = useMobileViewport();
const open = ref(false);

function onSaved(session: api.Session) {
  open.value = false;
  emit("saved", session);
}
</script>

<style scoped>
.shadow-prompt-bar {
  position: relative;
  border-bottom: 1px solid var(--app-border-subtle);
  background: color-mix(in srgb, var(--app-accent) 5%, transparent);
}
.shadow-prompt-bar__trigger {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  width: 100%;
  min-height: 2rem;
  padding: 0 var(--app-space-3);
  color: var(--app-text-secondary);
  font-size: var(--app-font-control);
  text-align: left;
}
.shadow-prompt-bar__trigger:hover {
  color: var(--app-text-primary);
  background: var(--app-hover);
}
.shadow-prompt-bar__trigger svg {
  width: 0.9rem;
  height: 0.9rem;
  color: var(--app-accent);
}
.shadow-prompt-bar__trigger svg:last-child {
  margin-left: auto;
}
.shadow-prompt-bar__label {
  overflow: hidden;
  font-weight: var(--app-font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shadow-prompt-bar__state {
  color: var(--app-text-tertiary, var(--app-text-secondary));
  font-size: var(--app-font-micro);
}
.shadow-prompt-bar__desktop-panel {
  position: absolute;
  right: var(--app-space-3);
  bottom: calc(100% + var(--app-space-2));
  z-index: 20;
  width: min(34rem, calc(100vw - 2rem));
  padding: var(--app-space-4);
  border: 1px solid var(--app-border-subtle);
  border-radius: var(--app-radius-panel);
  background: var(--app-surface, var(--app-chat-bg));
  box-shadow: var(--app-shadow-popover);
}
@media (max-width: 767px) {
  .shadow-prompt-bar__trigger {
    min-height: 2.25rem;
  }
  .shadow-prompt-bar__state {
    display: none;
  }
}
</style>
