<template>
  <div class="flex flex-col h-full w-full" style="background: var(--app-chat-bg)" v-if="session">
    <ChatViewHeader
      v-model:title="sessionTitle"
      :title-readonly="!!session.meta?.builtin"
      :agent-name="agentName"
      :agent-id="agentId"
      :status-key="headerStatusKey"
      :show-back="showBack"
      :search-open="searchOpen"
      @back="emit('back')"
      @view-agent="emit('view-agent', $event)"
      @open-menu="sessionMenuOpen = true"
      @close-search="closeSearch"
      @save-title="saveSessionTitle"
    />

    <ChatSearchBar
      v-if="searchOpen"
      v-model:query="searchQuery"
      :hit-count="searchHitCount"
      ref="searchBarRef"
    />

    <ChatMessageList
      ref="messageListRef"
      :session-id="session.id"
      :groups="visibleGroups"
      :show-thinking-blocks="showThinking"
      :is-streaming="isStreaming"
      :streaming-group-id="streamingAssistantId"
      :show-streaming-placeholder="showStreamingPlaceholder"
      :streaming-time-label="streamingTimeLabel"
      :search-open="searchOpen"
      :search-query="searchQuery"
      :assistant-avatar-label="session.meta?.builtin ? 'π' : 'P'"
      @open-tool="openToolDetail"
      @open-bash="openBashDetail"
      @open-compaction="openCompactionDetail"
      @navigate="navigateToSubagent"
      @answered="onAskAnswered"
    />

    <ChatInputPanel
      ref="inputPanelRef"
      v-model="inputText"
      :workspace-id="workspaceId"
      :agent-id="agentId"
      :disabled="inputDisabled"
      :placeholder="inputPlaceholder"
      @send="sendMessage"
    />

    <ChatSessionMenu
      :open="sessionMenuOpen"
      :agent-name="agentName ?? session.meta?.name ?? 'Agent'"
      :muted="sessionMuted"
      :show-thinking="showThinking"
      :session-status="session.status"
      :git-branch="gitBranch"
      :can-complete="canCompleteSession"
      :can-checkpoint="canCheckpointActions"
      :child-sessions="childSessions"
      @close="sessionMenuOpen = false"
      @search="openSearchFromMenu"
      @log="showLogPanel = true"
      @complete="onCompleteSession"
      @checkpoint="onCreateCheckpoint"
      @rewind="onRewindSession"
      @commit="onCommitSession"
      @btw="onCreateBtw"
      @navigate="navigateToSubagent"
      @update:muted="onMutedChange"
      @update:show-thinking="onShowThinkingChange"
    />

    <SessionLogPanel v-if="showLogPanel" :session-id="session.id" @close="showLogPanel = false" />

    <ToolDetailModal
      :open="!!toolModal"
      :title="toolModal?.title ?? ''"
      :sections="toolModal?.sections ?? []"
      @close="toolModal = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onBeforeUnmount } from "vue";
import { useSessionStore, useAgentStore } from "@/store";
import * as api from "@/api";
import type { ChatCompactionEntry, ChatEntry } from "@/types/chat-entry";
import {
  buildDisplayGroups,
  isGroupedAssistantGroup,
  type DisplayGroup,
} from "../utils/flatten-messages";
import {
  applyAgentEventToChatEntries,
  createStreamingAssistantEntry,
  createUserChatEntry,
  sessionTreeToChatEntries,
} from "../utils/session-entries";
import { buildToolModal, buildBashModal } from "../utils/tool-detail";
import ToolDetailModal from "../components/ToolDetailModal.vue";
import ChatInputPanel from "../components/ChatInputPanel.vue";
import ChatSessionMenu from "../components/ChatSessionMenu.vue";
import SessionLogPanel from "../components/SessionLogPanel.vue";
import ChatViewHeader from "../components/chat/ChatViewHeader.vue";
import ChatSearchBar from "../components/chat/ChatSearchBar.vue";
import ChatMessageList from "../components/chat/ChatMessageList.vue";
import type { ChatSendPayload } from "@/types/chat-compose";
import { getShowThinking, setShowThinking } from "../composables/use-chat-session-prefs";
import { notifyAskUserInput, notifyMessageComplete } from "../composables/use-push-notifications";
import { findPendingAskInDisplayGroups } from "../utils/ask-tool";

