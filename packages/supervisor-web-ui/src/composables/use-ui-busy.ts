import { readonly, ref } from "vue";

const busyCount = ref(0);
const busyText = ref("加载中…");

export function showUiBusy(text = "加载中…") {
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
