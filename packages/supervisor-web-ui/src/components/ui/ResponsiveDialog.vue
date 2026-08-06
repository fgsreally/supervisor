<template>
  <MobileDrawer
    :open="open"
    :ariaLabel="title || 'Dialog'"
    :title="title"
    variant="adaptive"
    size="tall"
    show-close
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

defineProps<{ open: boolean; title?: string }>();
const emit = defineEmits<{ close: [] }>();
</script>
