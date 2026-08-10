<template>
  <div class="mobile-me">
    <header class="mobile-me__header">
      <div>
        <h1>我的</h1>
        <p>能力、偏好与系统服务</p>
      </div>
    </header>

    <div class="mobile-me__scroll">
      <MobileSection v-for="group in groups" :key="group.title" :title="group.title">
        <MobileListRow
          v-for="item in group.items"
          :key="item.id"
          :title="item.label"
          :description="item.description"
          :chevron="true"
          @click="open(item.id)"
        >
          <template #icon>
            <span class="mobile-me__icon" :style="{ '--m-feature-color': item.color }">
              <component :is="item.icon" />
            </span>
          </template>
        </MobileListRow>
      </MobileSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BookOpenCheck, Boxes, Cloud, FileSearch, MoonStar, Settings } from "lucide-vue-next";
import { MobileListRow, MobileSection } from "./ui";

type ItemId = "providers" | "resources" | "appearance" | "settings" | "tutorial" | "diagnostics";

const emit = defineEmits<{
  navigate: [route: string];
  tutorial: [];
}>();

const groups = [
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
        description: "切换亮色或暗色显示",
        icon: MoonStar,
        color: "#7b61c9",
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
];

function open(id: ItemId) {
  if (id === "providers") emit("navigate", "/providers");
  else if (id === "resources") emit("navigate", "/resources");
  else if (id === "appearance") emit("navigate", "/settings/services");
  else if (id === "settings") emit("navigate", "/settings/services");
  else if (id === "diagnostics") emit("navigate", "/settings/diagnostics");
  else emit("tutorial");
}
</script>

<style scoped>
.mobile-me {
  display: flex;
  width: 100%;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--m-page-bg);
  color: var(--m-text-primary);
}

.mobile-me__header {
  padding: calc(var(--m-space-5) + env(safe-area-inset-top)) var(--m-space-5) 18px;
  background: var(--m-header-bg);
}

.mobile-me__header h1 {
  font-size: var(--m-font-page-title);
  font-weight: var(--m-font-page-title-weight);
}

.mobile-me__header p {
  margin-top: 4px;
  color: var(--m-text-secondary);
  font-size: 13px;
}

.mobile-me__scroll {
  flex: 1;
  overflow-y: auto;
  padding: 10px var(--m-page-inline) var(--m-space-6);
}

.mobile-me__icon {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  border-radius: inherit;
  color: var(--m-feature-color);
  background: color-mix(in srgb, var(--m-feature-color) 13%, transparent);
}

.mobile-me__icon :deep(svg) {
  width: 20px;
  height: 20px;
}
</style>
