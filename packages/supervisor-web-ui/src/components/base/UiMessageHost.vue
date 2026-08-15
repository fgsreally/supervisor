<template>
  <Teleport to="body">
    <Transition name="ui-message">
      <div
        v-if="message"
        :key="message.id"
        class="ui-message"
        :class="`ui-message--${message.kind}`"
      >
        <CheckCircle2 v-if="message.kind === 'success'" />
        <AlertCircle v-else-if="message.kind === 'error'" />
        <Info v-else />
        <span>{{ message.text }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { AlertCircle, CheckCircle2, Info } from "lucide-vue-next";
import { useUiMessage } from "@/composables/use-ui-message";

const { message } = useUiMessage();
</script>

<style scoped>
.ui-message {
  position: fixed;
  z-index: 200;
  top: 22px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  max-width: min(420px, calc(100vw - 32px));
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--app-border-subtle);
  border-radius: var(--app-radius-control);
  color: var(--app-text-primary);
  background: var(--app-popup-bg);
  box-shadow: 0 6px 24px rgb(0 0 0 / 16%);
  transform: translateX(-50%);
  font-size: var(--app-font-control);
}

.ui-message svg {
  width: 17px;
  height: 17px;
  flex: none;
}

.ui-message--success svg {
  color: var(--app-success);
}
.ui-message--error svg {
  color: var(--app-danger);
}
.ui-message--info svg {
  color: #576b95;
}
.ui-message-enter-active,
.ui-message-leave-active {
  transition: 0.18s ease;
}
.ui-message-enter-from,
.ui-message-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}

@media (max-width: 767px) {
  .ui-message {
    top: auto;
    bottom: calc(78px + env(safe-area-inset-bottom));
    padding: 11px 14px;
    border-radius: 10px;
    box-shadow: 0 8px 28px rgb(0 0 0 / 20%);
  }

  .ui-message-enter-from,
  .ui-message-leave-to {
    transform: translate(-50%, 10px);
  }
}
</style>
