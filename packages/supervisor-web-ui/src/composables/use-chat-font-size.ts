import { computed } from "vue";
import { useAppFontScale, type AppFontScale } from "./use-app-font-scale";

export type ChatFontSize = "small" | "medium" | "large";

const SIZE_PX: Record<AppFontScale, string> = {
  compact: "11.5px",
  standard: "12.5px",
  large: "14px",
};

export function useChatFontSize() {
  const { fontScale, setFontScale } = useAppFontScale();
  const fontSizePx = computed(() => SIZE_PX[fontScale.value]);

  function setChatFontSize(value: ChatFontSize) {
    if (value === "small") setFontScale("compact");
    else if (value === "large") setFontScale("large");
    else setFontScale("standard");
  }

  const chatFontSize = computed<ChatFontSize>(() => {
    if (fontScale.value === "compact") return "small";
    if (fontScale.value === "large") return "large";
    return "medium";
  });

  return {
    chatFontSize,
    fontSizePx,
    setChatFontSize,
  };
}
