<template>
  <div
    class="flex flex-col h-full shrink-0 min-w-0 border-r"
    :class="width == null ? 'w-full' : ''"
    :style="{
      ...(width != null ? { width: `${width}px` } : {}),
      background: 'var(--app-list-bg)',
      borderColor: 'var(--app-border)',
    }"
  >
    <div
      class="px-4 py-3 border-b"
      style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)"
    >
      <div class="text-[17px] font-medium mb-1" style="color: var(--app-text-primary)">资源</div>
      <p class="text-[12px] mb-3" style="color: var(--app-text-secondary)">
        ~/.pi/supervisor/ 全局
      </p>
      <div class="flex gap-1">
        <button
          v-for="k in kinds"
          :key="k.id"
          type="button"
          class="resources-kind-btn px-2 py-0.5 rounded text-[12px] transition-colors"
          :class="kind === k.id ? 'resources-kind-btn--active' : 'resources-kind-btn--idle'"
          @click="kind = k.id"
        >
          {{ k.label }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div
        v-for="item in filteredItems"
        :key="item.id"
        class="resources-item px-4 py-3 border-b cursor-pointer transition-colors"
        :class="{ 'resources-item--active': activeId === item.id }"
        :style="{ borderColor: 'var(--app-border-subtle)' }"
        @click="$emit('select', item.id)"
      >
        <div class="text-[14px] font-medium truncate resources-item__name">{{ item.name }}</div>
        <div class="text-[12px] mt-0.5 truncate resources-item__desc">{{ item.description }}</div>
      </div>
      <div
        v-if="filteredItems.length === 0"
        class="px-4 py-8 text-center text-[13px]"
        style="color: var(--app-text-muted)"
      >
        暂无资源
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { getResourcesByKind, type ResourceKind } from "../mock/resources";

defineProps<{
  activeId: string | null;
  width?: number;
}>();

defineEmits<{ select: [id: string] }>();

const kind = ref<ResourceKind>("skills");

const kinds = [
  { id: "skills" as const, label: "Skills" },
  { id: "extensions" as const, label: "Ext" },
  { id: "prompts" as const, label: "Prompt" },
];

const filteredItems = computed(() => getResourcesByKind(kind.value));
</script>

<style scoped>
.resources-kind-btn--active {
  background: var(--app-accent);
  color: #ffffff;
}

.resources-kind-btn--idle {
  background: var(--app-settings-card);
  color: var(--app-text-secondary);
  border: 1px solid var(--app-border);
}

.resources-item__name {
  color: var(--app-text-primary);
}

.resources-item__desc {
  color: var(--app-text-secondary);
}

.resources-item:hover:not(.resources-item--active) {
  background: var(--app-list-item-hover);
}

.resources-item--active {
  background: var(--app-list-item-active);
}

.resources-item--active .resources-item__name {
  color: var(--app-list-item-active-text);
}

.resources-item--active .resources-item__desc {
  color: #b7e9d3;
}
</style>
