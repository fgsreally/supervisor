<template>
  <div ref="root" class="responsive-popover">
    <slot name="trigger" :open="open" :toggle="toggle" />
    <section
      v-if="open"
      class="responsive-popover__panel"
      :class="panelClass"
      role="dialog"
      :aria-label="title"
    >
      <slot :mobile="false" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import type { ResponsivePopoverProps } from "./types";

const props = withDefaults(defineProps<ResponsivePopoverProps>(), { dismissOnOutside: true });
const emit = defineEmits<{ "update:open": [open: boolean] }>();
const root = ref<HTMLElement | null>(null);

function close() {
  emit("update:open", false);
}

function toggle() {
  emit("update:open", !props.open);
}

onClickOutside(root, () => {
  if (props.open && props.dismissOnOutside) close();
});
</script>

<style scoped>
.responsive-popover {
  position: relative;
}
</style>
