<template>
  <AgentFormView :show-back="isMobile" @cancel="closeAgentForm" @saved="onAgentSaved" />
</template>

<script setup lang="ts">
import { useAppShell } from "@/composables/use-app-shell";
import AgentFormView from "@/views/agent/AgentFormView.vue";

const { isMobile, closeAgentForm, onAgentSaved } = useAppShell();
</script>
