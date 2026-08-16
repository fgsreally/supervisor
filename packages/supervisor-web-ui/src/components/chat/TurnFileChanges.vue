<template>
  <div class="turn-files mt-2">
    <button type="button" class="turn-files-toggle" @click="expanded = !expanded">
      <span class="turn-files-badge">{{ badgeText }}</span>
      <ChevronDown
        class="w-3 h-3 turn-files-chevron"
        :class="{ 'turn-files-chevron--open': expanded }"
      />
    </button>
    <div class="turn-files-collapse" :class="{ 'is-open': expanded }">
      <div class="turn-files-list">
        <div v-if="files.added?.length" class="turn-files-group">
          <span class="turn-files-label turn-files-label--added">{{ t("common.added") }}</span>
          <button
            v-for="f in files.added"
            :key="f"
            type="button"
            class="turn-files-item turn-files-item--added"
            @click="openFile(f)"
          >
            <FileTypeIcon :path="f" />
            <code class="turn-files-name">{{ f }}</code>
          </button>
        </div>
        <div v-if="files.modified?.length" class="turn-files-group">
          <span class="turn-files-label turn-files-label--modified">{{ t("common.modified") }}</span>
          <button
            v-for="f in files.modified"
            :key="f"
            type="button"
            class="turn-files-item turn-files-item--modified"
            @click="openFile(f)"
          >
            <FileTypeIcon :path="f" />
            <code class="turn-files-name">{{ f }}</code>
          </button>
        </div>
        <div v-if="files.deleted?.length" class="turn-files-group">
          <span class="turn-files-label turn-files-label--deleted">{{ t("common.delete") }}</span>
          <button
            v-for="f in files.deleted"
            :key="f"
            type="button"
            class="turn-files-item turn-files-item--deleted"
            @click="openFile(f)"
          >
            <FileTypeIcon :path="f" />
            <code class="turn-files-name">{{ f }}</code>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import FileTypeIcon from "../base/FileTypeIcon.vue";

export interface TurnFileChangesData {
  added?: string[];
  modified?: string[];
  deleted?: string[];
}

const props = defineProps<{
  files: TurnFileChangesData;
}>();

const expanded = ref(false);
const { t } = useI18n();

const totalCount = computed(() => {
  const f = props.files;
  return (f.added?.length ?? 0) + (f.modified?.length ?? 0) + (f.deleted?.length ?? 0);
});

const badgeText = computed(() => t("chat.fileChanges", { count: totalCount.value }));

function openFile(path: string) {
  window.dispatchEvent(new CustomEvent("supervisor:open-file", { detail: { path } }));
}
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

.turn-files-collapse {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 240ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 160ms ease;
}

.turn-files-collapse.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.turn-files-collapse > .turn-files-list {
  min-height: 0;
  overflow: hidden;
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
  width: 100%;
  text-align: left;
}

.turn-files-item:hover {
  background: var(--app-hover);
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
