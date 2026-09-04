<template>
  <div class="session-preview-panel">
    <header v-if="showHeader && !embedded" class="session-preview-panel__header">
      <div class="session-preview-panel__title">{{ resolvedTitle }}</div>
      <button
        v-if="showClose"
        type="button"
        class="session-preview-panel__close"
        :title="t('session.preview.close')"
        @click="emit('close')"
      >
        <X class="h-4 w-4" />
      </button>
    </header>

    <div v-if="loading" class="session-preview-panel__state">
      {{ t("session.preview.loading") }}
    </div>
    <div v-else-if="previews.length === 0" class="session-preview-panel__state">
      {{ t("session.preview.empty") }}
    </div>
    <template v-else>
      <div v-if="previews.length > 1" class="session-preview-panel__tabs">
        <button
          v-for="preview in previews"
          :key="previewKey(preview)"
          type="button"
          class="session-preview-panel__tab"
          :class="{ 'session-preview-panel__tab--active': activeKey === previewKey(preview) }"
          @click="selectPreview(preview)"
        >
          {{ preview.label ?? preview.name }}
        </button>
      </div>
      <div class="session-preview-panel__body">
        <iframe
          v-for="preview in previews"
          v-show="activeKey === previewKey(preview)"
          :key="previewKey(preview)"
          class="session-preview-panel__frame"
          :src="preview.previewUrl"
          :title="preview.label ?? preview.name"
          @load="markLoaded(preview.previewUrl)"
        />
        <div v-if="activePreviewLoading" class="session-preview-panel__loading">
          <Loader2 class="session-preview-panel__spinner" />
          <span>{{ t("session.preview.loading") }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Loader2, X } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import type { SessionServicesPreview } from "@/utils/session-services";

const props = withDefaults(
  defineProps<{
    previews: SessionServicesPreview[];
    loading?: boolean;
    title?: string;
    showHeader?: boolean;
    showClose?: boolean;
    embedded?: boolean;
    modelValue?: string;
  }>(),
  {
    loading: false,
    showHeader: true,
    showClose: false,
    embedded: false,
  },
);

const emit = defineEmits<{
  close: [];
  "update:modelValue": [value: string];
}>();
const { t } = useI18n();
const resolvedTitle = computed(() => props.title ?? t("session.preview.title"));

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

const showHeader = computed(() => props.showHeader);

function selectPreview(preview: SessionServicesPreview) {
  const key = previewKey(preview);
  activeKey.value = key;
  emit("update:modelValue", key);
}

function markLoaded(url: string) {
  loadedUrls.value = new Set([...loadedUrls.value, url]);
}
</script>

<style scoped>
.session-preview-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 240px;
  background: var(--app-chat-bg);
}

.session-preview-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.session-preview-panel__title {
  font-size: var(--app-font-body);
  font-weight: var(--app-font-weight-medium);
  color: var(--app-text-primary);
}

.session-preview-panel__close {
  padding: 4px;
  border-radius: 6px;
  color: var(--app-text-muted);
}

.session-preview-panel__close:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.session-preview-panel__tabs {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--app-border-subtle);
  overflow-x: auto;
}

.session-preview-panel__tab {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: var(--app-font-caption);
  white-space: nowrap;
  color: var(--app-text-secondary);
  background: var(--app-list-search-bg);
}

.session-preview-panel__tab--active {
  color: var(--app-text-primary);
  background: var(--app-list-item-active);
}

.session-preview-panel__body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.session-preview-panel__frame {
  position: absolute;
  inset: 0;
  height: 100%;
  width: 100%;
  border: 0;
  background: #fff;
}

.session-preview-panel__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--app-text-secondary);
  background: var(--app-chat-bg);
  font-size: var(--app-font-body);
}

.session-preview-panel__spinner {
  width: 18px;
  height: 18px;
  animation: session-preview-spin 0.8s linear infinite;
}

@keyframes session-preview-spin {
  to {
    transform: rotate(360deg);
  }
}

.session-preview-panel__state {
  padding: 24px 16px;
  color: var(--app-text-secondary);
  font-size: var(--app-font-control);
}
</style>
