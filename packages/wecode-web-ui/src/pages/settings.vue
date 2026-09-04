<template>
  <div class="flex-1 min-w-0 h-full overflow-hidden">
    <RouterView />
    <template v-if="route.path === '/settings'">
      <SettingsPanel v-if="!isMobile" data-tour-page="settings" class="flex-1 min-w-0 h-full" />
      <MePanel
        v-else
        @navigate="navigateMobilePath"
        @tutorial="introTour?.start()"
        @manage-servers="openInstancePicker"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { useAppShell } from "@/composables/use-app-shell";
import SettingsPanel from "@/components/settings/SettingsPanel.vue";
import MePanel from "@/components/settings/MePanel.vue";

defineOptions({ name: "SettingsPage" });

const route = useRoute();
const { isMobile, introTour, navigateMobilePath, openInstancePicker } = useAppShell();
</script>
