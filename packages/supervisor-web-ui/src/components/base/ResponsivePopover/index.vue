<template>
  <component
    :is="isMobile ? MobilePopover : PcPopover"
    v-bind="$props"
    @update:open="emit('update:open', $event)"
  >
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps" />
    </template>
  </component>
</template>

<script setup lang="ts">
import { useMobileViewport } from "@/composables/use-mobile-viewport";
import MobilePopover from "./mobile.vue";
import PcPopover from "./pc.vue";
import type { ResponsivePopoverProps } from "./types";

defineOptions({ inheritAttrs: false });
defineProps<ResponsivePopoverProps>();
const emit = defineEmits<{ "update:open": [open: boolean] }>();
const isMobile = useMobileViewport();
</script>
