<template>
  <div class="commit-wrap">
    <button class="chat-header-action" type="button" title="Commit 记录" @click="toggle">
      <GitCommitHorizontal />
    </button>
    <section v-if="open" class="commit-popover">
      <header><strong>Commit 记录</strong><Loader2 v-if="loading" /></header>
      <ul v-if="commits.length">
        <li v-for="commit in commits" :key="commit.hash">
          <code>{{ commit.shortHash }}</code>
          <div>
            <span>{{ commit.subject }}</span
            ><small>{{ commit.author }} · {{ formatTime(commit.timestamp) }}</small>
          </div>
        </li>
      </ul>
      <p v-else-if="!loading">当前 worktree 暂无提交</p>
    </section>
  </div>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { GitCommitHorizontal, Loader2 } from "lucide-vue-next";
import { getSessionCommits, type WorktreeCommit } from "@/api";
const props = defineProps<{ sessionId: string }>();
const open = ref(false),
  loading = ref(false),
  commits = ref<WorktreeCommit[]>([]);
async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  loading.value = true;
  try {
    commits.value = await getSessionCommits(props.sessionId);
  } finally {
    loading.value = false;
  }
}
function formatTime(value: number) {
  return new Date(value).toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>
<style scoped>
.commit-wrap {
  position: relative;
}
.commit-wrap > button svg {
  width: 17px;
  height: 17px;
}
.commit-wrap > button {
  display: inline-flex;
  min-width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 6px;
  color: var(--app-text-secondary);
  transition:
    background-color 0.15s,
    color 0.15s,
    transform 0.1s;
}
.commit-wrap > button:hover,
.commit-wrap > button:focus-visible {
  color: #07a65a;
  background: var(--app-hover);
  outline: none;
}
.commit-wrap > button:active {
  transform: scale(0.94);
}
.commit-popover {
  position: absolute;
  z-index: 30;
  top: 36px;
  right: 0;
  width: min(430px, calc(100vw - 32px));
  max-height: 380px;
  overflow: hidden;
  border: 1px solid var(--app-popup-border);
  border-radius: 10px;
  background: var(--app-popup-bg);
  box-shadow: 0 10px 30px rgb(0 0 0 / 16%);
}
header {
  display: flex;
  justify-content: space-between;
  padding: 11px 13px;
  color: var(--app-text-primary);
}
header svg {
  width: 14px;
  animation: spin 0.8s linear infinite;
}
ul {
  max-height: 330px;
  overflow: auto;
  padding: 0 6px 7px;
}
li {
  display: flex;
  gap: 10px;
  padding: 9px 8px;
  border-radius: 7px;
}
li:hover {
  background: var(--app-popup-hover);
}
code {
  color: var(--app-accent);
  font-size: 11px;
}
li div {
  min-width: 0;
  display: grid;
  gap: 3px;
}
li span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text-primary);
  font-size: 13px;
}
small,
p {
  color: var(--app-text-muted);
  font-size: 11px;
}
p {
  padding: 20px;
  text-align: center;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 767px) {
  .commit-popover {
    position: fixed;
    top: 64px;
    left: 10px;
    right: 10px;
    width: auto;
  }
}
</style>
