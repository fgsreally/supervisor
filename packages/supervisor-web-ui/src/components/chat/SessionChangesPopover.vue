<template>
  <div class="changes-wrap">
    <button
      class="chat-context-button"
      type="button"
      :title="`${files.length} 个变更文件`"
      @click="open = !open"
    >
      <Files class="h-[17px] w-[17px]" /><span>{{ files.length }}</span>
    </button>
    <section v-if="open" class="changes-popover">
      <header>
        <strong>文件变更</strong><span>{{ files.length }} Files</span>
      </header>
      <ul>
        <li v-for="file in files" :key="file.path" :title="file.path">
          <FileCode2 /><span>{{ file.path }}</span
          ><small :class="`status-${file.status}`">{{ statusLabel(file.status) }}</small>
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
  position: relative;
}
.changes-popover {
  position: absolute;
  z-index: 30;
  top: 36px;
  right: 0;
  width: min(420px, calc(100vw - 32px));
  max-height: 360px;
  overflow: hidden;
  border: 1px solid var(--app-popup-border);
  border-radius: 10px;
  background: var(--app-popup-bg);
  box-shadow: 0 10px 30px rgb(0 0 0 / 16%);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 13px;
  color: var(--app-text-primary);
  font-size: 13px;
}
header span {
  color: var(--app-text-muted);
  font-weight: 400;
}
ul {
  max-height: 310px;
  overflow: auto;
  padding: 0 6px 7px;
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
@media (max-width: 767px) {
  .changes-popover {
    position: fixed;
    top: 64px;
    right: 10px;
    left: 10px;
    width: auto;
  }
}
</style>
