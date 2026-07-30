<template>
  <button
    class="m-button"
    :class="[`m-button--${variant}`, `m-button--${size}`, { 'm-button--block': block }]"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    @click="emit('click', $event)"
  >
    <Loader2 v-if="loading" class="m-button__spinner" />
    <slot />
  </button>
</template>

<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";

withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "danger" | "ghost";
    size?: "small" | "medium" | "large";
    type?: "button" | "submit" | "reset";
    block?: boolean;
    disabled?: boolean;
    loading?: boolean;
  }>(),
  { variant: "secondary", size: "medium", type: "button" },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>
