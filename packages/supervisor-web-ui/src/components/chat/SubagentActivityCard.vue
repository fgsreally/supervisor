<template>
  <button type="button" class="subagent-card" :disabled="!childSessionId" @click="emit('open')">
    <div class="subagent-head">
      <Bot class="subagent-icon" />
      <strong>{{ title }}</strong>
      <span class="subagent-status" :class="`subagent-status--${statusTone}`">
        {{ statusLabel }}
      </span>
      <ChevronRight v-if="childSessionId" class="subagent-open" />
    </div>
    <p v-if="description" class="subagent-description">{{ description }}</p>
    <div class="subagent-stream">
      <Loader2 v-if="livePending" class="subagent-spinner" />
      <span>{{ preview || (livePending ? "正在处理…" : "暂无输出") }}</span>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Bot, ChevronRight, Loader2 } from "lucide-vue-next";
import * as api from "@/api";
import { useSessionStore } from "@/store";
import { messageTextContent } from "@/utils/message-content";

const props = defineProps<{
  childSessionId?: string;
  agentName?: string;
  description?: string;
  pending?: boolean;
  isError?: boolean;
}>();
const emit = defineEmits<{ open: [] }>();
const store = useSessionStore();
const preview = ref("");
const streamActive = ref(false);
let cleanup: (() => void) | null = null;

const child = computed(() =>
  props.childSessionId ? store.sessions.find((item) => item.id === props.childSessionId) : null,
);
const title = computed(() => props.agentName || child.value?.title || "子代理");
const livePending = computed(
  () => props.pending || streamActive.value || child.value?.status === "running",
);
const statusTone = computed(() =>
  props.isError ? "error" : livePending.value ? "running" : "idle",
);
const statusLabel = computed(() =>
  props.isError ? "失败" : livePending.value ? "执行中" : "已完成",
);

function updatePreviewFromPage(messages: api.SessionTreeEntry[]) {
  const latest = [...messages]
    .reverse()
    .find((entry) => entry.type === "message" && entry.message?.role === "assistant");
  const text = latest?.message ? messageTextContent(latest.message.content) : "";
  if (text.trim()) preview.value = text.trim();
}

async function loadPreviewPage(id: string) {
  const page = await api.getSessionMessagesPage(id, { limit: 24, view: "lite" });
  updatePreviewFromPage(page.messages);
}

async function connect(id: string) {
  cleanup?.();
  cleanup = null;
  try {
    await loadPreviewPage(id);
  } catch {
    // The child may still be starting; the event stream will reconcile it.
  }
  cleanup = api.subscribeSessionEvents(id, (payload) => {
    if (payload.type !== "agent" || !payload.event) return;
    const event = payload.event;
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      preview.value += event.assistantMessageEvent.delta;
      streamActive.value = true;
    } else if (event.type === "session_status") {
      streamActive.value = event.status === "running";
      void store.fetchSession(id);
      if (!streamActive.value) void loadPreviewPage(id).catch(() => {});
    } else if (event.type === "agent_end") {
      streamActive.value = false;
      void loadPreviewPage(id).catch(() => {});
    }
  });
}

watch(
  () => props.childSessionId,
  (id) => {
    preview.value = "";
    streamActive.value = false;
    if (id) void connect(id);
  },
  { immediate: true },
);
onBeforeUnmount(() => cleanup?.());
</script>

<style scoped>
.subagent-card {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--app-accent) 30%, var(--app-border));
  border-radius: 9px;
  background: color-mix(in srgb, var(--app-accent) 5%, var(--app-chat-bg));
  color: var(--app-text-primary);
  text-align: left;
  cursor: pointer;
}
.subagent-card:disabled {
  cursor: default;
}
.subagent-head {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.subagent-icon {
  width: 17px;
  height: 17px;
  color: var(--app-accent);
}
.subagent-head strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.subagent-status {
  margin-left: auto;
  font-size: 11px;
  color: var(--app-text-secondary);
}
.subagent-status--running {
  color: var(--app-accent);
}
.subagent-status--error {
  color: var(--app-danger, #d93025);
}
.subagent-open {
  width: 15px;
  height: 15px;
  color: var(--app-text-muted);
}
.subagent-description {
  margin: 5px 0 0 24px;
  color: var(--app-text-secondary);
  font-size: 12px;
}
.subagent-stream {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  max-height: 76px;
  margin-top: 8px;
  padding: 7px 9px;
  overflow: hidden;
  border-radius: 6px;
  background: var(--app-bubble-assistant);
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
}
.subagent-stream span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.subagent-spinner {
  width: 14px;
  height: 14px;
  flex: none;
  margin-top: 2px;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
