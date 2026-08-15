<template>
  <div
    class="empty-placeholder"
    style="background: var(--app-settings-bg)"
  >
    <div class="empty-placeholder__content">
      <div
        class="empty-placeholder__icon-wrap"
        style="background: var(--app-list-search-bg)"
      >
        <component :is="icon" class="empty-placeholder__icon" style="color: var(--app-text-muted)" />
      </div>
      <h2 class="empty-placeholder__title" style="color: var(--app-text-primary)">{{ title }}</h2>
      <p class="empty-placeholder__subtitle" style="color: var(--app-text-secondary)">{{ subtitle }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Cloud, FolderOpen, MessageSquare, User } from "lucide-vue-next";
import type { MainTab } from "@/components/layout/ShellNav.vue";

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

<style scoped>
.empty-placeholder {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.empty-placeholder__content {
  padding: 0 var(--app-space-8);
  text-align: center;
}

.empty-placeholder__icon-wrap {
  display: flex;
  width: 6rem;
  height: 6rem;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--app-space-4);
  border-radius: var(--app-radius-pill);
}

.empty-placeholder__icon {
  width: 2.5rem;
  height: 2.5rem;
}

.empty-placeholder__title {
  font-size: var(--app-font-title);
  font-weight: var(--app-font-weight-medium);
}

.empty-placeholder__subtitle {
  max-width: 16rem;
  margin-top: var(--app-space-2);
  font-size: var(--app-font-body);
}
</style>
