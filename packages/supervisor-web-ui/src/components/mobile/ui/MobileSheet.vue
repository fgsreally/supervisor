<template>
  <MobileDrawer
    :open="open"
    :ariaLabel="title || t('common.action')"
    :title="title"
    size="auto"
    :resizable="false"
    show-footer
    @close="emit('close')"
  >
    <slot />
  </MobileDrawer>
</template>

<script setup lang="ts">
import MobileDrawer from "./MobileDrawer.vue";
import { useI18n } from "@/i18n";

const { t } = useI18n();
defineProps<{ open: boolean; title?: string }>();
const emit = defineEmits<{ close: [] }>();
</script>
