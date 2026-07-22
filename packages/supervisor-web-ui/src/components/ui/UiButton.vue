<template>
  <button class="ui-button" :class="`ui-button--${variant}`" :type="type">
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "primary" | "secondary";
    type?: "button" | "submit" | "reset";
  }>(),
  { variant: "secondary", type: "button" },
);
</script>

<style scoped>
.ui-button {
  min-width: 72px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
}

.ui-button--secondary {
  border: 1px solid var(--app-border);
  background: var(--app-settings-card);
  color: var(--app-text-primary);
}

.ui-button--secondary:hover:not(:disabled) {
  background: var(--app-hover);
}

.ui-button--primary {
  border: 1px solid var(--app-accent);
  background: var(--app-accent);
  color: #ffffff;
}

.ui-button--primary:hover:not(:disabled) {
  border-color: var(--app-accent-hover);
  background: var(--app-accent-hover);
}

.ui-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
