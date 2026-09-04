<template>
  <ProviderModelFormView
    v-if="activeProviderId && activeProvider"
    :provider-id="activeProviderId"
    :provider-name="activeProvider.name"
    mode="create"
    :model="activeProviderModelUi"
    @cancel="closeModelForm"
    @saved="onModelSaved"
  />
</template>

<script setup lang="ts">
import { useAppShell } from "@/composables/use-app-shell";
import ProviderModelFormView from "@/views/provider/ProviderModelFormView.vue";

const { activeProviderId, activeProvider, activeProviderModelUi, closeModelForm, onModelSaved } =
  useAppShell();
</script>
