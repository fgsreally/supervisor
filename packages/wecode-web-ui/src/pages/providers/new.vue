<template>
  <ProviderFormView
    :provider-id="null"
    :show-back="isMobile"
    @cancel="closeProviderForm"
    @saved="onProviderSaved"
  />
</template>

<script setup lang="ts">
import { useAppShell } from "@/composables/use-app-shell";
import ProviderFormView from "@/views/provider/ProviderFormView.vue";

const { isMobile, closeProviderForm, onProviderSaved } = useAppShell();
</script>
