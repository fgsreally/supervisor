<template>
  <Teleport to="body">
    <Transition name="chat-sheet" :duration="{ enter: 300, leave: 180 }">
      <div v-if="open" class="chat-session-tools" @click.self="emit('close')">
        <section class="chat-session-tools__sheet">
          <div class="chat-session-tools__handle" aria-hidden="true" />
          <div class="chat-session-tools__grid">
            <button type="button" @click="emit('search')">
              <Search /><span>搜索</span>
            </button>
            <button type="button" @click="emit('logs')">
              <ScrollText /><span>日志</span>
            </button>
            <button type="button" @click="emit('files')">
              <FolderTree /><span>文件</span>
            </button>
            <button v-if="showTasks" type="button" @click="emit('tasks')">
              <ClipboardList /><span>任务</span>
            </button>
          </div>
          <button class="chat-session-tools__cancel" type="button" @click="emit('close')">
            取消
          </button>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ClipboardList, FolderTree, ScrollText, Search } from "lucide-vue-next";

defineProps<{ open: boolean; showTasks?: boolean }>();
const emit = defineEmits<{
  close: [];
  search: [];
  logs: [];
  files: [];
  tasks: [];
}>();
</script>

<style scoped>
.chat-session-tools {
  position: fixed;
  z-index: 80;
  inset: 0;
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 32%);
}

.chat-session-tools__sheet {
  width: 100%;
  padding: 8px 12px calc(12px + env(safe-area-inset-bottom));
  border-radius: 16px 16px 0 0;
  background: var(--m-page-bg, #ededed);
}

.chat-session-tools__handle {
  width: 34px;
  height: 4px;
  margin: 0 auto 12px;
  border-radius: 999px;
  background: var(--m-text-muted, #c8c8c8);
}

.chat-session-tools__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 14px 10px;
  border-radius: 12px;
  background: var(--m-surface, #fff);
}

.chat-session-tools__grid button {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 2px;
  color: var(--m-text-secondary, #575757);
  font-size: 12px;
}

.chat-session-tools__grid button :deep(svg) {
  width: 22px;
  height: 22px;
  color: var(--m-accent, #07c160);
}

.chat-session-tools__grid button:active {
  border-radius: 8px;
  background: var(--m-pressed, #ededed);
}

.chat-session-tools__cancel {
  width: 100%;
  margin-top: 8px;
  padding: 12px;
  border-radius: 12px;
  background: var(--m-surface, #fff);
  color: var(--m-text-primary, #191919);
  font-size: 15px;
}
</style>
