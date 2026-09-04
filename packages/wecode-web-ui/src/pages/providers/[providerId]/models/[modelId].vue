<template>
  <ProviderModelDetailView
    v-if="activeProvider && activeProviderModel"
    :provider="activeProvider"
    :model="activeProviderModel"
    @edit="openModelEdit"
    @deleted="deleteActiveModel"
  />
</template>

<script setup lang="ts">
import { useAppShell } from "@/composables/use-app-shell";
import ProviderModelDetailView from "@/views/provider/ProviderModelDetailView.vue";

const { activeProvider, activeProviderModel, openModelEdit, deleteActiveModel } = useAppShell();
</script>