const props = defineProps<{
  session: {
    id: string;
    status: string;
    parentId?: string | null;
    meta?: {
      name?: string;
      builtin?: boolean;
      git?: { branch?: string; worktreeEnabled?: boolean; mergeError?: string };
    };
    workspaceId?: string;
    pinned?: boolean;
    muted?: boolean;
  };
  agentId?: string;
  showBack?: boolean;
}>();

const emit = defineEmits<{
  navigate: [sessionId: string];
  back: [];
  "view-agent": [agentId: string];
}>();

const sessionStore = useSessionStore();
const agentStore = useAgentStore();

const agentName = computed(() => {
  if (!props.agentId) return null;
  return agentStore.getAgentById(props.agentId)?.name ?? props.agentId;
});

const inputText = ref("");
const inputPanelRef = ref<InstanceType<typeof ChatInputPanel> | null>(null);
const messageListRef = ref<InstanceType<typeof ChatMessageList> | null>(null);
const searchBarRef = ref<InstanceType<typeof ChatSearchBar> | null>(null);
const sessionTitle = ref("");
const chatEntries = ref<ChatEntry[]>([]);
const toolModal = ref<{ title: string; sections: { label: string; content: string }[] } | null>(
  null,
);
const isStreaming = ref(false);
const streamingAssistantId = ref<string | null>(null);
const sessionMenuOpen = ref(false);
const showLogPanel = ref(false);
const searchOpen = ref(false);
const searchQuery = ref("");
let streamCleanup: (() => void) | null = null;

const workspaceId = computed(() => props.session.workspaceId ?? "");
const sessionMuted = computed(() => !!props.session.muted);
const showThinking = ref(false);

const terminalStatuses = new Set(["finish", "error", "stopped"]);

const inputDisabled = computed(
  () => isStreaming.value || terminalStatuses.has(props.session.status),
);

const inputPlaceholder = computed(() => {
  if (props.session.status === "finish") return "会话已完成";
  if (props.session.status === "error") return "会话出错，请查看菜单中的合并状态";
  if (props.session.status === "stopped") return "会话已停止";
  if (isStreaming.value) return "正在回复…";
  return "输入消息";
});

const gitBranch = computed(() => {
  const git = props.session.meta?.git;
  if (!git || typeof git !== "object") return null;
  return typeof git.branch === "string" ? git.branch : null;
});

const childSessions = computed(() =>
  sessionStore.sessions.filter((session) => session.parentId === props.session.id),
);

async function onCreateBtw() {
  const child = await sessionStore.createBtwSession(props.session.id);
  sessionMenuOpen.value = false;
  emit("navigate", child.id);
}

const canCompleteSession = computed(() => {
  if (props.session.meta?.builtin || props.session.parentId) return false;
  const git = props.session.meta?.git;
  if (!git || typeof git !== "object") return false;
  if (git.worktreeEnabled === false) return false;
  return !terminalStatuses.has(props.session.status);
});

const canCheckpointActions = computed(() => {
  if (props.session.meta?.builtin) return false;
  if (isStreaming.value) return false;
  return props.session.status === "idle" || props.session.status === "starting";
});

watch(
  () => props.session.meta?.name,
  (name) => {
    if (name) sessionTitle.value = name;
  },
);

watch(
  () => props.session.id,
  (id) => {
    showThinking.value = getShowThinking(id);
  },
  { immediate: true },
);

function stopStreaming() {
  streamCleanup?.();
  streamCleanup = null;
  isStreaming.value = false;
  streamingAssistantId.value = null;
}

