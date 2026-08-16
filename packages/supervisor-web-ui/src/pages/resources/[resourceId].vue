<template>
  <ResourceDetailView
    v-if="activeResourceId"
    :resource-id="activeResourceId"
    :show-back="isMobile"
    @back="backToMobileList"
    @deleted="onResourceDeleted"
  />
</template>

<script setup lang="ts">
import { useAppShell } from "@/composables/use-app-shell";
import ResourceDetailView from "@/views/resource/ResourceDetailView.vue";

const { isMobile, activeResourceId, backToMobileList, onResourceDeleted } = useAppShell();
</script>
