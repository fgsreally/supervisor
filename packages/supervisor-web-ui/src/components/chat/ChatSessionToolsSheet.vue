<template>
  <MobileDrawer :open="open" :ariaLabel="t('chat.sessionTools.title')" size="auto" show-footer @close="emit('close')">
    <div class="chat-session-tools__grid">
      <button type="button" @click="emit('search')"><Search /><span>{{ t('chat.sessionTools.search') }}</span></button>
      <button type="button" @click="emit('logs')"><ScrollText /><span>{{ t('chat.sessionTools.logs') }}</span></button>
      <button v-if="showTasks" type="button" @click="emit('tasks')">
        <ClipboardList /><span>{{ t('chat.sessionTools.tasks') }}</span>
      </button>
      <button type="button" @click="emit('files')"><FolderTree /><span>{{ t('chat.sessionTools.files') }}</span></button>
    </div>
  </MobileDrawer>
</template>

<script setup lang="ts">
import { ClipboardList, FolderTree, ScrollText, Search } from "lucide-vue-next";
import { MobileDrawer } from "@/components/mobile/ui";
import { useI18n } from "@/i18n";

defineProps<{ open: boolean; showTasks?: boolean }>();
const emit = defineEmits<{ close: []; search: []; logs: []; files: []; tasks: [] }>();
const { t } = useI18n();
</script>

<style scoped>
.chat-session-tools__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.chat-session-tools__grid button { display: flex; min-width: 0; flex-direction: column; align-items: center; gap: 6px; padding: 8px 2px; color: var(--m-text-secondary, #575757); font-size: 12px; }
.chat-session-tools__grid button :deep(svg) { width: 22px; height: 22px; color: var(--m-accent, #07c160); }
.chat-session-tools__grid button:active { border-radius: 8px; background: var(--m-pressed, #ededed); }
</style>
