<template>
  <div
    class="list-detail-chrome relative flex flex-1 min-w-0 min-h-0 overflow-hidden h-full"
    :class="{
      'list-detail-chrome--foldable': foldable,
      'list-detail-chrome--foldable-list-hidden': foldable && !foldableListVisible,
      'list-detail-chrome--collapsible': collapsible,
      'list-detail-chrome--list-hidden': collapsible && !listVisible,
    }"
  >
    <button
      v-if="!isMobile && collapsible && !listVisible"
      type="button"
      class="list-detail-chrome__expand-list"
      :title="t('common.expand')"
      :aria-label="t('common.expand')"
      @click="emit('toggle-list')"
    >
      <PanelLeftOpen class="h-4 w-4" />
    </button>
    <div
      v-if="!isMobile"
      class="list-detail-chrome__list relative shrink-0 h-full"
      :class="foldable || collapsible ? 'min-w-0' : 'hidden md:block'"
      :style="
        foldable
          ? { width: foldableListVisible ? '50%' : '0px' }
          : { width: collapsible && !listVisible ? '0px' : `${width}px` }
      "
    >
      <slot name="list" />
      <ResizeHandle
        v-if="!isMobile"
        orientation="vertical"
        :label="t('common.resizePanel')"
        @start="startResize"
      />
    </div>
    <main
      v-if="!isMobile || !showList"
      class="relative flex flex-1 flex-col min-w-0 basis-0 h-full overflow-hidden"
      style="background: var(--app-chat-bg)"
    >
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { toRefs } from "vue";
import { PanelLeftOpen } from "lucide-vue-next";
import { useMobileViewport } from "@/composables/use-mobile-viewport";
import { useResizableWidth } from "@/composables/use-resizable-width";
import { useI18n } from "@/i18n";

const props = withDefaults(
  defineProps<{
    showList: boolean;
    foldable?: boolean;
    foldableListVisible?: boolean;
    collapsible?: boolean;
    listVisible?: boolean;
  }>(),
  { foldable: false, foldableListVisible: true, collapsible: false, listVisible: true },
);

const { t } = useI18n();
const emit = defineEmits<{ "toggle-list": [] }>();
const isMobile = useMobileViewport();
const { width, startResize } = useResizableWidth({
  defaultWidth: Math.min(360, Math.max(300, Math.round(window.innerWidth * 0.22))),
  minWidth: 260,
  maxWidth: Math.max(420, Math.round(window.innerWidth * 0.36)),
  storageKey: "wecode-chat-list-width-v4",
});

const { foldable, foldableListVisible, collapsible, listVisible } = toRefs(props);
</script>

<style scoped>
.list-detail-chrome__list {
  overflow: hidden;
  transition:
    width 280ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease;
}

.list-detail-chrome--foldable-list-hidden .list-detail-chrome__list {
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
}

.list-detail-chrome--collapsible .list-detail-chrome__list {
  transition:
    width 280ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease;
}

.list-detail-chrome--list-hidden .list-detail-chrome__list {
  opacity: 0;
  pointer-events: none;
}

.list-detail-chrome__expand-list {
  position: absolute;
  z-index: 100;
  top: 1rem;
  left: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--app-border-subtle);
  border-radius: var(--app-radius-control);
  color: var(--app-text-secondary);
  background: var(--app-popup-bg);
  box-shadow: 0 0.35rem 1rem rgb(0 0 0 / 18%);
  cursor: pointer;
}

.list-detail-chrome__expand-list:hover,
.list-detail-chrome__expand-list:focus-visible {
  color: var(--app-accent);
  outline: none;
}

.list-detail-chrome--foldable > main {
  transition: flex-basis 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
</style>
