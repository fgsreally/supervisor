import { readonly, ref } from "vue";
import { translate } from "@/i18n";

const busyCount = ref(0);
const busyText = ref(translate("common.loading"));

export function showUiBusy(text = translate("common.loading")) {
  busyText.value = text;
  busyCount.value += 1;
  return () => {
    busyCount.value = Math.max(0, busyCount.value - 1);
  };
}

export async function withUiBusy<T>(text: string, task: () => Promise<T>): Promise<T> {
  const done = showUiBusy(text);
  try {
    return await task();
  } finally {
    done();
  }
}

export function useUiBusy() {
  return {
    busy: readonly(busyCount),
    busyText: readonly(busyText),
    showUiBusy,
    withUiBusy,
  };
}
