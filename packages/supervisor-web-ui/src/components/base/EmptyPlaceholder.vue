<template>
  <div class="empty-placeholder" style="background: var(--app-settings-bg)">
    <div class="empty-placeholder__content">
      <div class="empty-placeholder__icon-wrap" style="background: var(--app-list-search-bg)">
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
import { useI18n } from "@/i18n";

const props = defineProps<{ tab: MainTab }>();
const { t } = useI18n();

const icon = computed(() => {
  if (props.tab === "contacts") return User;
  if (props.tab === "providers") return Cloud;
  if (props.tab === "resources") return FolderOpen;
  return MessageSquare;
});

const title = computed(() => {
  if (props.tab === "contacts") return t("empty.contacts.title");
  if (props.tab === "providers") return t("empty.providers.title");
  if (props.tab === "resources") return t("empty.resources.title");
  return "Pi Supervisor";
});

const subtitle = computed(() => {
  if (props.tab === "contacts") return t("empty.contacts.subtitle");
  if (props.tab === "providers") return t("empty.providers.subtitle");
  if (props.tab === "resources") return t("empty.resources.subtitle");
  return t("empty.sessions.subtitle");
});
</script>

<style scoped>
.empty-placeholder { display: flex; width: 100%; height: 100%; min-width: 0; flex: 1 1 0; align-items: center; justify-content: center; overflow: hidden; }
.empty-placeholder__content { padding: 0 var(--app-space-8); text-align: center; }
.empty-placeholder__icon-wrap { display: flex; width: 6rem; height: 6rem; align-items: center; justify-content: center; margin: 0 auto var(--app-space-4); border-radius: var(--app-radius-pill); }
.empty-placeholder__icon { width: 2.5rem; height: 2.5rem; }
.empty-placeholder__title { font-size: var(--app-font-title); font-weight: var(--app-font-weight-medium); }
.empty-placeholder__subtitle { max-width: 16rem; margin-top: var(--app-space-2); font-size: var(--app-font-body); }
</style>
