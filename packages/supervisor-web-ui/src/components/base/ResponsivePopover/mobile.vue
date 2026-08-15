<template>
  <div class="responsive-popover">
    <slot name="trigger" :open="open" :toggle="toggle" />
    <MobileDrawer :open="open" :ariaLabel="title" size="auto" show-footer @close="close">
      <slot :mobile="true" />
    </MobileDrawer>
  </div>
</template>

<script setup lang="ts">
import MobileDrawer from "@/components/mobile/ui/MobileDrawer.vue";
import type { ResponsivePopoverProps } from "./types";

const props = withDefaults(defineProps<ResponsivePopoverProps>(), { dismissOnOutside: true });
const emit = defineEmits<{ "update:open": [open: boolean] }>();

function close() {
  emit("update:open", false);
}

function toggle() {
  emit("update:open", !props.open);
}
</script>

<style scoped>
.responsive-popover {
  position: relative;
}
</style>
