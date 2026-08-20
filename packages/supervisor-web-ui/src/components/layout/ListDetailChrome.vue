<template>
  <div
    class="list-detail-chrome flex flex-1 min-w-0 min-h-0 overflow-hidden h-full"
    :class="{
      'list-detail-chrome--foldable': foldable,
      'list-detail-chrome--foldable-list-hidden': foldable && !foldableListVisible,
    }"
  >
    <div
      v-if="!isMobile"
      class="list-detail-chrome__list relative shrink-0 h-full"
      :class="foldable ? 'min-w-0' : 'hidden md:block'"
      :style="foldable ? { width: foldableListVisible ? '50%' : '0px' } : { width: `${width}px` }"
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
      class="flex flex-1 flex-col min-w-0 basis-0 h-full overflow-hidden"
      style="background: var(--app-chat-bg)"
    >
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { toRefs } from "vue";
import { useMobileViewport } from "@/composables/use-mobile-viewport";
import { useResizableWidth } from "@/composables/use-resizable-width";
import { useI18n } from "@/i18n";

const props = withDefaults(
  defineProps<{
    showList: boolean;
    foldable?: boolean;
    foldableListVisible?: boolean;
  }>(),
  { foldable: false, foldableListVisible: true },
);

const { t } = useI18n();
const isMobile = useMobileViewport();
const { width, startResize } = useResizableWidth({
  defaultWidth: Math.min(360, Math.max(300, Math.round(window.innerWidth * 0.22))),
  minWidth: 260,
  maxWidth: Math.max(420, Math.round(window.innerWidth * 0.36)),
  storageKey: "pi-supervisor-chat-list-width-v4",
});

const { foldable, foldableListVisible } = toRefs(props);
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

.list-detail-chrome--foldable > main {
  transition: flex-basis 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
</style>
