<template>
  <Teleport to="body">
    <Transition name="ui-busy">
      <div v-if="busy > 0" class="ui-busy" role="status" aria-live="polite">
        <div class="ui-busy__panel">
          <Loader2 class="ui-busy__spin" />
          <span>{{ busyText }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import { useUiBusy } from "@/composables/use-ui-busy";

const { busy, busyText } = useUiBusy();
</script>

<style scoped>
.ui-busy {
  position: fixed;
  z-index: 230;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 28%);
}
.ui-busy__panel {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 140px;
  padding: 14px 18px;
  border-radius: 10px;
  color: var(--app-text-primary);
  background: var(--app-popup-bg);
  box-shadow: 0 10px 30px rgb(0 0 0 / 18%);
  font-size: 13px;
}
.ui-busy__spin {
  width: 18px;
  height: 18px;
  color: var(--app-accent);
  animation: ui-busy-spin 0.8s linear infinite;
}
@keyframes ui-busy-spin {
  to {
    transform: rotate(360deg);
  }
}
.ui-busy-enter-active,
.ui-busy-leave-active {
  transition: opacity 0.16s ease;
}
.ui-busy-enter-from,
.ui-busy-leave-to {
  opacity: 0;
}
</style>
