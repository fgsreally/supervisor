<template>
  <Teleport to="body">
    <Transition name="chat-overlay" :duration="{ enter: 220, leave: 160 }">
      <div
        v-if="confirm.open"
        class="ui-confirm-backdrop"
        @click.self="resolveUiConfirm(false)"
      >
        <section
          class="ui-confirm"
          role="dialog"
          aria-modal="true"
          :aria-label="confirm.title"
        >
          <h2>{{ confirm.title }}</h2>
          <p>{{ confirm.message }}</p>
          <footer>
            <button type="button" class="ui-confirm__cancel" @click="resolveUiConfirm(false)">
              {{ confirm.cancelText }}
            </button>
            <button
              type="button"
              class="ui-confirm__ok"
              :class="{ 'ui-confirm__ok--danger': confirm.danger }"
              @click="resolveUiConfirm(true)"
            >
              {{ confirm.confirmText }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { resolveUiConfirm, useUiConfirm } from "@/composables/use-ui-confirm";

const { confirm } = useUiConfirm();
</script>

<style scoped>
.ui-confirm-backdrop {
  position: fixed;
  z-index: 220;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(0 0 0 / 36%);
}

.ui-confirm {
  width: min(360px, calc(100vw - 40px));
  overflow: hidden;
  border-radius: 12px;
  background: var(--app-popup-bg);
  box-shadow: 0 12px 40px rgb(0 0 0 / 18%);
}

.ui-confirm h2 {
  margin: 0;
  padding: 22px 22px 8px;
  color: var(--app-text-primary);
  font-size: 16px;
  font-weight: 600;
}

.ui-confirm p {
  margin: 0;
  padding: 0 22px 20px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.ui-confirm footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 1px solid var(--app-border-subtle);
}

.ui-confirm footer button {
  padding: 13px 12px;
  font-size: 14px;
  transition: background-color 0.12s ease;
}

.ui-confirm__cancel {
  color: var(--app-text-primary);
  border-right: 1px solid var(--app-border-subtle);
}

.ui-confirm__ok {
  color: var(--app-accent);
  font-weight: 600;
}

.ui-confirm__ok--danger {
  color: #fa5151;
}

.ui-confirm footer button:hover {
  background: var(--app-popup-hover);
}

.ui-confirm footer button:active {
  background: var(--app-popup-selected);
}
</style>
