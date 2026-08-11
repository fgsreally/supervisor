<template>
  <MobileDrawer
    :open="open"
    :ariaLabel="title || ariaLabel || 'Dialog'"
    :title="title"
    variant="adaptive"
    :size="size"
    :show-close="showClose"
    :panel-class="panelClass"
    @close="emit('close')"
  >
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </MobileDrawer>
</template>

<script setup lang="ts">
import MobileDrawer, { type MobileDrawerSize } from "@/components/mobile/ui/MobileDrawer.vue";

/**
 * Heavy-content surface (b):
 * - Desktop: centered modal
 * - Mobile: bottom drawer
 *
 * Use for multi-section forms, lists, or long content that still belongs
 * in an overlay (not a session split). For short alerts / confirms use UiDialog.
 * For session log / files / tools use ResponsiveSplitSurface.
 */
withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    ariaLabel?: string;
    showClose?: boolean;
    panelClass?: string;
    size?: MobileDrawerSize;
  }>(),
  {
    showClose: true,
    panelClass: undefined,
    size: "tall",
  },
);
const emit = defineEmits<{ close: [] }>();
</script>
