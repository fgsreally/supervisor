<template>
  <div
    class="hidden md:flex w-16 flex-col items-center py-5 shrink-0 border-r"
    data-tour-sidebar
    style="background: var(--app-nav-bg); border-color: var(--app-nav-border)"
  >
    <div
      class="w-9 h-9 bg-[#07c160] rounded-md flex items-center justify-center text-white font-bold text-base shadow-sm mb-6"
    >
      Pi
    </div>

    <button
      v-for="item in navItems"
      :key="item.id"
      type="button"
      class="p-2.5 rounded-lg transition-colors mb-2"
      :class="tab === item.id ? 'nav-btn-active' : 'nav-btn'"
      :title="item.title"
      :data-tour-nav="item.id"
      @click="$emit('update:tab', item.id)"
    >
      <component :is="item.icon" class="w-[22px] h-[22px]" />
    </button>

    <div class="mt-auto flex flex-col items-center">
      <button
        type="button"
        class="tutorial-nav-btn p-2.5 rounded-lg transition-colors mb-2"
        title="使用教程"
        data-tour-tutorial
        @click="$emit('tutorial')"
      >
        <BookOpenCheck class="w-[22px] h-[22px]" />
      </button>
      <button
        type="button"
        class="p-2.5 rounded-lg transition-colors mb-2 nav-btn"
        :title="isDark ? '切换浅色模式' : '切换深色模式'"
        @click="toggleDark($event)"
      >
        <Sun v-if="isDark" class="w-[22px] h-[22px]" />
        <Moon v-else class="w-[22px] h-[22px]" />
      </button>
      <button
        type="button"
        class="p-2.5 rounded-lg transition-colors"
        :class="tab === 'settings' ? 'nav-btn-active' : 'nav-btn'"
        title="设置"
        data-tour-nav="settings"
        @click="$emit('update:tab', 'settings')"
      >
        <Settings class="w-[22px] h-[22px]" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Cloud,
  BookOpenCheck,
  FolderOpen,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Moon,
  Settings,
  Sun,
  Users,
} from "lucide-vue-next";
import { useAppTheme } from "../composables/use-app-theme";

const { isDark, toggleDark } = useAppTheme();

export type MainTab =
  | "chat"
  | "todo"
  | "dashboard"
  | "contacts"
  | "providers"
  | "resources"
  | "settings";

defineProps<{
  tab: MainTab;
}>();

defineEmits<{
  "update:tab": [tab: MainTab];
  tutorial: [];
}>();

const navItems = [
  { id: "chat" as const, icon: MessageSquare, title: "聊天" },
  { id: "todo" as const, icon: ListTodo, title: "Todo / 计划" },
  { id: "dashboard" as const, icon: LayoutDashboard, title: "工作概览" },
  { id: "contacts" as const, icon: Users, title: "智能代理" },
  { id: "providers" as const, icon: Cloud, title: "模型" },
  { id: "resources" as const, icon: FolderOpen, title: "资源" },
];
</script>

<style scoped>
.nav-btn {
  color: var(--app-nav-icon);
}

.nav-btn:hover {
  color: var(--app-text-primary);
  background: var(--app-nav-hover);
}

.nav-btn-active {
  color: var(--app-nav-icon-active);
  background: var(--app-nav-active-bg);
}
.tutorial-nav-btn {
  color: #3b82f6;
  background: transparent;
}
.tutorial-nav-btn:hover {
  color: #60a5fa;
  background: transparent;
}
</style>
