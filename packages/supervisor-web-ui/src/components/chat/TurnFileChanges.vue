<template>
  <div class="turn-files mt-2">
    <button type="button" class="turn-files-toggle" @click="expanded = !expanded">
      <span class="turn-files-badge">{{ badgeText }}</span>
      <ChevronDown
        class="w-3 h-3 turn-files-chevron"
        :class="{ 'turn-files-chevron--open': expanded }"
      />
    </button>
    <div v-if="expanded" class="turn-files-list">
      <div v-if="files.added?.length" class="turn-files-group">
        <span class="turn-files-label turn-files-label--added">新增</span>
        <div v-for="f in files.added" :key="f" class="turn-files-item turn-files-item--added">
          <Plus class="w-3 h-3 shrink-0" />
          <code class="turn-files-name">{{ f }}</code>
        </div>
      </div>
      <div v-if="files.modified?.length" class="turn-files-group">
        <span class="turn-files-label turn-files-label--modified">修改</span>
        <div v-for="f in files.modified" :key="f" class="turn-files-item turn-files-item--modified">
          <FileEdit class="w-3 h-3 shrink-0" />
          <code class="turn-files-name">{{ f }}</code>
        </div>
      </div>
      <div v-if="files.deleted?.length" class="turn-files-group">
        <span class="turn-files-label turn-files-label--deleted">删除</span>
        <div v-for="f in files.deleted" :key="f" class="turn-files-item turn-files-item--deleted">
          <Trash2 class="w-3 h-3 shrink-0" />
          <code class="turn-files-name">{{ f }}</code>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ChevronDown, FileEdit, Plus, Trash2 } from "lucide-vue-next";

export interface TurnFileChangesData {
  added?: string[];
  modified?: string[];
  deleted?: string[];
}

const props = defineProps<{
  files: TurnFileChangesData;
}>();

const expanded = ref(false);

const totalCount = computed(() => {
  const f = props.files;
  return (f.added?.length ?? 0) + (f.modified?.length ?? 0) + (f.deleted?.length ?? 0);
});

const badgeText = computed(() => `文件变更 ${totalCount.value} 个`);
</script>

<style scoped>
.turn-files {
  margin-top: 6px;
}

.turn-files-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  cursor: pointer;
  background: color-mix(in srgb, var(--app-border) 40%, transparent);
  color: var(--app-text-secondary);
  transition: background 0.15s;
  border: none;
}

.turn-files-toggle:hover {
  background: color-mix(in srgb, var(--app-border) 60%, transparent);
}

.turn-files-badge {
  white-space: nowrap;
}

.turn-files-chevron {
  transition: transform 0.15s;
}

.turn-files-chevron--open {
  transform: rotate(180deg);
}

.turn-files-list {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 4px;
}

.turn-files-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.turn-files-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 1px;
}

.turn-files-label--added {
  color: #22c55e;
}

.turn-files-label--modified {
  color: #f59e0b;
}

.turn-files-label--deleted {
  color: #ef4444;
}

.turn-files-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}

.turn-files-item--added {
  color: #22c55e;
}

.turn-files-item--modified {
  color: #f59e0b;
}

.turn-files-item--deleted {
  color: #ef4444;
}

.turn-files-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
