import { readonly, ref } from "vue";

export interface UiConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
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
  resolve: null,
});

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
      resolve,
    };
  });
}

export function resolveUiConfirm(value: boolean) {
  const current = state.value.resolve;
  state.value = { ...state.value, open: false, resolve: null };
  current?.(value);
}

export function useUiConfirm() {
  return {
    confirm: readonly(state),
    requestUiConfirm,
    resolveUiConfirm,
  };
}
