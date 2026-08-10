<template>
  <ResponsivePopover
    v-model:open="open"
    title="Commit 记录"
    panel-class="commit-popover"
    :dismiss-on-outside="dismissOnOutside"
  >
    <template #trigger>
      <ChatHeaderAction title="Commit 记录" :active="open" @click="toggle">
        <GitCommitHorizontal />
      </ChatHeaderAction>
    </template>

    <template #default="{ mobile }">
      <header v-if="!mobile">
        <strong>Commit 记录</strong>
        <Loader2 v-if="loading" class="commit-loading" />
      </header>
      <div v-else-if="loading" class="commit-drawer-loading">
        <Loader2 class="commit-loading" />
        <span>加载中…</span>
      </div>
      <ul v-if="commits.length">
        <li v-for="commit in commits" :key="commit.hash">
          <code>{{ commit.shortHash }}</code>
          <div>
            <span>{{ commit.subject }}</span>
            <small>{{ commit.author }} · {{ formatTime(commit.timestamp) }}</small>
          </div>
        </li>
      </ul>
      <p v-else-if="!loading">当前 worktree 暂无提交</p>
    </template>
  </ResponsivePopover>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { GitCommitHorizontal, Loader2 } from "lucide-vue-next";
import { getSessionCommits, type WorktreeCommit } from "@/api";
import ResponsivePopover from "@/components/ui/ResponsivePopover.vue";
import ChatHeaderAction from "./ChatHeaderAction.vue";

const props = withDefaults(defineProps<{ sessionId: string; dismissOnOutside?: boolean }>(), {
  dismissOnOutside: true,
});
const open = ref(false);
const loading = ref(false);
const commits = ref<WorktreeCommit[]>([]);

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
:deep(.commit-popover) {
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

:deep(.commit-popover) > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 10px;
  color: var(--app-text-primary);
  font-size: 13px;
}

.commit-loading {
  width: 15px;
  height: 15px;
  color: var(--app-accent);
  animation: commit-spin 0.8s linear infinite;
}

.commit-drawer-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px 8px;
  color: var(--app-text-muted);
  font-size: 13px;
}

@keyframes commit-spin {
  to {
    transform: rotate(360deg);
  }
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
}

li:hover {
  background: var(--app-popup-hover);
}

code {
  flex-shrink: 0;
  color: var(--app-accent);
  font-size: 12px;
}

li > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

li span {
  color: var(--app-text-primary);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

li small {
  color: var(--app-text-muted);
  font-size: 11px;
}

p {
  margin: 0;
  padding: 16px 8px;
  color: var(--app-text-muted);
  font-size: 13px;
  text-align: center;
}

@media (max-width: 767px) {
  li {
    padding: 12px 4px;
  }

  li span {
    font-size: 14px;
    white-space: normal;
  }

  li small,
  code {
    font-size: 12px;
  }
}
</style>
