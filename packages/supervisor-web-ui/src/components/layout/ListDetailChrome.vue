<template>
  <div class="flex flex-1 min-w-0 min-h-0 overflow-hidden h-full">
    <div
      v-if="!isMobile || showList"
      class="relative shrink-0 h-full"
      :class="isMobile ? 'w-full min-w-0' : 'hidden md:block'"
      :style="isMobile ? undefined : { width: `${width}px` }"
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
import { useMobileViewport } from "@/composables/use-mobile-viewport";
import { useResizableWidth } from "@/composables/use-resizable-width";
import { useI18n } from "@/i18n";

defineProps<{ showList: boolean }>();

const { t } = useI18n();
const isMobile = useMobileViewport();
const { width, startResize } = useResizableWidth({
  defaultWidth: Math.min(360, Math.max(300, Math.round(window.innerWidth * 0.22))),
  minWidth: 260,
  maxWidth: Math.max(420, Math.round(window.innerWidth * 0.36)),
  storageKey: "pi-supervisor-chat-list-width-v4",
});
</script>
