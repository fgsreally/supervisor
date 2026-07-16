<template>
  <div
    class="flex-1 flex min-w-0 basis-0 h-full w-full items-center justify-center bg-[#f5f5f5] overflow-hidden"
  >
    <div class="text-center px-8">
      <div
        class="w-24 h-24 mx-auto bg-[#e6e6e6] rounded-full flex items-center justify-center mb-4"
      >
        <component :is="icon" class="w-10 h-10 text-gray-400" />
      </div>
      <h2 class="text-xl font-medium text-gray-700">{{ title }}</h2>
      <p class="text-gray-500 mt-2 text-sm max-w-xs">{{ subtitle }}</p>
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
      return "选择一个 Agent";
    case "providers":
      return "选择一个 Provider";
    case "resources":
      return "选择资源";
    default:
      return "Pi Supervisor";
  }
});

const subtitle = computed(() => {
  switch (props.tab) {
    case "contacts":
      return "展示 Agent 模板：模型、工具集与绑定资源";
    case "providers":
      return "查看 LLM Provider 配置、模型列表与绑定的 Agent";
    case "resources":
      return "浏览全局与 Agent 目录下的 skills、extensions、prompts";
    default:
      return "从左侧选择会话开始";
  }
});
</script>
