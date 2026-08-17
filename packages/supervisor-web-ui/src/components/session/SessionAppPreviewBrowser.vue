<template>
  <div
    v-if="open"
    class="session-app-preview-browser"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
  >
    <header class="session-app-preview-browser__header">
      <button
        type="button"
        class="session-app-preview-browser__back"
        :title="t('session.preview.backToSession')"
        :aria-label="t('session.preview.backToSession')"
        @click="emit('close')"
      >
        <ChevronLeft class="h-5 w-5" />
      </button>
      <div class="session-app-preview-browser__title">{{ currentTitle }}</div>
      <div v-if="previews.length > 1" class="session-app-preview-browser__meta">
        {{ currentIndex + 1 }}/{{ previews.length }}
      </div>
    </header>

    <div v-if="loading" class="session-app-preview-browser__state">
      {{ t("session.preview.loading") }}
    </div>
    <div v-else-if="previews.length === 0" class="session-app-preview-browser__state">
      {{ t("session.preview.empty") }}
    </div>
    <div v-else class="session-app-preview-browser__body">
      <iframe
        v-for="preview in previews"
        v-show="activeKey === previewKey(preview)"
        :key="previewKey(preview)"
        class="session-app-preview-browser__frame"
        :src="preview.previewUrl"
        :title="preview.label ?? preview.name"
        @load="markLoaded(preview.previewUrl)"
      />
      <div v-if="activePreviewLoading" class="session-app-preview-browser__loading">
        <Loader2 class="session-app-preview-browser__spinner" />
        <span>{{ t("session.preview.loading") }}</span>
      </div>
      <!-- Edge strips capture swipes; iframe otherwise swallows touch events -->
      <div class="session-app-preview-browser__edge session-app-preview-browser__edge--left" />
      <div
        v-if="previews.length > 1"
        class="session-app-preview-browser__edge session-app-preview-browser__edge--top"
      />
      <div
        v-if="previews.length > 1"
        class="session-app-preview-browser__edge session-app-preview-browser__edge--bottom"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronLeft, Loader2 } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import type { SessionServicesPreview } from "@/utils/session-services";

const props = withDefaults(
  defineProps<{
    open: boolean;
    previews: SessionServicesPreview[];
    loading?: boolean;
    modelValue?: string;
  }>(),
  {
    loading: false,
  },
);

const emit = defineEmits<{
  close: [];
  "update:modelValue": [value: string];
}>();
const { t } = useI18n();

function previewKey(preview: SessionServicesPreview): string {
  return `${preview.name}:${preview.port}`;
}

const activeKey = ref(props.modelValue || (props.previews[0] ? previewKey(props.previews[0]) : ""));
const loadedUrls = ref(new Set<string>());
const activePreviewLoading = computed(() => {
  const preview = props.previews.find((item) => previewKey(item) === activeKey.value);
  return !!preview && !loadedUrls.value.has(preview.previewUrl);
});

watch(
  () => props.previews,
  (next) => {
    if (!next.some((item) => previewKey(item) === activeKey.value)) {
      activeKey.value = next[0] ? previewKey(next[0]) : "";
      if (activeKey.value) emit("update:modelValue", activeKey.value);
    }
  },
  { deep: true },
);

watch(
  () => props.modelValue,
  (value) => {
    if (value && value !== activeKey.value) activeKey.value = value;
  },
);

const currentIndex = computed(() =>
  props.previews.findIndex((item) => previewKey(item) === activeKey.value),
);

const currentTitle = computed(() => {
  const preview = props.previews[currentIndex.value];
  if (!preview) return t("session.preview.appTitle");
  return preview.label ?? preview.name;
});

function selectByIndex(index: number) {
  const preview = props.previews[index];
  if (!preview) return;
  const key = previewKey(preview);
  activeKey.value = key;
  emit("update:modelValue", key);
}

function markLoaded(url: string) {
  loadedUrls.value = new Set([...loadedUrls.value, url]);
}

function switchByDelta(delta: number) {
  if (props.previews.length <= 1) return;
  const idx = currentIndex.value;
  if (idx < 0) {
    selectByIndex(0);
    return;
  }
  const next = (idx + delta + props.previews.length) % props.previews.length;
  selectByIndex(next);
}

type TouchState = {
  x: number;
  y: number;
  moved: boolean;
};

const touch = ref<TouchState | null>(null);
const SWIPE_MIN = 56;
const AXIS_RATIO = 1.35;

function onTouchStart(event: TouchEvent) {
  const t = event.touches[0];
  if (!t) return;
  touch.value = { x: t.clientX, y: t.clientY, moved: false };
}

function onTouchMove(event: TouchEvent) {
  if (!touch.value) return;
  const t = event.touches[0];
  if (!t) return;
  const dx = t.clientX - touch.value.x;
  const dy = t.clientY - touch.value.y;
  if (Math.abs(dx) > 8 || Math.abs(dy) > 8) touch.value.moved = true;
}

function onTouchEnd(event: TouchEvent) {
  const start = touch.value;
  touch.value = null;
  if (!start?.moved) return;
  const t = event.changedTouches[0];
  if (!t) return;
  const dx = t.clientX - start.x;
  const dy = t.clientY - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX >= SWIPE_MIN && absX > absY * AXIS_RATIO) {
    // 左滑关闭，回会话
    if (dx < 0) emit("close");
    return;
  }

  if (absY >= SWIPE_MIN && absY > absX * AXIS_RATIO) {
    // 上滑 → 下一个；下滑 → 上一个
    if (dy < 0) switchByDelta(1);
    else switchByDelta(-1);
  }
}
</script>

<style scoped>
.session-app-preview-browser {
  position: absolute;
  inset: 0;
  z-index: 35;
  display: flex;
  flex-direction: column;
  background: var(--app-chat-bg);
  touch-action: pan-y;
}

.session-app-preview-browser__header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 10px;
  border-bottom: 1px solid var(--app-border-subtle);
  background: var(--app-chat-header-bg, var(--app-chat-bg));
  flex-shrink: 0;
}

.session-app-preview-browser__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: var(--app-text-secondary);
}

.session-app-preview-browser__back:active {
  background: var(--app-hover);
}

.session-app-preview-browser__title {
  flex: 1;
  min-width: 0;
  font-size: var(--app-font-body-strong);
  font-weight: var(--app-font-weight-semibold);
  color: var(--app-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-app-preview-browser__meta {
  font-size: var(--app-font-caption);
  color: var(--app-text-muted);
  flex-shrink: 0;
}

.session-app-preview-browser__body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.session-app-preview-browser__frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}

.session-app-preview-browser__loading {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--app-text-secondary);
  background: var(--app-chat-bg);
  font-size: var(--app-font-body);
}

.session-app-preview-browser__spinner {
  width: 18px;
  height: 18px;
  animation: session-app-preview-spin 0.8s linear infinite;
}

@keyframes session-app-preview-spin {
  to {
    transform: rotate(360deg);
  }
}

.session-app-preview-browser__edge {
  position: absolute;
  z-index: 2;
  touch-action: none;
}

.session-app-preview-browser__edge--left {
  top: 0;
  left: 0;
  bottom: 0;
  width: 28px;
}

.session-app-preview-browser__edge--top {
  top: 0;
  left: 28px;
  right: 0;
  height: 28px;
}

.session-app-preview-browser__edge--bottom {
  bottom: 0;
  left: 28px;
  right: 0;
  height: 28px;
}

.session-app-preview-browser__state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--app-text-secondary);
  font-size: var(--app-font-control);
}
</style>