async function reloadMessagesFromServer(sessionId: string) {
  await sessionStore.fetchSessionMessages(sessionId);
  const entries = sessionStore.messages[sessionId] ?? [];
  chatEntries.value = sessionTreeToChatEntries(entries);
}

async function loadSessionMessages(sessionId: string) {
  stopStreaming();
  await reloadMessagesFromServer(sessionId);
  sessionTitle.value = props.session.meta?.name ?? `Session ${sessionId.substring(0, 8)}`;
  toolModal.value = null;
  searchOpen.value = false;
  searchQuery.value = "";
  sessionMenuOpen.value = false;
}

async function saveSessionTitle() {
  if (props.session.meta?.builtin) return;
  const name = sessionTitle.value.trim();
  if (!name) return;
  await sessionStore.updateSessionMeta(props.session.id, { name });
}

function openSearch() {
  searchOpen.value = true;
  sessionMenuOpen.value = false;
  void nextTick(() => searchBarRef.value?.focus());
}

function openSearchFromMenu() {
  sessionMenuOpen.value = false;
  openSearch();
}

function closeSearch() {
  searchOpen.value = false;
  searchQuery.value = "";
}

async function onMutedChange(muted: boolean) {
  await sessionStore.updateSessionMeta(props.session.id, { muted });
}

function onShowThinkingChange(value: boolean) {
  showThinking.value = value;
  setShowThinking(props.session.id, value);
}

async function onCompleteSession() {
  sessionMenuOpen.value = false;
  if (!canCompleteSession.value || isStreaming.value) return;
  const confirmed = window.confirm(
    "完成会话将把 worktree 分支合并到主分支，并关闭此会话。请先提交所有变更。继续？",
  );
  if (!confirmed) return;
  stopStreaming();
  try {
    await sessionStore.completeSession(props.session.id);
    await sessionStore.fetchSession(props.session.id);
    sessionTitle.value = props.session.meta?.name ?? sessionTitle.value;
  } catch (err) {
    console.error("Complete session failed:", err);
    await sessionStore.fetchSession(props.session.id);
  }
}

async function onCreateCheckpoint() {
  sessionMenuOpen.value = false;
  if (!canCheckpointActions.value) return;
  const label = window.prompt("存档点名称（可选）") ?? undefined;
  try {
    await sessionStore.createCheckpoint(props.session.id, label?.trim() || undefined);
    window.alert("存档点已创建");
  } catch (err) {
    console.error("Create checkpoint failed:", err);
    window.alert(err instanceof Error ? err.message : "创建存档点失败");
  }
}

async function onRewindSession() {
  sessionMenuOpen.value = false;
  if (!canCheckpointActions.value) return;
  try {
    const checkpoints = await sessionStore.listCheckpoints(props.session.id);
    if (checkpoints.length === 0) {
      window.alert("没有可用的存档点");
      return;
    }
    const lines = checkpoints.map((cp, index) => {
      const when = new Date(cp.createdAt).toLocaleString();
      const label = cp.label ? ` ${cp.label}` : "";
      return `${index + 1}. ${when}${label}`;
    });
    const choice = window.prompt(`选择要回滚的存档点编号：\n${lines.join("\n")}`);
    const index = Number(choice) - 1;
    if (!Number.isFinite(index) || index < 0 || index >= checkpoints.length) return;
    const target = checkpoints[index]!;
    const confirmed = window.confirm(
      `回滚到存档点 ${target.label ?? target.id.slice(0, 8)}？将恢复代码与会话位置。`,
    );
    if (!confirmed) return;
    stopStreaming();
    await sessionStore.rewindSession(props.session.id, target.id);
    await reloadMessagesFromServer(props.session.id);
  } catch (err) {
    console.error("Rewind failed:", err);
    window.alert(err instanceof Error ? err.message : "回滚失败");
  }
}

