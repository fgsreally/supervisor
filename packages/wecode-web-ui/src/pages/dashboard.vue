<template>
  <WorkShell mode="dashboard" data-tour-page="work" @navigate="navigateMobilePath">
    <HomeView
      data-tour-page="dashboard"
      class="flex-1 min-w-0 h-full"
      @open-session="openSessionFromHome"
    />
  </WorkShell>
</template>

<script setup lang="ts">
import { useAppShell } from "@/composables/use-app-shell";
import WorkShell from "@/components/home/WorkShell/index.vue";
import HomeView from "@/views/HomeView.vue";

defineOptions({ name: "DashboardPage" });

const { openSessionFromHome, navigateMobilePath } = useAppShell();
</script>
