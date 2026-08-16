<template>
  <div
    class="mobile-me"
    data-tour-page="me"
    style="background: var(--app-list-section-bg)"
  >
    <header class="mobile-me__header m-mobile-header">
      <span aria-hidden="true" />
      <h1 class="m-mobile-header__title">{{ t("mobile.me.title") }}</h1>
      <span aria-hidden="true" />
    </header>

    <div class="mobile-me__scroll custom-scrollbar">
      <template v-for="group in groups" :key="group.title">
        <div class="list-section-label">
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
          <div class="mobile-me-item__content">
            <div class="mobile-me-item__name">{{ item.label }}</div>
            <div class="mobile-me-item__desc">{{ item.description }}</div>
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
  Server,
  Settings,
  Sparkles,
  Sun,
} from "lucide-vue-next";
import { useAppTheme } from "@/composables/use-app-theme";
import { useAppFontScale, type AppFontScale } from "@/composables/use-app-font-scale";
import { isNativeApp } from "@/composables/use-native-app";
import { saveViewPreferences, viewPreferences } from "@/utils/view-preferences";
import { displayNameForUrl, getActiveSupervisorInstance } from "@/utils/mobile-server-config";
import { useI18n } from "@/i18n";

type ItemId =
  | "providers"
  | "resources"
  | "appearance"
  | "fontScale"
  | "advancedAnimations"
  | "server"
  | "settings"
  | "tutorial"
  | "diagnostics";

const showNativeServer = computed(() => isNativeApp());
const { t } = useI18n();
const activeServerLabel = computed(() => {
  const active = getActiveSupervisorInstance();
  if (!active) return t("mobile.me.serverHint");
  return active.name || displayNameForUrl(active.url);
});

const emit = defineEmits<{
  navigate: [route: string];
  tutorial: [];
  manageServers: [];
}>();

const { isDark, toggleDark } = useAppTheme();
const { fontScale, setFontScale } = useAppFontScale();

const appearanceDescription = computed(() =>
  isDark.value ? t("mobile.me.darkMode") : t("mobile.me.lightMode"),
);
const fontScaleDescription = computed(() => {
  if (fontScale.value === "small") return t("mobile.me.fontSmall");
  if (fontScale.value === "large") return t("mobile.me.fontLarge");
  return t("mobile.me.fontStandard");
});
const advancedAnimationsDescription = computed(() =>
  viewPreferences.advancedAnimations
    ? t("mobile.me.animationsOn")
    : t("mobile.me.animationsOff"),
);
const AppearanceIcon = computed(() => (isDark.value ? MoonStar : Sun));

const groups = computed(() => {
  const preferenceItems = [
    {
      id: "appearance" as const,
      label: t("mobile.me.appearance"),
      description: appearanceDescription.value,
      icon: AppearanceIcon.value,
      color: "#7b61c9",
    },
    {
      id: "fontScale" as const,
      label: t("mobile.me.fontSize"),
      description: fontScaleDescription.value,
      icon: BookOpenCheck,
      color: "#0ea5e9",
    },
    {
      id: "advancedAnimations" as const,
      label: t("mobile.me.advancedAnimations"),
      description: advancedAnimationsDescription.value,
      icon: Sparkles,
      color: "#f59e0b",
    },
    ...(showNativeServer.value
      ? [
          {
            id: "server" as const,
            label: t("mobile.me.server"),
            description: activeServerLabel.value,
            icon: Server,
            color: "#576b95",
          },
        ]
      : []),
    {
      id: "settings" as const,
      label: t("mobile.me.settings"),
      description: t("mobile.me.settingsDescription"),
      icon: Settings,
      color: "#3b82f6",
    },
  ];
  return [
    {
      title: t("mobile.me.capabilities"),
      items: [
        {
          id: "providers" as const,
          label: t("mobile.me.providers"),
          description: t("mobile.me.providersDescription"),
          icon: Cloud,
          color: "#576b95",
        },
        {
          id: "resources" as const,
          label: t("mobile.me.resources"),
          description: t("mobile.me.resourcesDescription"),
          icon: Boxes,
          color: "#07c160",
        },
      ],
    },
    {
      title: t("mobile.me.preferences"),
      items: preferenceItems,
    },
    {
      title: t("mobile.me.helpDiagnostics"),
      items: [
        {
          id: "tutorial" as const,
          label: t("mobile.me.tutorial"),
          description: t("mobile.me.tutorialDescription"),
          icon: BookOpenCheck,
          color: "#d97706",
        },
        {
          id: "diagnostics" as const,
          label: t("mobile.me.diagnostics"),
          description: t("mobile.me.diagnosticsDescription"),
          icon: FileSearch,
          color: "#8b8b8b",
        },
      ],
    },
  ];
});

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
  else if (id === "server") emit("manageServers");
  else if (id === "diagnostics") emit("navigate", "/settings/diagnostics");
  else emit("tutorial");
}
</script>

<style scoped>
.mobile-me {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  flex-shrink: 0;
  flex-direction: column;
}

.mobile-me__scroll {
  flex: 1;
  overflow-y: auto;
}

.mobile-me__header {
  flex-shrink: 0;
}

.list-section-label {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 0.375rem 1rem;
  background: var(--app-list-section-bg);
  color: var(--app-text-secondary);
  font-weight: var(--app-font-weight-semibold);
  letter-spacing: 0.04em;
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
  overflow: hidden;
  font-weight: var(--app-font-weight-medium);
  color: var(--app-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-me-item__desc {
  margin-top: 0.125rem;
  overflow: hidden;
  color: var(--app-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-me-item__content {
  flex: 1;
  min-width: 0;
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
