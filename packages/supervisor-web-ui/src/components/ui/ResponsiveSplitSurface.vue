<template>
  <MobileDrawer
    :open="open && isMobile"
    :ariaLabel="ariaLabel"
    size="tall"
    :resizable="true"
    @close="emit('close')"
  >
    <slot :mobile="true" />
  </MobileDrawer>
  <Transition name="chat-panel" :duration="{ enter: 360, leave: 280 }">
    <div
      v-if="open && !isMobile"
      class="responsive-split chat-panel-host"
      :style="panelStyle"
    >
      <ResizeHandle
        orientation="vertical"
        :label="resizeLabel"
        @start="emit('resize-start', $event)"
      />
      <div class="responsive-split__body">
        <slot :mobile="false" />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { MobileDrawer } from "@/components/mobile/ui";
import ResizeHandle from "@/components/ResizeHandle.vue";
import { useMobileViewport } from "@/composables/use-mobile-viewport";

/**
 * Session content split surface (a):
 * - Desktop: resizable side split in the chat workspace
 * - Mobile: bottom drawer (tall / resizable)
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    ariaLabel: string;
    /** Desktop panel width in px (shared across session side surfaces). */
    width?: number;
    resizeLabel?: string;
  }>(),
  {
    width: 520,
    resizeLabel: "调整分屏宽度",
  },
);

const emit = defineEmits<{
  close: [];
  "resize-start": [event: PointerEvent];
}>();

const isMobile = useMobileViewport();

const panelStyle = computed(() => ({ width: `${props.width}px` }));
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
