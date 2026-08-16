<template>
  <RouterView />
  <ProviderDetailView
    v-if="!hasModelChild && activeProviderUi"
    :provider="activeProviderUi"
    :show-back="isMobile"
    @back="backToMobileList"
    @view-agent="viewAgent"
    @edit="openProviderEdit"
    @add-model="openAddModel(activeProviderUi.id)"
    @select-model="selectModelById"
    @edit-model="editModelById"
    @delete-model="deleteModelById"
    @toggle-enabled="setProviderEnabled"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useAppShell } from "@/composables/use-app-shell";
import ProviderDetailView from "@/views/provider/ProviderDetailView.vue";

const route = useRoute();
const hasModelChild = computed(() => route.path.includes("/models/"));
const {
  isMobile,
  activeProviderUi,
  viewAgent,
  openProviderEdit,
  openAddModel,
  selectModelById,
  editModelById,
  deleteModelById,
  setProviderEnabled,
  backToMobileList,
} = useAppShell();
</script>
