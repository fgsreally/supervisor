<template>
  <div class="mobile-app-shell">
    <main class="mobile-app-shell__content">
      <slot />
    </main>

    <nav v-if="showNav" class="mobile-tabbar" data-tour-tabbar :aria-label="t('mobile.mainNavigation')">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="mobile-tabbar__item"
        :class="{ 'mobile-tabbar__item--active': activeTab === item.id }"
        :aria-current="activeTab === item.id ? 'page' : undefined"
        :data-tour-nav="item.id"
        @click="onTabClick(item)"
      >
        <component :is="item.icon" class="mobile-tabbar__icon" />
        <span>{{ item.label }}</span>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Bot, CircleUserRound, ListTodo, MessageSquare } from "lucide-vue-next";
import type { MainTab } from "@/components/layout/ShellNav.vue";
import { useI18n } from "@/i18n";

export type MobilePrimaryTab = "chat" | "work" | "agents" | "me";

const props = defineProps<{
  tab: MainTab;
  showNav?: boolean;
}>();
const { t } = useI18n();

const emit = defineEmits<{
  navigate: [route: "/chat" | "/todo" | "/contacts" | "/settings", direction: "forward" | "back"];
}>();

const items = computed(() => [
  { id: "chat" as const, label: t("mobile.chat"), route: "/chat" as const, icon: MessageSquare },
  { id: "work" as const, label: t("mobile.work"), route: "/todo" as const, icon: ListTodo },
  { id: "agents" as const, label: t("mobile.agents"), route: "/contacts" as const, icon: Bot },
  { id: "me" as const, label: t("mobile.me"), route: "/settings" as const, icon: CircleUserRound },
]);

const activeTab = computed<MobilePrimaryTab>(() => {
  if (props.tab === "todo" || props.tab === "dashboard") return "work";
  if (props.tab === "contacts") return "agents";
  if (props.tab === "providers" || props.tab === "resources" || props.tab === "settings") {
    return "me";
  }
  return "chat";
});

function onTabClick(item: (typeof items.value)[number]) {
  const activeIndex = items.value.findIndex((entry) => entry.id === activeTab.value);
  const nextIndex = items.value.findIndex((entry) => entry.id === item.id);
  if (nextIndex === -1 || nextIndex === activeIndex) return;
  emit("navigate", item.route, nextIndex > activeIndex ? "forward" : "back");
}
</script>

<style scoped>
.mobile-app-shell {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--app-list-section-bg, var(--m-page-bg));
}

.mobile-app-shell__content {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.mobile-tabbar {
  z-index: 30;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  flex: 0 0 auto;
  padding-bottom: env(safe-area-inset-bottom);
  border-top: 1px solid var(--app-header-divider, var(--m-divider));
  background: color-mix(in srgb, var(--app-list-header-bg, var(--m-header-bg)) 94%, transparent);
  backdrop-filter: blur(18px);
}

.mobile-tabbar__item {
  display: flex;
  min-width: 0;
  min-height: 56px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 3px;
  color: var(--app-text-secondary, var(--m-text-secondary));
  font-size: var(--m-font-tabbar, 11px);
  line-height: 1;
  transition:
    color 140ms ease,
    background-color 140ms ease;
  -webkit-tap-highlight-color: transparent;
}

.mobile-tabbar__item:active {
  background: var(--m-pressed);
}

.mobile-tabbar__item--active {
  color: var(--m-accent);
}

.mobile-tabbar__icon {
  width: 22px;
  height: 22px;
}

@media (prefers-reduced-motion: reduce) {
  .mobile-tabbar__item {
    transition: none;
  }
}
</style>
