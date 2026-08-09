<template>
  <MobileDrawer
    v-model:open="openModel"
    ariaLabel="项目页面"
    size="tall"
    :resizable="true"
    title="项目页面"
  >
    <SessionPreviewPanel
      :previews="previews"
      :loading="loading"
      :show-header="false"
      :show-close="false"
      v-model="activeKey"
    />
  </MobileDrawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import MobileDrawer from "./mobile/ui/MobileDrawer.vue";
import SessionPreviewPanel from "./SessionPreviewPanel.vue";
import type { SessionServicesPreview } from "@/utils/session-services";

const props = defineProps<{
  open: boolean;
  previews: SessionServicesPreview[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value),
});

const activeKey = ref("");

watch(
  () => props.previews,
  (next) => {
    if (!next.length) {
      activeKey.value = "";
      return;
    }
    const firstKey = `${next[0]!.scriptName}:${next[0]!.envVar}`;
    if (!next.some((item) => `${item.scriptName}:${item.envVar}` === activeKey.value)) {
      activeKey.value = firstKey;
    }
  },
  { immediate: true, deep: true },
);
</script>
