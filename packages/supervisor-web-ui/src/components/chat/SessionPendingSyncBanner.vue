<template>
  <div class="pending-sync-wrap">
    <div class="pending-sync-header">
      <button
        type="button"
        class="pending-sync-header__toggle"
        :aria-expanded="filesOpen"
        :disabled="!pending.files.length"
        @click="filesOpen = !filesOpen"
      >
        <ChevronDown
          v-if="pending.files.length"
          class="pending-sync-header__chevron"
          :class="{ 'is-open': filesOpen }"
        />
        <span class="pending-sync-header__summary">{{ summaryText }}</span>
      </button>
      <div class="pending-sync-header__actions">
        <button
          type="button"
          class="pending-sync-action pending-sync-action--ghost"
          @click="emit('dismiss')"
        >
          暂不
        </button>
        <button
          type="button"
          class="pending-sync-action pending-sync-action--primary"
          :disabled="syncDisabled"
          @click="emit('sync')"
        >
          更新
        </button>
      </div>
    </div>
    <div v-if="pending.files.length" class="pending-sync-body" :class="{ 'is-open': filesOpen }">
      <div class="pending-sync-body__inner">
        <div v-for="file in pending.files" :key="file.path" class="pending-sync-file-row">
          <button
            type="button"
            class="pending-sync-file"
            :title="file.path"
            @click="openFile(file.path)"
          >
            <FileTypeIcon :path="file.path" />
            <span class="pending-sync-file__name">{{ fileName(file.path) }}</span>
            <span
              v-if="file.status === 'added'"
              class="pending-sync-file__stat pending-sync-file__stat--add"
              >+</span
            >
            <span
              v-else-if="file.status === 'deleted'"
              class="pending-sync-file__stat pending-sync-file__stat--del"
              >−</span
            >
            <span v-else class="pending-sync-file__stat pending-sync-file__stat--mod">~</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronDown } from "lucide-vue-next";
import FileTypeIcon from "../base/FileTypeIcon.vue";
import type { SessionGitPendingUpdate } from "@/api";

const props = defineProps<{
  pending: SessionGitPendingUpdate;
  syncDisabled?: boolean;
}>();

const emit = defineEmits<{
  sync: [];
  dismiss: [];
}>();

const filesOpen = ref(true);

watch(
  () => props.pending.files.length,
  (count) => {
    filesOpen.value = count > 0 && count <= 5;
  },
  { immediate: true },
);

const sourceLabel = computed(() => {
  const title = props.pending.sourceTitle?.trim();
  if (title) return title;
  const id = String(props.pending.sourceSessionId);
  return `会话 ${id.slice(0, 8)}`;
});

const summaryText = computed(() => {
  if (props.pending.files.length > 0) {
    return `项目已更新（来自 ${sourceLabel.value}）· ${props.pending.files.length} 个文件`;
  }
  return `项目分支已变化（${props.pending.branch}），是否更新到本会话？`;
});

function fileName(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

function openFile(path: string) {
  window.dispatchEvent(new CustomEvent("supervisor:open-file", { detail: { path } }));
}
</script>

<style scoped>
.pending-sync-wrap {
  background: transparent;
}

.pending-sync-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px 6px;
}

.pending-sync-header__toggle {
  display: inline-flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 6px;
  color: var(--app-text-secondary);
  font-size: 13px;
  text-align: left;
}

.pending-sync-header__toggle:not(:disabled):hover {
  color: var(--app-text-primary);
}

.pending-sync-header__toggle:disabled {
  cursor: default;
}

.pending-sync-header__chevron {
  width: 14px;
  height: 14px;
  flex: none;
  transition: transform 200ms ease;
}

.pending-sync-header__chevron.is-open {
  transform: rotate(0deg);
}

.pending-sync-header__chevron:not(.is-open) {
  transform: rotate(-90deg);
}

.pending-sync-header__summary {
  min-width: 0;
}

.pending-sync-header__actions {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
}

.pending-sync-action {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
}

.pending-sync-action--ghost {
  color: var(--app-text-secondary);
}

.pending-sync-action--ghost:hover {
  color: var(--app-text-primary);
  background: var(--app-hover);
}

.pending-sync-action--primary {
  background: var(--app-accent, #07c160);
  color: #fff;
}

.pending-sync-action--primary:hover:not(:disabled) {
  filter: brightness(0.95);
}

.pending-sync-action--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pending-sync-body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 220ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 160ms ease;
}

.pending-sync-body.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.pending-sync-body__inner {
  min-height: 0;
  overflow: hidden;
}

.pending-sync-file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 12px 8px;
}

.pending-sync-file {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 8px;
  color: var(--app-text-primary);
  font-size: 13px;
  text-align: left;
}

.pending-sync-file:hover .pending-sync-file__name {
  color: var(--app-text-link);
}

.pending-sync-file__name {
  min-width: 0;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pending-sync-file__stat {
  flex: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
}

.pending-sync-file__stat--add {
  color: #3fb950;
}

.pending-sync-file__stat--del {
  color: #f85149;
}

.pending-sync-file__stat--mod {
  color: #d29922;
}
</style>
