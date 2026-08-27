<template>
  <div
    class="shadow-prompt-bar"
    :class="{ 'shadow-prompt-bar--disabled': !enabled, 'shadow-prompt-bar--compact': compact }"
  >
    <button
      type="button"
      class="shadow-prompt-bar__trigger"
      :aria-expanded="open"
      :title="t('chat.shadowPrompt.open')"
      @click="open = true"
    >
      <Ghost aria-hidden="true" />
      <span v-if="!compact" class="shadow-prompt-bar__label">{{
        current?.name || t("chat.shadowPrompt.custom")
      }}</span>
      <span v-if="current && !compact" class="shadow-prompt-bar__state">{{
        t("chat.shadowPrompt.active")
      }}</span>
      <span v-else-if="!enabled && !compact" class="shadow-prompt-bar__state">{{
        t("chat.shadowPrompt.disabled")
      }}</span>
    </button>

    <ResponsiveDialog
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
import { Ghost } from "lucide-vue-next";
import type * as api from "@/api";
import ResponsiveDialog from "../base/ResponsiveDialog/index.vue";
import { useI18n } from "@/i18n";
import ShadowPromptEditor, { type ShadowPromptValue } from "./ShadowPromptEditor.vue";

defineProps<{
  enabled: boolean;
  compact?: boolean;
  sessionId: string;
  current?: ShadowPromptValue | null;
}>();
const emit = defineEmits<{ saved: [session: api.Session] }>();
const { t } = useI18n();
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
.shadow-prompt-bar--compact {
  border: 0;
  background: transparent;
}
.shadow-prompt-bar--compact .shadow-prompt-bar__trigger {
  width: auto;
  min-height: 0;
  padding: 6px;
  border-radius: 8px;
}
.shadow-prompt-bar--compact .shadow-prompt-bar__trigger svg {
  width: 19px;
  height: 19px;
  color: var(--app-toolbar-icon);
}
.shadow-prompt-bar--compact .shadow-prompt-bar__trigger:hover svg {
  color: var(--app-text-primary);
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
@media (max-width: 767px) {
  .shadow-prompt-bar__trigger {
    min-height: 2.25rem;
  }
  .shadow-prompt-bar__state {
    display: none;
  }
}
</style>
