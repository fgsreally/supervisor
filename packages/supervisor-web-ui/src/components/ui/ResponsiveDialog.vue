<template>
  <MobileDrawer
    :open="open"
    :ariaLabel="title || 'Dialog'"
    :title="title"
    variant="adaptive"
    size="tall"
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
import { MobileDrawer } from "@/components/mobile/ui";

withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    showClose?: boolean;
    panelClass?: string;
  }>(),
  {
    showClose: true,
    panelClass: undefined,
  },
);
const emit = defineEmits<{ close: [] }>();
</script>
