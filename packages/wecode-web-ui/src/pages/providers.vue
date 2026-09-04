<template>
  <ListDetailChrome :show-list="!isMobile || mobilePage === 'list'">
    <template #list>
      <ProvidersPanel
        data-tour-page="providers"
        class="h-full w-full"
        :active-id="activeProviderId ?? ''"
        @select-provider="selectProvider"
        @add-provider="openProviderAdd"
        @edit-provider="openProviderEditFor"
        @delete-provider="onDeleteProvider"
      />
    </template>
    <RouterView />
    <ProviderDetailView
      v-if="!hasChild && activeProviderUi && !isMobile"
      :provider="activeProviderUi"
      @view-agent="viewAgent"
      @edit="openProviderEdit"
      @add-model="openAddModel(activeProviderUi.id)"
      @select-model="selectModelById"
      @edit-model="editModelById"
      @delete-model="deleteModelById"
      @toggle-enabled="setProviderEnabled"
    />
    <EmptyPlaceholder v-else-if="!hasChild && !isMobile" tab="providers" />
  </ListDetailChrome>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useAppShell } from "@/composables/use-app-shell";
import ProvidersPanel from "@/components/provider/ProvidersPanel.vue";
import ListDetailChrome from "@/components/layout/ListDetailChrome.vue";
import EmptyPlaceholder from "@/components/base/EmptyPlaceholder.vue";
import ProviderDetailView from "@/views/provider/ProviderDetailView.vue";

defineOptions({ name: "ProvidersPage" });

const route = useRoute();
const hasChild = computed(() => route.path !== "/providers");
const {
  isMobile,
  mobilePage,
  activeProviderId,
  activeProviderUi,
  selectProvider,
  openProviderAdd,
  openProviderEditFor,
  onDeleteProvider,
  viewAgent,
  openProviderEdit,
  openAddModel,
  selectModelById,
  editModelById,
  deleteModelById,
  setProviderEnabled,
} = useAppShell();
</script>
