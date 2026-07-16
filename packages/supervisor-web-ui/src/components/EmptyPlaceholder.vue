<template>
  <div
    class="flex-1 flex min-w-0 basis-0 h-full w-full items-center justify-center overflow-hidden"
    style="background: var(--app-settings-bg)"
  >
    <div class="text-center px-8">
      <div
        class="w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-4"
        style="background: var(--app-list-search-bg)"
      >
        <component :is="icon" class="w-10 h-10" style="color: var(--app-text-muted)" />
      </div>
      <h2 class="text-xl font-medium" style="color: var(--app-text-primary)">{{ title }}</h2>
      <p class="mt-2 text-sm max-w-xs" style="color: var(--app-text-secondary)">{{ subtitle }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Cloud, FolderOpen, MessageSquare, User } from "lucide-vue-next";
import type { MainTab } from "./ShellNav.vue";

const props = defineProps<{
  tab: MainTab;
}>();

const icon = computed(() => {
  if (props.tab === "contacts") return User;
  if (props.tab === "providers") return Cloud;
  if (props.tab === "resources") return FolderOpen;
  return MessageSquare;
});

const title = computed(() => {
  switch (props.tab) {
    case "contacts":
      return "选择一个智能代理";
    case "providers":
      return "选择一个模型服务";
    case "resources":
      return "选择资源";
    default:
      return "Pi Supervisor";
  }
});

const subtitle = computed(() => {
  switch (props.tab) {
    case "contacts":
      return "配置智能代理：模型、工具集与关联资源";
    case "providers":
      return "管理 LLM 模型服务与可用模型列表";
    case "resources":
      return "浏览全局资源库；通过符号链接关联到各智能代理";
    default:
      return "从左侧选择会话开始";
  }
});
</script>
