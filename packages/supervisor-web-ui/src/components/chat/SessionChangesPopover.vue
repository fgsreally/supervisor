<template>
  <div class="changes-wrap">
    <button type="button" class="changes-summary" :aria-expanded="open" @click="open = !open">
      <span class="changes-summary__label"><Files />文件变更</span>
      <span class="changes-summary__actions">
        <span>{{ files.length }} files</span>
        <ChevronRight class="changes-summary__chevron" :class="{ 'is-open': open }" />
      </span>
    </button>
    <div class="changes-collapse" :class="{ 'is-open': open }">
      <section class="changes-list">
        <ul>
          <li v-for="file in files" :key="file.path">
            <button type="button" :title="file.path" @click="openFile(file.path)">
              <FileTypeIcon :path="file.path" />
              <span>{{ file.path }}</span>
              <small :class="`status-${file.status}`">{{ statusLabel(file.status) }}</small>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ChevronRight, Files } from "lucide-vue-next";
import FileTypeIcon from "../FileTypeIcon.vue";

export interface SessionChangedFileView {
  path: string;
  status: "added" | "modified" | "deleted";
  lastTurn?: number;
}

defineProps<{ files: SessionChangedFileView[] }>();
const open = ref(false);

function statusLabel(status: SessionChangedFileView["status"]) {
  return status === "added" ? "A" : status === "deleted" ? "D" : "M";
}

function openFile(path: string) {
  window.dispatchEvent(new CustomEvent("supervisor:open-file", { detail: { path } }));
}
</script>

<style scoped>
.changes-wrap {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-popup-bg);
}
.changes-summary {
  display: flex;
  width: 100%;
  min-height: 32px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 8px;
  color: var(--app-text-primary);
  font-size: 12px;
  text-align: left;
}
.changes-summary:hover {
  background: var(--app-popup-hover);
}
.changes-summary__label,
.changes-summary__actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.changes-summary__label svg {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--app-text-muted);
}
.changes-summary__actions {
  flex: none;
  color: var(--app-text-muted);
}
.changes-summary__chevron {
  width: 14px;
  height: 14px;
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.changes-summary__chevron.is-open {
  transform: rotate(90deg);
}
.changes-collapse {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 260ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease;
}
.changes-collapse.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
}
.changes-list {
  min-height: 0;
  overflow: hidden;
  border-top: 1px solid var(--app-border);
}
ul {
  max-height: 240px;
  overflow: auto;
  padding: 3px;
}
li {
  list-style: none;
}
li button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 4px;
  color: var(--app-text-primary);
  font-size: 13px;
}
li button:hover {
  background: var(--app-popup-hover);
}
li button > span:nth-child(2) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
li small {
  width: 18px;
  text-align: center;
  font-weight: 600;
}
.status-added {
  color: #07a65a;
}
.status-modified {
  color: #d69e2e;
}
.status-deleted {
  color: #e05a67;
}
</style>
