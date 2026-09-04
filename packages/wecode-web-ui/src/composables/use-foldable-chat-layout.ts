import { createGlobalState } from "@vueuse/core";
import { ref } from "vue";

export const useFoldableChatLayout = createGlobalState(() => {
  const panelOpen = ref(false);

  function setPanelOpen(value: boolean) {
    panelOpen.value = value;
  }

  return { panelOpen, setPanelOpen };
});
