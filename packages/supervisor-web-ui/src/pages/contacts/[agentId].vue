<template>
  <ContactDetailView
    v-if="activeAgent"
    :agent-id="activeAgentId ?? ''"
    :show-back="isMobile"
    @back="backToMobileList"
    @open-chat="openChatFromContact"
    @view-provider="viewProvider"
  />
</template>

<script setup lang="ts">
import { useAppShell } from "@/composables/use-app-shell";
import ContactDetailView from "@/views/agent/ContactDetailView.vue";

const { isMobile, activeAgentId, activeAgent, openChatFromContact, viewProvider, backToMobileList } =
  useAppShell();
</script>
