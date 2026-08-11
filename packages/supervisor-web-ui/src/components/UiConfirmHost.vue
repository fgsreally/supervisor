<template>
  <UiDialog
    :open="confirm.open"
    :title="confirm.title"
    :dismiss-on-backdrop="true"
    @close="resolveUiConfirm(false)"
  >
    <p>{{ confirm.message }}</p>
    <input
      v-if="confirm.expectedText"
      v-model="confirmationText"
      class="ui-confirm__input"
      type="text"
      :placeholder="confirm.expectedText"
      @keydown.enter.prevent="confirmAction"
    />
    <template #footer>
      <div class="ui-confirm__actions">
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
import UiDialog from "@/components/ui/UiDialog.vue";
import { resolveUiConfirm, useUiConfirm } from "@/composables/use-ui-confirm";

const { confirm } = useUiConfirm();
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

.ui-confirm__actions {
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
