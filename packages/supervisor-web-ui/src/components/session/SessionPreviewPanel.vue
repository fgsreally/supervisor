<template>
  <div class="session-preview-panel">
    <header v-if="showHeader && !embedded" class="session-preview-panel__header">
      <div class="session-preview-panel__title">{{ title }}</div>
      <button
        v-if="showClose"
        type="button"
        class="session-preview-panel__close"
        title="关闭预览"
        @click="emit('close')"
      >
        <X class="h-4 w-4" />
      </button>
    </header>

    <div v-if="loading" class="session-preview-panel__state">正在唤醒服务...</div>
    <div v-else-if="previews.length === 0" class="session-preview-panel__state">
      暂无 UI 预览页面
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
      <iframe
        v-for="preview in previews"
        v-show="activeKey === previewKey(preview)"
        :key="previewKey(preview)"
        class="session-preview-panel__frame"
        :src="preview.previewUrl"
        :title="preview.label ?? preview.name"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X } from "lucide-vue-next";
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
    title: "项目页面",
    showHeader: true,
    showClose: false,
    embedded: false,
  },
);

const emit = defineEmits<{
  close: [];
  "update:modelValue": [value: string];
}>();

function previewKey(preview: SessionServicesPreview): string {
  return `${preview.name}:${preview.port}`;
}

const activeKey = ref(props.modelValue || (props.previews[0] ? previewKey(props.previews[0]) : ""));

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
  font-size: 14px;
  font-weight: 500;
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
  font-size: 12px;
  white-space: nowrap;
  color: var(--app-text-secondary);
  background: var(--app-list-search-bg);
}

.session-preview-panel__tab--active {
  color: var(--app-text-primary);
  background: var(--app-list-item-active);
}

.session-preview-panel__frame {
  flex: 1;
  width: 100%;
  border: 0;
  background: #fff;
}

.session-preview-panel__state {
  padding: 24px 16px;
  color: var(--app-text-secondary);
  font-size: 13px;
}
</style>
