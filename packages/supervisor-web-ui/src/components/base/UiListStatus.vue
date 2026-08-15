<template>
  <span class="ui-list-status" :class="`ui-list-status--${status}`" :title="title">
    <Loader2 v-if="status === 'loading'" class="ui-list-status__spin" />
    <Check v-else-if="status === 'success'" />
    <X v-else-if="status === 'error'" />
  </span>
</template>

<script setup lang="ts">
import { Check, Loader2, X } from "lucide-vue-next";

export type UiListStatusKind = "loading" | "success" | "error" | "idle";

withDefaults(
  defineProps<{
    status?: UiListStatusKind;
    title?: string;
  }>(),
  {
    status: "idle",
  },
);
</script>

<style scoped>
.ui-list-status {
  display: inline-grid;
  width: 16px;
  height: 16px;
  place-items: center;
  flex-shrink: 0;
}
.ui-list-status--idle {
  visibility: hidden;
}
.ui-list-status svg {
  width: 14px;
  height: 14px;
}
.ui-list-status--loading {
  color: var(--app-accent);
}
.ui-list-status--success {
  color: #07c160;
}
.ui-list-status--error {
  color: #fa5151;
}
.ui-list-status__spin {
  animation: ui-list-spin 0.8s linear infinite;
}
@keyframes ui-list-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
