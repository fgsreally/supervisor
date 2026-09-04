<template>
  <MobileShell v-if="isMobile" :tab="tab" :show-nav="showNav" @navigate="onNavigate">
    <slot />
  </MobileShell>
  <PcShell v-else :tab="tab" @update:tab="emit('update:tab', $event)" @tutorial="emit('tutorial')" />
</template>

<script setup lang="ts">
import { useMobileViewport } from "@/composables/use-mobile-viewport";
import type { MainTab } from "../ShellNav.vue";
import MobileShell from "./mobile.vue";
import PcShell from "./pc.vue";

defineProps<{
  tab: MainTab;
  showNav?: boolean;
}>();

const emit = defineEmits<{
  navigate: [route: "/chat" | "/todo" | "/contacts" | "/settings", direction: "forward" | "back"];
  "update:tab": [tab: MainTab];
  tutorial: [];
}>();

const isMobile = useMobileViewport();

function onNavigate(
  route: "/chat" | "/todo" | "/contacts" | "/settings",
  direction: "forward" | "back",
) {
  emit("navigate", route, direction);
}
</script>
