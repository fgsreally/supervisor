<template>
  <span class="m-popover-anchor">
    <span @click="emit('update:open', !open)"><slot name="trigger" /></span>
    <MobileDrawer
      :open="open"
      :ariaLabel="title || t('common.action')"
      size="auto"
      :show-footer="showFooter"
      @close="emit('update:open', false)"
    >
      <slot />
      <template v-if="$slots.footer" #footer>
        <slot name="footer" />
      </template>
    </MobileDrawer>
  </span>
</template>

<script setup lang="ts">
import MobileDrawer from "./MobileDrawer.vue";
import { useI18n } from "@/i18n";

withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    showFooter?: boolean;
  }>(),
  {
    showFooter: true,
  },
);

const emit = defineEmits<{ "update:open": [open: boolean] }>();
const { t } = useI18n();
</script>
