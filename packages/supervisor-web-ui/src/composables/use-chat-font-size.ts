import { computed, ref, watch } from "vue";

export type ChatFontSize = "small" | "medium" | "large";

const STORAGE_KEY = "pi-supervisor-chat-font-size";

const SIZE_PX: Record<ChatFontSize, string> = {
  small: "12.5px",
  medium: "14px",
  large: "16px",
};

function readStored(): ChatFontSize {
  if (typeof localStorage === "undefined") return "medium";
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "small" || raw === "medium" || raw === "large") return raw;
  return "medium";
}

const chatFontSize = ref<ChatFontSize>(readStored());

watch(chatFontSize, (value) => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, value);
});

export function useChatFontSize() {
  const fontSizePx = computed(() => SIZE_PX[chatFontSize.value]);

  function setChatFontSize(value: ChatFontSize) {
    chatFontSize.value = value;
  }

  return {
    chatFontSize,
    fontSizePx,
    setChatFontSize,
  };
}
