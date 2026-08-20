<template>
  <ListDetailChrome
    :show-list="!isMobile || mobilePage === 'list'"
    :foldable="isFoldable"
    :foldable-list-visible="!foldableChatPanelOpen"
  >
    <template #list>
      <ChatListPanel
        data-tour-page="chat"
        class="h-full w-full"
        :active-id="activeSessionId ?? ''"
        @select="selectSession"
        @delete="onSessionDelete"
        @settings="isMobile ? onMobileRootNavigate('/settings') : onTabChange('settings')"
      />
    </template>
    <RouterView />
    <ChatView
      v-if="!hasSession && chatSessionProps && !isMobile"
      :key="activeSessionId ?? undefined"
      :session="chatSessionProps"
      :agent-id="chatSessionProps.agentId"
      @navigate="selectSession"
      @view-agent="viewAgent"
    />
    <EmptyPlaceholder v-else-if="!hasSession && !isMobile" tab="chat" />
  </ListDetailChrome>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useAppShell } from "@/composables/use-app-shell";
import { useAppLayoutMode } from "@/composables/use-app-layout-mode";
import { useFoldableChatLayout } from "@/composables/use-foldable-chat-layout";
import ChatListPanel from "@/components/session/ChatListPanel.vue";
import ListDetailChrome from "@/components/layout/ListDetailChrome.vue";
import EmptyPlaceholder from "@/components/base/EmptyPlaceholder.vue";
import ChatView from "@/views/ChatView.vue";

defineOptions({ name: "ChatPage" });

const route = useRoute();
const hasSession = computed(() => "sessionId" in route.params);
const {
  isMobile,
  mobilePage,
  activeSessionId,
  chatSessionProps,
  selectSession,
  onSessionDelete,
  onTabChange,
  onMobileRootNavigate,
  viewAgent,
} = useAppShell();
const { isFoldable } = useAppLayoutMode();
const { panelOpen: foldableChatPanelOpen } = useFoldableChatLayout();
</script>
