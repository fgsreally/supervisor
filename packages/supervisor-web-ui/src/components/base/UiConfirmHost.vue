<template>
  <UiDialog
    :open="confirm.open"
    :title="confirm.title"
    :dismiss-on-backdrop="true"
    :panel-class="isMobile ? undefined : 'ui-confirm-dialog--desktop'"
    @close="resolveUiConfirm(false)"
  >
    <p :class="{ 'ui-confirm__message--desktop': !isMobile }">{{ confirm.message }}</p>
    <input
      v-if="confirm.expectedText"
      v-model="confirmationText"
      class="ui-confirm__input"
      :class="{ 'ui-confirm__input--desktop': !isMobile }"
      type="text"
      :placeholder="confirm.expectedText"
      @keydown.enter.prevent="confirmAction"
    />
    <template #footer>
      <!-- PC: right-aligned action buttons -->
      <div v-if="!isMobile" class="ui-confirm__actions ui-confirm__actions--desktop">
        <UiActionButton variant="secondary" @click="resolveUiConfirm(false)">{{ confirm.cancelText }}</UiActionButton>
        <UiActionButton
          :variant="confirm.danger ? 'danger' : 'primary'"
          :disabled="!!confirm.expectedText && confirmationText !== confirm.expectedText"
          @click="confirmAction"
        >
          {{ confirm.confirmText }}
        </UiActionButton>
      </div>
      <!-- Mobile: WeChat-style split footer -->
      <div v-else class="ui-confirm__actions ui-confirm__actions--mobile">
        <button type="button" class="ui-confirm__cancel" @click="resolveUiConfirm(false)">
          {{ confirm.cancelText }}
        </button>
        <button
          type="button"
          class="ui-confirm__ok"
          :class="{ 'ui-confirm__ok--danger': confirm.danger }"
          :disabled="!!confirm.expectedText && confirmationText !== confirm.expectedText"
          @click="confirmAction"
        >
          {{ confirm.confirmText }}
        </button>
      </div>
    </template>
  </UiDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import UiDialog from "@/components/base/UiDialog.vue";
import { UiActionButton } from "@/components/base";
import { useMobileViewport } from "@/composables/use-mobile-viewport";
import { resolveUiConfirm, useUiConfirm } from "@/composables/use-ui-confirm";

const { confirm } = useUiConfirm();
const isMobile = useMobileViewport();
const confirmationText = ref("");

watch(
  () => confirm.value.open,
  () => {
    confirmationText.value = "";
  },
);

function confirmAction() {
  if (confirm.value.expectedText && confirmationText.value !== confirm.value.expectedText) return;
  void resolveUiConfirm(true);
}
</script>

<style scoped>
.ui-confirm__input {
  width: 100%;
  margin-top: 14px;
  padding: 9px 10px;
  color: var(--app-text-primary);
  font-size: var(--app-font-body);
  background: var(--app-input-bg, transparent);
  border: 1px solid var(--app-border-subtle);
  border-radius: 7px;
  outline: none;
}

.ui-confirm__input:focus {
  border-color: var(--app-accent);
}

/* PC: fixed px type matching pre-type-scale confirm */
.ui-confirm__message--desktop {
  font-size: 13px;
}

.ui-confirm__input--desktop {
  font-size: 13px;
}

.ui-confirm__actions--desktop {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
}

.ui-confirm__actions--mobile {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.ui-confirm__cancel,
.ui-confirm__ok {
  padding: 13px 12px;
  font-size: var(--app-font-control);
  font-weight: var(--app-font-weight-medium);
  transition: background-color 0.12s ease;
}

.ui-confirm__cancel {
  color: var(--app-text-primary);
  border-right: 1px solid var(--app-border-subtle);
}

.ui-confirm__ok {
  color: var(--app-accent);
  font-weight: var(--app-font-weight-semibold);
}

.ui-confirm__ok--danger {
  color: #fa5151;
}

.ui-confirm__cancel:hover,
.ui-confirm__ok:hover {
  background: var(--app-popup-hover);
}

.ui-confirm__ok:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.ui-confirm__cancel:active,
.ui-confirm__ok:active {
  background: var(--app-popup-selected);
}
</style>

<style>
/* Unscoped: panelClass lands on UiDialog root */
.ui-dialog.ui-confirm-dialog--desktop .ui-dialog__title {
  font-size: 16px;
  font-weight: 600;
}

.ui-dialog.ui-confirm-dialog--desktop .ui-dialog__body {
  font-size: 13px;
}
</style>