async function onCommitSession() {
  sessionMenuOpen.value = false;
  if (!canCheckpointActions.value) return;
  const message = window.prompt("提交说明（可选）") ?? undefined;
  try {
    const result = await sessionStore.commitSession(props.session.id, message?.trim() || undefined);
    if (!result.commit) {
      window.alert("没有需要提交的变更");
      return;
    }
    window.alert(`已提交：${result.commit.hash} ${result.commit.message}`);
  } catch (err) {
    console.error("Commit failed:", err);
    window.alert(err instanceof Error ? err.message : "提交失败");
  }
}

async function scrollToBottom() {
  await messageListRef.value?.scrollToBottom();
}

watch(
  () => props.session.id,
  (id) => {
    void loadSessionMessages(id).then(() => scrollToBottom());
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopStreaming();
});

const displayGroups = computed(() => buildDisplayGroups(chatEntries.value));

const pendingAsk = computed(() => findPendingAskInDisplayGroups(displayGroups.value));

const headerStatusKey = computed(() => {
  if (isStreaming.value) return "running";
  if (props.session.status === "waiting_user" || pendingAsk.value) return "waiting_user";
  return props.session.status;
});

const lastNotifiedAskId = ref<string | null>(null);

watch(pendingAsk, (ask, prev) => {
  if (!!ask !== !!prev) {
    void sessionStore.fetchSession(props.session.id);
  }
  if (!ask) {
    lastNotifiedAskId.value = null;
    return;
  }
  if (ask.toolCallId === lastNotifiedAskId.value) return;
  lastNotifiedAskId.value = ask.toolCallId;
  notifyAskUserInput({
    sessionId: props.session.id,
    sessionName: props.session.meta?.name ?? sessionTitle.value,
    prompt: ask.prompt,
    muted: sessionMuted.value,
  });
});

const visibleGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!searchOpen.value || !q) return displayGroups.value;
  return displayGroups.value.filter((group) => groupMatchesSearch(group, q));
});

const searchHitCount = computed(() => visibleGroups.value.length);

function groupMatchesSearch(group: DisplayGroup, q: string): boolean {
  if (group.type === "message" && group.message) {
    const content = group.message.content;
    if (
      typeof content === "object" &&
      content !== null &&
      !Array.isArray(content) &&
      content.type === "file"
    ) {
      return content.name.toLowerCase().includes(q);
    }
    if (typeof content === "string") return content.toLowerCase().includes(q);
    if (Array.isArray(content)) {
      return content.some((p) => p.type === "text" && p.text.toLowerCase().includes(q));
    }
  }
  if (group.type === "grouped_assistant") {
    return group.pieces.some(
      (p) =>
        (p.kind === "text" && p.text.toLowerCase().includes(q)) ||
        (p.kind === "thinking" && p.text.toLowerCase().includes(q)),
    );
  }
  if (group.type === "compaction") return group.summary.toLowerCase().includes(q);
  if (group.type === "system") return group.content.toLowerCase().includes(q);
  return false;
}

const streamingTimeLabel = computed(() =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
);

const showStreamingPlaceholder = computed(() => {
  if (!isStreaming.value || !streamingAssistantId.value) return false;
  const id = streamingAssistantId.value;
  const group = displayGroups.value.find(
    (g): g is Extract<DisplayGroup, { type: "grouped_assistant" }> =>
      isGroupedAssistantGroup(g) && g.id === id,
  );
  return !group;
});

function openToolDetail(
  toolName: string,
  callArgs?: Record<string, unknown>,
  resultContent?: Array<{ type: string; text: string }>,
) {
  toolModal.value = buildToolModal(toolName, callArgs, resultContent);
}

function openBashDetail(
  command: string,
  resultContent?: Array<{ type: string; text: string }>,
  intent?: string,
) {
  toolModal.value = buildBashModal(command, resultContent, intent);
}

