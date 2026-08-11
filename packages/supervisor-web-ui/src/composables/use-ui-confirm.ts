import { readonly, ref } from "vue";
import { hapticDelete } from "@/composables/use-native-haptics";

export interface UiConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  expectedText?: string;
  /** Fire native haptic when the user confirms (used by delete confirms). */
  haptic?: boolean;
}

interface UiConfirmState extends UiConfirmOptions {
  open: boolean;
  resolve: ((value: boolean) => void) | null;
}

const state = ref<UiConfirmState>({
  open: false,
  title: "",
  message: "",
  confirmText: "确定",
  cancelText: "取消",
  danger: false,
  haptic: false,
  resolve: null,
});

/** Light confirm dialog (c): always centered modal on PC and mobile. */
export function requestUiConfirm(options: UiConfirmOptions): Promise<boolean> {
  if (state.value.resolve) state.value.resolve(false);
  return new Promise<boolean>((resolve) => {
    state.value = {
      open: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText ?? "确定",
      cancelText: options.cancelText ?? "取消",
      danger: options.danger ?? false,
      expectedText: options.expectedText,
      haptic: options.haptic ?? false,
      resolve,
    };
  });
}

/**
 * Delete confirm dialog (d): always a centered modal (never a drawer),
 * danger styling, and native motor haptic on confirm.
 */
export function requestUiDeleteConfirm(
  options: Omit<UiConfirmOptions, "danger" | "haptic">,
): Promise<boolean> {
  return requestUiConfirm({
    ...options,
    confirmText: options.confirmText ?? "删除",
    danger: true,
    haptic: true,
  });
}

export async function resolveUiConfirm(value: boolean) {
  const current = state.value.resolve;
  const shouldHaptic = value && state.value.haptic;
  state.value = { ...state.value, open: false, resolve: null, haptic: false };
  if (shouldHaptic) await hapticDelete();
  current?.(value);
}

export function useUiConfirm() {
  return {
    confirm: readonly(state),
    requestUiConfirm,
    requestUiDeleteConfirm,
    resolveUiConfirm,
  };
}
