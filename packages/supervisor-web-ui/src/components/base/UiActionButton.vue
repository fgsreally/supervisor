<template>
  <button
    :type="type"
    class="ui-action-button"
    :class="[`ui-action-button--${variant}`, { 'ui-action-button--block': block }]"
    :disabled="disabled || loading"
    @click="emit('click', $event)"
  >
    <Loader2 v-if="loading" class="ui-action-button__spin" />
    <slot />
  </button>
</template>

<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";

withDefaults(
  defineProps<{
    loading?: boolean;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    variant?: "primary" | "secondary" | "danger" | "ghost";
    block?: boolean;
  }>(),
  {
    loading: false,
    disabled: false,
    type: "button",
    variant: "primary",
    block: false,
  },
);

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();
</script>

<style scoped>
.ui-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease,
    opacity 0.12s ease;
}
.ui-action-button--block {
  width: 100%;
}
.ui-action-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.ui-action-button__spin {
  width: 14px;
  height: 14px;
  animation: ui-action-spin 0.8s linear infinite;
}
.ui-action-button--primary {
  color: #fff;
  background: var(--app-accent);
}
.ui-action-button--primary:hover:not(:disabled) {
  filter: brightness(1.05);
}
.ui-action-button--secondary {
  color: var(--app-text-primary);
  border-color: var(--app-border-subtle);
  background: transparent;
}
.ui-action-button--secondary:hover:not(:disabled) {
  background: var(--app-hover);
}
.ui-action-button--danger {
  color: #fff;
  background: #fa5151;
}
.ui-action-button--ghost {
  color: var(--app-text-secondary);
  background: transparent;
}
.ui-action-button--ghost:hover:not(:disabled) {
  color: var(--app-accent);
}
@keyframes ui-action-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
