<template>
  <div
    class="mobile-me h-full w-full flex flex-col shrink-0 min-w-0"
    data-tour-page="me"
    style="background: var(--app-list-section-bg)"
  >
    <header class="mobile-me__header m-mobile-header">
      <span aria-hidden="true" />
      <h1 class="m-mobile-header__title">我的</h1>
      <span aria-hidden="true" />
    </header>

    <div class="mobile-me__scroll flex-1 overflow-y-auto custom-scrollbar">
      <template v-for="group in groups" :key="group.title">
        <div
          class="list-section-label px-4 py-1.5 font-semibold tracking-wide sticky top-0 z-10"
        >
          {{ group.title }}
        </div>
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          class="mobile-me-item"
          :data-tour-tutorial="item.id === 'tutorial' ? '' : undefined"
          @click="open(item.id)"
        >
          <span class="mobile-me-item__icon" :style="{ '--m-feature-color': item.color }">
            <component :is="item.icon" />
          </span>
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate mobile-me-item__name">{{ item.label }}</div>
            <div class="truncate mt-0.5 mobile-me-item__desc">{{ item.description }}</div>
          </div>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  BookOpenCheck,
  Boxes,
  Cloud,
  FileSearch,
  MoonStar,
  Settings,
  Sparkles,
  Sun,
} from "lucide-vue-next";
import { useAppTheme } from "@/composables/use-app-theme";
import { useAppFontScale, type AppFontScale } from "@/composables/use-app-font-scale";
import { saveViewPreferences, viewPreferences } from "@/utils/view-preferences";

type ItemId =
  | "providers"
  | "resources"
  | "appearance"
  | "fontScale"
  | "advancedAnimations"
  | "settings"
  | "tutorial"
  | "diagnostics";

const emit = defineEmits<{
  navigate: [route: string];
  tutorial: [];
}>();

const { isDark, toggleDark } = useAppTheme();
const { fontScale, setFontScale } = useAppFontScale();

const appearanceDescription = computed(() =>
  isDark.value ? "当前暗色，点击切换为亮色" : "当前亮色，点击切换为暗色",
);
const fontScaleDescription = computed(() => {
  if (fontScale.value === "small") return "当前：小";
  if (fontScale.value === "large") return "当前：大";
  return "当前：标准";
});
const advancedAnimationsDescription = computed(() =>
  viewPreferences.advancedAnimations
    ? "已开启：列表移除/恢复使用粒子效果"
    : "已关闭：点击开启粒子消散动画",
);
const AppearanceIcon = computed(() => (isDark.value ? MoonStar : Sun));

const groups = computed(() => [
  {
    title: "能力管理",
    items: [
      {
        id: "providers" as const,
        label: "模型供应商",
        description: "管理可供智能代理使用的模型",
        icon: Cloud,
        color: "#576b95",
      },
      {
        id: "resources" as const,
        label: "资源中心",
        description: "管理能力、扩展、模板与连接",
        icon: Boxes,
        color: "#07c160",
      },
    ],
  },
  {
    title: "使用偏好",
    items: [
      {
        id: "appearance" as const,
        label: "外观",
        description: appearanceDescription.value,
        icon: AppearanceIcon.value,
        color: "#7b61c9",
      },
      {
        id: "fontScale" as const,
        label: "字号",
        description: fontScaleDescription.value,
        icon: BookOpenCheck,
        color: "#0ea5e9",
      },
      {
        id: "advancedAnimations" as const,
        label: "高级动画",
        description: advancedAnimationsDescription.value,
        icon: Sparkles,
        color: "#f59e0b",
      },
      {
        id: "settings" as const,
        label: "服务设置",
        description: "助手模型、语音与网页服务",
        icon: Settings,
        color: "#3b82f6",
      },
    ],
  },
  {
    title: "帮助与诊断",
    items: [
      {
        id: "tutorial" as const,
        label: "使用教程",
        description: "了解聊天、任务和智能代理",
        icon: BookOpenCheck,
        color: "#d97706",
      },
      {
        id: "diagnostics" as const,
        label: "高级与诊断",
        description: "运行状态、日志和技术配置",
        icon: FileSearch,
        color: "#8b8b8b",
      },
    ],
  },
]);

function cycleFontScale() {
  const order: AppFontScale[] = ["small", "standard", "large"];
  const idx = order.indexOf(fontScale.value);
  setFontScale(order[(idx + 1) % order.length]!);
}

function open(id: ItemId) {
  if (id === "providers") emit("navigate", "/providers");
  else if (id === "resources") emit("navigate", "/resources");
  else if (id === "appearance") toggleDark();
  else if (id === "fontScale") cycleFontScale();
  else if (id === "advancedAnimations") {
    viewPreferences.advancedAnimations = !viewPreferences.advancedAnimations;
    saveViewPreferences();
  } else if (id === "settings") emit("navigate", "/settings/services");
  else if (id === "diagnostics") emit("navigate", "/settings/diagnostics");
  else emit("tutorial");
}
</script>

<style scoped>
.mobile-me__header {
  flex-shrink: 0;
}

.list-section-label {
  background: var(--app-list-section-bg);
  color: var(--app-text-secondary);
}

.mobile-me-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--app-list-bg);
  text-align: left;
  transition: background-color 0.15s;
}

.mobile-me-item:active {
  background: var(--app-list-item-hover);
}

.mobile-me-item__name {
  color: var(--app-text-primary);
}

.mobile-me-item__desc {
  color: var(--app-text-secondary);
}

.mobile-me-item__icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 6px;
  color: #fff;
  background: var(--m-feature-color);
}

.mobile-me-item__icon :deep(svg) {
  width: 20px;
  height: 20px;
}
</style>
