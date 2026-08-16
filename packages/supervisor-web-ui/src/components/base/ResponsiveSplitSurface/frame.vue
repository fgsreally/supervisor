<template>
  <SheetDrawer
    :open="open && isMobile"
    :ariaLabel="ariaLabel"
    size="tall"
    :resizable="true"
    @close="emit('close')"
  >
    <slot :mobile="true" />
  </SheetDrawer>
  <Transition name="chat-panel" :duration="{ enter: 360, leave: 280 }">
    <div
      v-if="open && !isMobile"
      class="responsive-split chat-panel-host"
      :class="{ 'responsive-split--tabs': showTabs }"
      :style="panelStyle"
    >
      <ResizeHandle
        orientation="vertical"
        :label="resizeLabel"
        @start="emit('resize-start', $event)"
      />
      <div class="responsive-split__body">
        <template v-if="showTabs">
          <div class="responsive-split__tabs" role="tablist">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              role="tab"
              class="responsive-split__tab"
              :class="{ 'responsive-split__tab--active': tab.id === activeTabId }"
              :aria-selected="tab.id === activeTabId"
              :title="tab.title"
              @click="selectTab(tab.id)"
            >
              <span class="responsive-split__tab-title">{{ tab.title }}</span>
              <span
                v-if="tab.closable !== false"
                class="responsive-split__tab-close"
                :title="t('common.close')"
                @click.stop="closeTab(tab.id)"
              >
                <X class="responsive-split__tab-close-icon" />
              </span>
            </button>
          </div>
          <div class="responsive-split__content">
            <slot :mobile="false" />
          </div>
        </template>
        <slot v-else :mobile="false" />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { X } from "lucide-vue-next";
import SheetDrawer from "@/components/base/SheetDrawer.vue";
import ResizeHandle from "@/components/base/ResizeHandle.vue";
import { useMobileViewport } from "@/composables/use-mobile-viewport";
import { useI18n } from "@/i18n";

export type SplitSurfaceTab = {
  id: string;
  title: string;
  closable?: boolean;
};

export interface ResponsiveSplitSurfaceProps {
  open: boolean;
  ariaLabel: string;
  width?: number;
  resizeLabel?: string;
  tabs?: SplitSurfaceTab[];
  activeTabId?: string | null;
  platform?: "auto" | "pc" | "mobile";
}

/**
 * Session content split surface (a):
 * - Desktop: resizable side split in the chat workspace
 * - Mobile: bottom drawer (tall / resizable)
 * - Optional PC tabs: browser-like tab bar (ignored on mobile)
 */
const props = withDefaults(defineProps<ResponsiveSplitSurfaceProps>(), {
  width: 520,
  tabs: undefined,
  activeTabId: null,
  platform: "auto",
});

const { t } = useI18n();
const resizeLabel = computed(() => props.resizeLabel ?? t("common.resizePanel"));

const emit = defineEmits<{
  close: [];
  "resize-start": [event: PointerEvent];
  "update:activeTabId": [id: string];
  "close-tab": [id: string];
}>();

const viewportIsMobile = useMobileViewport();
const isMobile = computed(
  () => props.platform === "mobile" || (props.platform !== "pc" && viewportIsMobile.value),
);

const showTabs = computed(() => Boolean(props.tabs?.length));
const panelStyle = computed(() => ({ width: `${props.width}px` }));

function selectTab(id: string) {
  if (id === props.activeTabId) return;
  emit("update:activeTabId", id);
}

function closeTab(id: string) {
  emit("close-tab", id);
}
</script>

<style scoped>
.responsive-split {
  position: relative;
  display: flex;
  min-width: 320px;
  max-width: min(72vw, 960px);
  flex: none;
}

.responsive-split > :deep(.resize-handle--vertical) {
  right: auto;
  left: 0;
  transform: translateX(-50%);
}

.responsive-split__body {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
}

.responsive-split--tabs .responsive-split__body {
  flex-direction: column;
  border-left: 1px solid var(--app-border-subtle);
  background: var(--app-settings-bg);
}

.responsive-split__tabs {
  display: flex;
  flex: none;
  min-width: 0;
  align-items: stretch;
  overflow-x: auto;
  border-bottom: 1px solid var(--app-border-subtle);
  background: var(--app-settings-bg);
  scrollbar-width: thin;
}

.responsive-split__tab {
  display: inline-flex;
  max-width: 180px;
  min-width: 72px;
  flex: none;
  align-items: center;
  gap: var(--app-space-1);
  padding: var(--app-space-2) var(--app-space-2) var(--app-space-2) var(--app-space-3);
  border-right: 1px solid var(--app-border-subtle);
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
  line-height: 1.2;
  background: transparent;
  cursor: pointer;
}

.responsive-split__tab:hover {
  color: var(--app-text-primary);
  background: var(--app-hover);
}

.responsive-split__tab--active {
  color: var(--app-text-primary);
  background: color-mix(in srgb, var(--app-accent) 12%, var(--app-settings-bg));
  box-shadow: inset 0 -2px 0 var(--app-accent);
}

.responsive-split__tab-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.responsive-split__tab-close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--app-radius-control);
  color: var(--app-text-muted);
}

.responsive-split__tab-close:hover {
  color: var(--app-text-primary);
  background: var(--app-hover);
}

.responsive-split__tab-close-icon {
  width: 12px;
  height: 12px;
}

.responsive-split__content {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
}

.responsive-split__body > :deep(.tool-detail-panel),
.responsive-split__body > :deep(.task-workspace),
.responsive-split__body > :deep(.btw-panel),
.responsive-split__body > :deep(.session-log-panel),
.responsive-split__body > :deep(.session-files-panel),
.responsive-split__body > :deep(.session-preview-panel),
.responsive-split__body > :deep(.chat-panel-host__body) {
  width: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
  flex: 1 1 auto !important;
  border-left: 1px solid var(--app-border-subtle);
}

.responsive-split__content > :deep(.tool-detail-panel),
.responsive-split__content > :deep(.session-log-panel),
.responsive-split__content > :deep(.session-file-preview-pane),
.responsive-split__content > :deep(.chat-panel-host__body) {
  width: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
  flex: 1 1 auto !important;
}

.responsive-split--tabs .responsive-split__content > :deep(.tool-detail-panel),
.responsive-split--tabs .responsive-split__content > :deep(.session-log-panel),
.responsive-split--tabs .responsive-split__content > :deep(.session-file-preview-pane),
.responsive-split--tabs .responsive-split__content > :deep(.chat-panel-host__body) {
  border-left: 0 !important;
}

@media (max-width: 767px) {
  .responsive-split {
    width: 100% !important;
    min-width: 0;
    max-width: none;
  }

  .responsive-split > :deep(.resize-handle--vertical) {
    display: none;
  }
}
</style>
