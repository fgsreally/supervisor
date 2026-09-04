<template>
  <div class="changes-wrap">
    <div class="changes-header">
      <button
        v-if="files.length"
        type="button"
        class="changes-header__toggle"
        :aria-expanded="open"
        @click="open = !open"
      >
        <ChevronDown class="changes-header__chevron" :class="{ 'is-open': open }" />
        <span>{{ t("session.files.currentChanges", { count: files.length }) }}</span>
      </button>
    </div>
    <div class="changes-body" :class="{ 'is-open': open }">
      <div class="changes-body__inner">
        <div v-for="file in files" :key="file.path" class="changes-file-row">
          <button
            type="button"
            class="changes-file"
            :title="file.path"
            @click="openFile(file.path)"
          >
            <FileTypeIcon :path="file.path" />
            <span class="changes-file__name">{{ fileName(file.path) }}</span>
            <span v-if="file.status === 'added'" class="changes-file__stat changes-file__stat--add"
              >+</span
            >
            <span
              v-else-if="file.status === 'deleted'"
              class="changes-file__stat changes-file__stat--del"
              >−</span
            >
            <span v-else class="changes-file__stat changes-file__stat--mod">~</span>
          </button>
        </div>
      </div>
    </div>
    <div v-if="suggestions.length" class="changes-suggestions">
      <span>{{ t("chat.suggestions") }}</span>
      <UiActionButton
        v-for="suggestion in suggestions"
        :key="suggestion"
        variant="ghost"
        @click="emit('select-suggestion', suggestion)"
      >
        {{ suggestion }}
      </UiActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import FileTypeIcon from "../base/FileTypeIcon.vue";
import UiActionButton from "../base/UiActionButton.vue";

export interface SessionChangedFileView {
  path: string;
  status: "added" | "modified" | "deleted";
  lastTurn?: number;
}

const props = withDefaults(
  defineProps<{ files: SessionChangedFileView[]; suggestions?: string[] }>(),
  { suggestions: () => [] },
);
const emit = defineEmits<{ "select-suggestion": [suggestion: string] }>();
const { t } = useI18n();
const open = ref(false);

watch(
  () => props.files.length,
  (count) => {
    open.value = false;
  },
  { immediate: true },
);

function fileName(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

function openFile(path: string) {
  window.dispatchEvent(new CustomEvent("wecode:open-file", { detail: { path } }));
}
</script>

<style scoped>
.changes-wrap {
  background: transparent;
}

.changes-header {
  display: flex;
  box-sizing: border-box;
  min-height: 52px;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 12px;
}

.changes-suggestions {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 8px 12px 8px;
  border-top: 1px solid var(--app-border-subtle);
  color: var(--app-text-muted);
  font-size: var(--app-font-caption);
}

.changes-suggestions :deep(.ui-action-button) {
  min-height: 28px;
  padding-inline: 8px;
}

.changes-header__toggle {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: var(--app-text-secondary);
  font-size: 13px;
  text-align: left;
}

.changes-header__toggle:hover {
  color: var(--app-text-primary);
}

.changes-header__chevron {
  width: 14px;
  height: 14px;
  flex: none;
  transition: transform 200ms ease;
}

.changes-header__chevron.is-open {
  transform: rotate(0deg);
}

.changes-header__chevron:not(.is-open) {
  transform: rotate(-90deg);
}

.changes-body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 220ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 160ms ease;
}

.changes-body.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.changes-body__inner {
  min-height: 0;
  overflow: hidden;
}

.changes-file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 12px 8px;
}

.changes-file {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 8px;
  color: var(--app-text-primary);
  font-size: 13px;
  text-align: left;
}

.changes-file:hover .changes-file__name {
  color: var(--app-text-link);
}

.changes-file__name {
  min-width: 0;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.changes-file__stat {
  flex: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
}

.changes-file__stat--add {
  color: #3fb950;
}

.changes-file__stat--del {
  color: #f85149;
}

.changes-file__stat--mod {
  color: #d29922;
}
</style>
