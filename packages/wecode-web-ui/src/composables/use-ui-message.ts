import { readonly, ref } from "vue";

export type UiMessageKind = "success" | "error" | "info";

interface UiMessage {
  id: number;
  kind: UiMessageKind;
  text: string;
}

const current = ref<UiMessage | null>(null);
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export function showUiMessage(text: string, kind: UiMessageKind = "info") {
  if (timer) clearTimeout(timer);
  current.value = { id: ++sequence, kind, text };
  timer = setTimeout(() => {
    current.value = null;
    timer = null;
  }, 2600);
}

export function useUiMessage() {
  return { message: readonly(current), showUiMessage };
}
