<template>
  <MobileDrawer
    :open="open"
    ariaLabel="选择会话"
    title="选择会话"
    size="auto"
    :resizable="false"
    show-footer
    footer-cancel-text="取消"
    body-class="share-session-picker__body"
    @close="onCancel"
  >
    <div class="share-session-picker">
      <p class="share-session-picker__hint">将分享的图片添加到会话输入框</p>
      <button
        v-for="session in sessions"
        :key="session.id"
        type="button"
        class="share-session-picker__item"
        :class="{ 'share-session-picker__item--active': session.id === highlightId }"
        @click="onSelect(session.id)"
      >
        <SessionAvatar
          :session-id="session.id"
          :name="session.title || session.id"
          :agent-id="session.agentId"
          :avatar="session.avatar"
          :size="40"
        />
        <span class="share-session-picker__title">{{ session.title || session.id }}</span>
      </button>
    </div>
  </MobileDrawer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useSessionStore } from "@/store";
import {
  cancelPendingShareSession,
  confirmPendingShareSession,
  usePendingShareHighlightSessionId,
  usePendingShareNeedsSession,
} from "@/composables/use-pending-share";
import MobileDrawer from "../mobile/ui/MobileDrawer.vue";
import SessionAvatar from "./SessionAvatar.vue";

const sessionStore = useSessionStore();
const open = usePendingShareNeedsSession();
const highlightId = usePendingShareHighlightSessionId();

const sessions = computed(() => sessionStore.sessions.filter((session) => !session.isBuiltin));

function onCancel() {
  cancelPendingShareSession();
}

function onSelect(sessionId: string) {
  void confirmPendingShareSession(sessionId);
}
</script>

<style scoped>
.share-session-picker {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 4px 8px;
}

.share-session-picker__hint {
  margin: 0 12px 8px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--app-text-muted, #888);
}

.share-session-picker__item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.share-session-picker__item:hover,
.share-session-picker__item:active {
  background: rgba(0, 0, 0, 0.04);
}

.share-session-picker__item--active {
  background: var(--app-list-active-bg, rgba(7, 193, 96, 0.12));
}

.share-session-picker__title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
