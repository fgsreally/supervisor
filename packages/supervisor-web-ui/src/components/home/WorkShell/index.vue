<template>
  <MobileWork v-if="isMobile" :mode="mode" @navigate="emit('navigate', $event)">
    <slot />
  </MobileWork>
  <PcWork v-else>
    <slot />
  </PcWork>
</template>

<script setup lang="ts">
import { useMobileViewport } from "@/composables/use-mobile-viewport";
import MobileWork from "./mobile.vue";
import PcWork from "./pc.vue";

defineProps<{ mode: "todo" | "dashboard" }>();
const emit = defineEmits<{ navigate: [route: "/todo" | "/dashboard"] }>();

const isMobile = useMobileViewport();
</script>
