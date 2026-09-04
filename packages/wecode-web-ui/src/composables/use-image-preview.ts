import { readonly, ref } from "vue";

export interface ImagePreviewState {
  urls: string[];
  index: number;
}

const state = ref<ImagePreviewState | null>(null);

/** Open a full-screen image preview (el-image style). */
export function openImagePreview(urls: string | string[], index = 0) {
  const list = (Array.isArray(urls) ? urls : [urls]).map((url) => url.trim()).filter(Boolean);
  if (!list.length) return;
  const clamped = Math.min(Math.max(index, 0), list.length - 1);
  state.value = { urls: list, index: clamped };
}

export function closeImagePreview() {
  state.value = null;
}

export function useImagePreview() {
  return {
    preview: readonly(state),
    openImagePreview,
    closeImagePreview,
  };
}
