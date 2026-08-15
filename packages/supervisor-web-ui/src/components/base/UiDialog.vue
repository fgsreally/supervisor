<template>
  <Teleport to="body">
    <Transition name="chat-overlay" :duration="{ enter: 220, leave: 160 }">
      <div v-if="open" class="ui-dialog-backdrop" @click.self="onBackdrop">
        <section
          class="ui-dialog"
          :class="panelClass"
          role="dialog"
          aria-modal="true"
          :aria-label="ariaLabel || title || '对话框'"
        >
          <header v-if="showHeader" class="ui-dialog__header">
            <slot name="header">
              <h2 v-if="title" class="ui-dialog__title">{{ title }}</h2>
            </slot>
            <button
              v-if="showClose"
              type="button"
              class="ui-dialog__close"
              aria-label="关闭"
              @click="emit('close')"
            >
              ×
            </button>
          </header>
          <div class="ui-dialog__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="ui-dialog__footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, useSlots } from "vue";

/**
 * Light notification / short-form dialog (c):
 * Always a centered modal on both desktop and mobile.
 * Prefer this over ResponsiveDialog when content is short
 * (alerts, confirmations, few fields).
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    ariaLabel?: string;
    showClose?: boolean;
    dismissOnBackdrop?: boolean;
    panelClass?: string;
  }>(),
  {
    showClose: false,
    dismissOnBackdrop: true,
  },
);

const emit = defineEmits<{ close: [] }>();
const slots = useSlots();

const showHeader = computed(() => Boolean(slots.header || props.title || props.showClose));

function onBackdrop() {
  if (props.dismissOnBackdrop) emit("close");
}
</script>

<style scoped>
.ui-dialog-backdrop {
  position: fixed;
  z-index: 220;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 42%);
  backdrop-filter: blur(2px);
}

.ui-dialog {
  width: min(380px, calc(100vw - 48px));
  overflow: hidden;
  border: 1px solid var(--app-popup-border, var(--app-border-subtle));
  border-radius: 12px;
  background: var(--app-popup-bg);
  box-shadow:
    0 0 0 1px rgb(0 0 0 / 3%),
    0 24px 64px rgb(0 0 0 / 22%);
}

.ui-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 22px 22px 8px;
}

.ui-dialog__title {
  margin: 0;
  color: var(--app-text-primary);
  font-size: var(--app-font-title);
  font-weight: var(--app-font-weight-semibold);
}

.ui-dialog__close {
  margin: -6px -6px 0 0;
  padding: 4px 8px;
  color: var(--app-text-secondary);
  font-size: var(--app-font-title);
  line-height: 1;
  border-radius: 6px;
}

.ui-dialog__close:hover {
  background: var(--app-popup-hover);
}

.ui-dialog__body {
  padding: 0 22px 20px;
  color: var(--app-text-secondary);
  font-size: var(--app-font-body);
  line-height: 1.55;
}

.ui-dialog__body :deep(p) {
  margin: 0;
}

.ui-dialog__footer {
  border-top: 1px solid var(--app-border-subtle);
}
</style>
