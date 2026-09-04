<template>
  <div
    class="shell-nav"
    data-tour-sidebar
    style="background: var(--app-nav-bg); border-color: var(--app-nav-border)"
  >
    <div
      class="shell-nav__brand"
    >
      Pi
    </div>

    <button
      v-for="item in navItems"
      :key="item.id"
      type="button"
      class="shell-nav__button"
      :class="tab === item.id ? 'nav-btn-active' : 'nav-btn'"
      :title="item.title"
      :data-tour-nav="item.id"
      @click="$emit('update:tab', item.id)"
    >
      <component :is="item.icon" class="shell-nav__icon" />
    </button>

    <div class="shell-nav__footer">
      <button
        type="button"
        class="shell-nav__button tutorial-nav-btn"
        :title="t('nav.tutorial')"
        data-tour-tutorial
        @click="$emit('tutorial')"
      >
        <BookOpenCheck class="shell-nav__icon" />
      </button>
      <button
        type="button"
        class="shell-nav__button nav-btn"
        :title="isDark ? t('nav.lightMode') : t('nav.darkMode')"
        @click="toggleDark($event)"
      >
        <Sun v-if="isDark" class="shell-nav__icon" />
        <Moon v-else class="shell-nav__icon" />
      </button>
      <button
        type="button"
        class="shell-nav__button"
        :class="tab === 'settings' ? 'nav-btn-active' : 'nav-btn'"
        :title="t('nav.settings')"
        data-tour-nav="settings"
        @click="$emit('update:tab', 'settings')"
      >
        <Settings class="shell-nav__icon" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  BookOpenCheck,
  Cloud,
  FolderOpen,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Moon,
  Settings,
  Sun,
  Users,
} from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "@/i18n";
import { useAppTheme } from "@/composables/use-app-theme";

const { isDark, toggleDark } = useAppTheme();
const { t } = useI18n();

export type MainTab =
  | "chat"
  | "todo"
  | "dashboard"
  | "contacts"
  | "providers"
  | "resources"
  | "settings";

defineProps<{ tab: MainTab }>();

defineEmits<{
  "update:tab": [tab: MainTab];
  tutorial: [];
}>();

const navItems = computed(() => [
  { id: "chat" as const, icon: MessageSquare, title: t("nav.chat") },
  { id: "todo" as const, icon: ListTodo, title: t("nav.todo") },
  { id: "dashboard" as const, icon: LayoutDashboard, title: t("nav.dashboard") },
  { id: "contacts" as const, icon: Users, title: t("nav.contacts") },
  { id: "providers" as const, icon: Cloud, title: t("nav.providers") },
  { id: "resources" as const, icon: FolderOpen, title: t("nav.resources") },
]);
</script>

<style scoped>
.shell-nav {
  display: none;
}

@media (min-width: 768px) {
  .shell-nav {
    display: flex;
    width: 4rem;
    flex-shrink: 0;
    flex-direction: column;
    align-items: center;
    padding: 1.25rem 0;
    border-right: 1px solid var(--app-nav-border);
  }
}

.shell-nav__brand {
  display: flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
  border-radius: var(--app-radius-control);
  color: #fff;
  background: #07c160;
  box-shadow: var(--app-shadow-control);
  font-size: var(--app-font-body-strong);
  font-weight: var(--app-font-weight-bold);
}

.shell-nav__button {
  display: inline-flex;
  width: 2.75rem;
  height: 2.75rem;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--app-space-2);
  padding: 0;
  border-radius: var(--app-radius-control);
  transition: background-color var(--app-motion-fast), color var(--app-motion-fast);
}

.shell-nav__icon {
  width: 1.375rem;
  height: 1.375rem;
}

.shell-nav__footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: auto;
}

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
