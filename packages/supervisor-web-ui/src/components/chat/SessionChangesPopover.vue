<template>
  <div class="changes-wrap">
    <button type="button" class="changes-summary" :aria-expanded="open" @click="open = !open">
      <span class="changes-summary__label"><Files />文件变更</span>
      <span class="changes-summary__actions">
        <span>{{ files.length }} Files</span>
        <strong>{{ open ? "收起" : "Review" }}</strong>
      </span>
    </button>
    <section v-if="open" class="changes-list">
      <ul>
        <li v-for="file in files" :key="file.path" :title="file.path">
          <FileCode2 />
          <span>{{ file.path }}</span>
          <small :class="`status-${file.status}`">{{ statusLabel(file.status) }}</small>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { FileCode2, Files } from "lucide-vue-next";

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
</script>

<style scoped>
.changes-wrap {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-popup-bg);
}
.changes-summary {
  display: flex;
  width: 100%;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  color: var(--app-text-primary);
  font-size: 13px;
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
.changes-summary__actions strong {
  border-radius: 6px;
  padding: 4px 8px;
  background: var(--app-hover);
  color: var(--app-text-primary);
  font-weight: 500;
}
.changes-list {
  overflow: hidden;
  border-top: 1px solid var(--app-border);
}
ul {
  max-height: 240px;
  overflow: auto;
  padding: 6px;
}
li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 7px;
  color: var(--app-text-primary);
  font-size: 13px;
}
li:hover {
  background: var(--app-popup-hover);
}
li svg {
  width: 15px;
  height: 15px;
  flex: none;
  color: var(--app-text-muted);
}
li span {
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
