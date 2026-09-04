<template>
  <SettingsPanel
    :key="settingsPanelMode"
    :show-back="isMobile"
    mode="diagnostics"
    @back="navigateMobilePath('/settings')"
  />
</template>

<script setup lang="ts">
import { useAppShell } from "@/composables/use-app-shell";
import SettingsPanel from "@/components/settings/SettingsPanel.vue";

const { isMobile, settingsPanelMode, navigateMobilePath } = useAppShell();
</script>
