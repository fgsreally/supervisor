<template>
  <div v-if="sessions.length" class="bash-popover-wrap">
    <button
      class="bash-summary chat-context-button"
      type="button"
      :title="`${sessions.length} 个 Bash 会话`"
      @click="open = !open"
    >
      <Terminal class="h-4 w-4" />
      <span>{{ sessions.length }}</span>
    </button>
    <section v-if="open" class="bash-popover" aria-label="Bash 会话">
      <header>
        <span>Bash 会话</span>
        <button type="button" title="刷新" @click="refresh">
          <RefreshCw class="h-3.5 w-3.5" />
        </button>
      </header>
      <div v-for="item in sessions" :key="item.id" class="bash-item">
        <button class="bash-item__heading" type="button" @click="toggle(item.id)">
          <span class="bash-item__status" :class="`bash-item__status--${item.status}`" />
          <span class="bash-item__label">{{ item.label }}</span>
          <span class="bash-item__id">{{ item.id }}</span>
          <ChevronDown
            class="h-3.5 w-3.5 transition-transform"
            :class="{ 'rotate-180': expanded.has(item.id) }"
          />
        </button>
        <div v-if="expanded.has(item.id)" class="bash-item__body">
          <pre>{{ item.output || "(暂无输出)" }}</pre>
          <form v-if="item.status === 'running'" @submit.prevent="send(item.id)">
            <input v-model="inputs[item.id]" type="text" placeholder="发送到 stdin" />
            <button type="submit" :disabled="!inputs[item.id]?.trim()">发送</button>
          </form>
          <button class="bash-item__stop" type="button" @click="stop(item.id)">
            {{ item.status === "running" ? "停止并移除" : "移除" }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { ChevronDown, RefreshCw, Terminal } from "lucide-vue-next";
import {
  listPersistentBashSessions,
  stopPersistentBash,
  writePersistentBashInput,
  type PersistentBashSession,
} from "@/api";

const props = defineProps<{ sessionId: string }>();
const sessions = ref<PersistentBashSession[]>([]);
const open = ref(false);
const expanded = ref(new Set<string>());
const inputs = reactive<Record<string, string>>({});
let poll: ReturnType<typeof setInterval> | undefined;

async function refresh(): Promise<void> {
  sessions.value = await listPersistentBashSessions(props.sessionId).catch(() => []);
  if (sessions.value.length === 0) open.value = false;
}

function toggle(id: string): void {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

async function send(id: string): Promise<void> {
  const input = inputs[id]?.trim();
  if (!input) return;
  await writePersistentBashInput(props.sessionId, id, input);
  inputs[id] = "";
  await refresh();
}

async function stop(id: string): Promise<void> {
  await stopPersistentBash(props.sessionId, id);
  await refresh();
}

watch(() => props.sessionId, refresh);
onMounted(() => {
  void refresh();
  poll = setInterval(() => void refresh(), 2_000);
});
onUnmounted(() => {
  if (poll) clearInterval(poll);
});
</script>

<style scoped>
.bash-popover-wrap {
  position: relative;
}
.bash-summary {
  border: 1px solid var(--app-border-subtle);
  border-radius: 8px;
}
.bash-popover {
  position: absolute;
  z-index: 30;
  top: 34px;
  right: 0;
  width: min(520px, calc(100vw - 32px));
  max-height: min(65vh, 560px);
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--app-popup-border);
  border-radius: 10px;
  background: var(--app-popup-bg);
  box-shadow: 0 10px 30px rgb(0 0 0 / 16%);
}
.bash-popover header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 8px;
  color: var(--app-text-primary);
  font-size: 12px;
  font-weight: 600;
}
.bash-popover header button {
  color: var(--app-text-secondary);
}
.bash-item + .bash-item {
  border-top: 1px solid var(--app-border-subtle);
}
.bash-item__heading {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 7px;
  padding: 8px;
  text-align: left;
}
.bash-item__status {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 999px;
  background: var(--app-text-muted);
}
.bash-item__status--running {
  background: var(--app-accent);
}
.bash-item__status--failed {
  background: #ef4444;
}
.bash-item__label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--app-text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bash-item__id {
  color: var(--app-text-muted);
  font-family: monospace;
  font-size: 10px;
}
.bash-item__body {
  padding: 0 8px 9px;
}
.bash-item__body pre {
  max-height: 260px;
  overflow: auto;
  padding: 9px;
  border-radius: 6px;
  background: #111827;
  color: #d1fae5;
  font-family: monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
}
.bash-item__body form {
  display: flex;
  gap: 6px;
  margin-top: 7px;
}
.bash-item__body input {
  min-width: 0;
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--app-border);
  border-radius: 5px;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  font-family: monospace;
  font-size: 11px;
  outline: none;
}
.bash-item__body form button,
.bash-item__stop {
  padding: 5px 9px;
  border-radius: 5px;
  background: var(--app-hover);
  color: var(--app-text-secondary);
  font-size: 11px;
}
.bash-item__stop {
  margin-top: 7px;
  color: #dc2626;
}
@media (max-width: 767px) {
  .bash-popover {
    position: fixed;
    z-index: 90;
    top: auto;
    right: 10px;
    bottom: calc(74px + env(safe-area-inset-bottom));
    left: 10px;
    width: auto;
    max-height: min(62vh, 520px);
  }
}
</style>
