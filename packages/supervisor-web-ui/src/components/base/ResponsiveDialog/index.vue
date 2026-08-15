<template>
  <component :is="isMobile ? MobileDialog : PcDialog" v-bind="$props" @close="emit('close')">
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps" />
    </template>
  </component>
</template>

<script setup lang="ts">
import { useMobileViewport } from "@/composables/use-mobile-viewport";
import MobileDialog from "./mobile.vue";
import PcDialog from "./pc.vue";
import type { ResponsiveDialogProps } from "./frame.vue";

defineOptions({ inheritAttrs: false });
defineProps<ResponsiveDialogProps>();
const emit = defineEmits<{ close: [] }>();

const isMobile = useMobileViewport();
</script>
