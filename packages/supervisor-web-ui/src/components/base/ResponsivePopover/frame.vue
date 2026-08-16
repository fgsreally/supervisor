<template>
  <div ref="root" class="responsive-popover">
    <slot name="trigger" :open="open" :toggle="toggle" />

    <section
      v-if="open && !isMobile"
      class="responsive-popover__panel"
      :class="panelClass"
      role="dialog"
      :aria-label="title"
    >
      <slot :mobile="false" />
    </section>

    <SheetDrawer
      :open="open && isMobile"
      :ariaLabel="title"
      size="auto"
      show-footer
      @close="close"
    >
      <slot :mobile="true" />
    </SheetDrawer>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import SheetDrawer from "@/components/base/SheetDrawer.vue";
import { useMobileViewport } from "@/composables/use-mobile-viewport";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    panelClass?: string;
    dismissOnOutside?: boolean;
  }>(),
  {
    dismissOnOutside: true,
  },
);

const emit = defineEmits<{ "update:open": [open: boolean] }>();

const root = ref<HTMLElement | null>(null);
const isMobile = useMobileViewport();

function close() {
  emit("update:open", false);
}

function toggle() {
  emit("update:open", !props.open);
}

onClickOutside(root, () => {
  if (props.open && props.dismissOnOutside && !isMobile.value) close();
});
</script>

<style scoped>
.responsive-popover {
  position: relative;
}
</style>
