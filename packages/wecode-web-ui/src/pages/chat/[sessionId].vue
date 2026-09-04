<template>
  <ChatView
    v-if="chatSessionProps"
    :key="activeSessionId ?? undefined"
    :session="chatSessionProps"
    :agent-id="chatSessionProps.agentId"
    :show-back="isMobile"
    @back="backToMobileList"
    @navigate="selectSession"
    @view-agent="viewAgent"
  />
</template>

<script setup lang="ts">
import { useAppShell } from "@/composables/use-app-shell";
import ChatView from "@/views/ChatView.vue";

const {
  isMobile,
  activeSessionId,
  chatSessionProps,
  selectSession,
  viewAgent,
  backToMobileList,
} = useAppShell();
</script>
