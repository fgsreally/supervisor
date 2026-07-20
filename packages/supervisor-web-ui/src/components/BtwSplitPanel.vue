<template>
  <aside class="btw-panel">
    <header class="btw-panel__header">
      <div><strong>顺便问一下</strong><span>不影响主对话</span></div>
      <button type="button" title="关闭" @click="emit('close')"><X /></button>
    </header>

    <div v-if="sessions.length" class="btw-panel__history">
      <button :class="{ active: !activeId }" type="button" @click="startDraft">新问题</button>
      <button
        v-for="session in sessions.slice(0, 5)"
        :key="session.id"
        :class="{ active: activeId === session.id }"
        type="button"
        @click="selectSession(session.id)"
      >
        {{ sessionName(session) }}
      </button>
    </div>

    <div class="btw-panel__messages">
      <div v-if="loading" class="btw-panel__empty"><Loader2 class="spin" />正在加载</div>
      <template v-else-if="displayMessages.length">
        <div v-for="item in displayMessages" :key="item.id" class="btw-message" :class="item.role">
          <span>{{ item.text }}</span>
        </div>
      </template>
      <div v-else class="btw-panel__empty">
        <MessageCircleQuestion />
        <strong>问一个不打断当前任务的问题</strong>
      </div>
    </div>

    <form class="btw-panel__composer" @submit.prevent="send">
      <textarea
        v-model="draft"
        rows="2"
        :disabled="sending"
        placeholder="输入一个顺便想问的问题"
        @keydown.enter.exact.prevent="send"
      />
      <button type="submit" :disabled="!draft.trim() || sending">
        <Loader2 v-if="sending" class="spin" /><Send v-else />
      </button>
    </form>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Loader2, MessageCircleQuestion, Send, X } from "lucide-vue-next";
import type { Session, SessionTreeEntry } from "@/api";
import * as api from "@/api";
import { useSessionStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";

const props = defineProps<{ parentId: string; sessions: Session[] }>();
const emit = defineEmits<{ close: [] }>();
const sessionStore = useSessionStore();
const activeId = ref<string | null>(null);
const draft = ref("");
const loading = ref(false);
const sending = ref(false);
const pendingQuestion = ref<string | null>(null);

const entries = computed(() =>
  activeId.value ? (sessionStore.messages[activeId.value] ?? []) : [],
);
const displayMessages = computed(() => {
  const result = entries.value
    .filter((entry) => entry.type === "message" && entry.message)
    .map((entry) => ({
      id: entry.id,
      role: entry.message?.role ?? "assistant",
      text: entryText(entry),
    }))
    .filter((item) => item.text);
  if (pendingQuestion.value && !result.some((item) => item.text === pendingQuestion.value)) {
    result.push({ id: "pending", role: "user", text: pendingQuestion.value });
  }
  return result;
});

watch(
  () => props.parentId,
  () => startDraft(),
);

function entryText(entry: SessionTreeEntry): string {
  const content = entry.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
}

function sessionName(session: Session): string {
  return typeof session.meta.name === "string" ? session.meta.name : "侧问";
}

function startDraft() {
  activeId.value = null;
  draft.value = "";
  pendingQuestion.value = null;
}

async function selectSession(id: string) {
  activeId.value = id;
  pendingQuestion.value = null;
  loading.value = true;
  try {
    await sessionStore.fetchSessionMessages(id);
  } finally {
    loading.value = false;
  }
}

async function send() {
  const question = draft.value.trim();
  if (!question || sending.value) return;
  sending.value = true;
  draft.value = "";
  pendingQuestion.value = question;
  try {
    if (!activeId.value) {
      const session = await sessionStore.createBtwSession(props.parentId);
      activeId.value = session.id;
    }
    await new Promise<void>((resolve, reject) => {
      api.promptSession(
        activeId.value!,
        question,
        () => undefined,
        reject,
        async () => {
          try {
            await sessionStore.fetchSessionMessages(activeId.value!);
            resolve();
          } catch (error) {
            reject(error);
          }
        },
      );
    });
    pendingQuestion.value = null;
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "侧问发送失败", "error");
  } finally {
    sending.value = false;
  }
}
</script>

<style scoped>
.btw-panel {
  display: flex;
  width: min(42%, 520px);
  min-width: 340px;
  flex-direction: column;
  border-left: 1px solid var(--app-border);
  background: var(--app-chat-bg);
}
.btw-panel__header {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.btw-panel__header div {
  display: flex;
  flex-direction: column;
}
.btw-panel__header span,
.btw-panel__empty span {
  color: var(--app-text-muted);
  font-size: 11px;
}
.btw-panel__header button {
  padding: 6px;
  border-radius: 6px;
  color: var(--app-text-muted);
}
.btw-panel__header svg {
  width: 18px;
}
.btw-panel__history {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 8px 10px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.btw-panel__history button {
  max-width: 130px;
  flex: none;
  overflow: hidden;
  padding: 5px 9px;
  border-radius: 6px;
  color: var(--app-text-secondary);
  background: var(--app-hover);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
.btw-panel__history button.active {
  color: #075f32;
  background: rgb(7 193 96 / 14%);
}
.btw-panel__messages {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding: 14px;
}
.btw-panel__empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: var(--app-text-secondary);
  text-align: center;
}
.btw-panel__empty svg {
  width: 26px;
  color: #576b95;
}
.btw-message {
  display: flex;
}
.btw-message span {
  max-width: 88%;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--app-text-primary);
  background: var(--app-bubble-assistant);
  white-space: pre-wrap;
  font-size: 13px;
}
.btw-message.user {
  justify-content: flex-end;
}
.btw-message.user span {
  background: var(--app-bubble-user);
}
.btw-panel__composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--app-border-subtle);
}
.btw-panel__composer textarea {
  min-width: 0;
  flex: 1;
  resize: none;
  border: 1px solid var(--app-chat-input-island-border);
  border-radius: 8px;
  padding: 8px 10px;
  outline: none;
  color: var(--app-text-primary);
  background: transparent;
  font-size: 13px;
}
.btw-panel__composer textarea:focus {
  border-color: #07c160;
}
.btw-panel__composer button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 8px;
  color: white;
  background: #07c160;
}
.btw-panel__composer button:disabled {
  opacity: 0.45;
}
.btw-panel__composer svg {
  width: 16px;
}
.spin {
  animation: btw-spin 0.8s linear infinite;
}
@keyframes btw-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 767px) {
  .btw-panel {
    position: absolute;
    z-index: 40;
    inset: 0;
    width: 100%;
    min-width: 0;
    border-left: 0;
  }
}
</style>
