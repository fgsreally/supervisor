<template>
  <div class="commit-wrap">
    <ChatHeaderAction title="Commit 记录" :active="open" @click="toggle">
      <GitCommitHorizontal />
    </ChatHeaderAction>
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
import ChatHeaderAction from "./ChatHeaderAction.vue";

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
.commit-popover {
  position: absolute;
  z-index: 30;
  top: 36px;
  right: 0;
  width: min(420px, calc(100vw - 32px));
  max-height: min(60vh, 420px);
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--app-popup-border);
  border-radius: 10px;
  background: var(--app-popup-bg);
  box-shadow: 0 10px 30px rgb(0 0 0 / 16%);
}
.commit-popover header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 10px;
  color: var(--app-text-primary);
  font-size: 13px;
}
.commit-popover ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.commit-popover li {
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
}
.commit-popover li:hover {
  background: var(--app-popup-hover);
}
.commit-popover code {
  flex-shrink: 0;
  color: var(--app-accent);
  font-size: 12px;
}
.commit-popover div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.commit-popover span {
  color: var(--app-text-primary);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.commit-popover small {
  color: var(--app-text-muted);
  font-size: 11px;
}
.commit-popover p {
  margin: 0;
  padding: 16px 8px;
  color: var(--app-text-muted);
  font-size: 13px;
  text-align: center;
}
</style>