function openCompactionDetail(entry: ChatCompactionEntry) {
  const sections: { label: string; content: string; markdown?: boolean }[] = [
    { label: "压缩摘要", content: entry.summary, markdown: true },
  ];
  if (entry.details?.readFiles?.length) {
    sections.push({
      label: "read-files（CompactionEntry.details）",
      content: entry.details.readFiles.join("\n"),
    });
  }
  if (entry.details?.modifiedFiles?.length) {
    sections.push({
      label: "modified-files（CompactionEntry.details）",
      content: entry.details.modifiedFiles.join("\n"),
    });
  }
  sections.push({
    label: "元数据",
    content: [
      `tokensBefore: ${entry.tokensBefore}`,
      `firstKeptEntryId: ${entry.firstKeptEntryId}`,
      `reason: ${entry.reason ?? "threshold"}`,
      `entry.id: ${entry.id}`,
    ].join("\n"),
  });
  toolModal.value = { title: "上下文压缩摘要", sections };
}

function navigateToSubagent(sessionId: string) {
  emit("navigate", sessionId);
}

function onAskAnswered() {
  void sessionStore.fetchSession(props.session.id);
  if (isStreaming.value) {
    void scrollToBottom();
    return;
  }
  attachToRunningSession();
}

function attachToRunningSession() {
  if (isStreaming.value) return;

  const groups = displayGroups.value;
  const lastAssistant = [...groups]
    .reverse()
    .find(
      (g): g is Extract<DisplayGroup, { type: "grouped_assistant" }> =>
        g.type === "grouped_assistant",
    );
  const assistantId = streamingAssistantId.value ?? lastAssistant?.id ?? `stream-${Date.now()}`;

  if (!lastAssistant) {
    chatEntries.value.push(createStreamingAssistantEntry(assistantId));
  }

  streamingAssistantId.value = assistantId;
  isStreaming.value = true;

  streamCleanup = api.subscribeSessionEvents(
    props.session.id,
    (payload) => {
      if (payload.type !== "agent" || !payload.event) return;
      applyAgentEventToChatEntries(chatEntries.value, assistantId, payload.event);
      void scrollToBottom();
      if (payload.event.type === "agent_end") {
        stopStreaming();
        void reloadMessagesFromServer(props.session.id).then(() => scrollToBottom());
        void sessionStore.fetchSessions();
      }
    },
    (err) => console.error("Session events error:", err),
  );
}

async function sendStreamReply(userText: string, images: ChatSendPayload["images"]) {
  const assistantId = `stream-${Date.now()}`;
  streamingAssistantId.value = assistantId;
  isStreaming.value = true;

  chatEntries.value.push(createStreamingAssistantEntry(assistantId));
  void scrollToBottom();

  const imagePayload = images.map((img) => ({ mimeType: img.mimeType, data: img.data }));
  const sessionName = props.session.meta?.name ?? "会话";

  streamCleanup = api.promptSession(
    props.session.id,
    userText,
    (event) => {
      applyAgentEventToChatEntries(chatEntries.value, assistantId, event);
      void scrollToBottom();
    },
    (err) => {
      console.error("Stream error:", err);
    },
    () => {
      isStreaming.value = false;
      streamingAssistantId.value = null;
      streamCleanup = null;
      void reloadMessagesFromServer(props.session.id).then(() => scrollToBottom());
      void sessionStore.fetchSessions();
      notifyMessageComplete({
        sessionId: props.session.id,
        sessionName,
        muted: sessionMuted.value,
        preview: userText,
      });
    },
    imagePayload.length ? imagePayload : undefined,
  );
}

const sendMessage = (payload: ChatSendPayload) => {
  const text = payload.text.trim();
  if ((!text && !payload.images.length) || inputDisabled.value) return;

  chatEntries.value.push(createUserChatEntry(Date.now().toString(), text || " "));
  inputText.value = "";
  inputPanelRef.value?.clearAfterSend();
  void scrollToBottom();
  void sendStreamReply(text, payload.images);
};
</script>
