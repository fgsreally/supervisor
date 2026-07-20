<template>
  <div class="flex flex-col h-full w-full" style="background: var(--app-chat-bg)" v-if="session">
    <ChatViewHeader
      v-model:title="sessionTitle"
      :title-readonly="!!session.meta?.builtin"
      :agent-name="agentName"
      :agent-id="agentId"
      :status-key="headerStatusKey"
      :workflow="workflow"
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

    <div v-if="taskCount" class="task-strip">
      <button class="task-tag" type="button" @click="taskPaneOpen = !taskPaneOpen">
        <span>任务视窗</span>
        <span class="task-tag__types">{{ taskTypeSummary }}</span>
        <span class="task-tag__count">{{ taskCount }}</span>
      </button>
    </div>

    <div class="chat-workspace">
      <div class="chat-workspace__conversation">
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

        <div v-if="suggestedQuestions.length" class="suggested-questions">
          <span>你可能还想问</span>
          <button
            v-for="question in suggestedQuestions"
            :key="question"
            type="button"
            @click="selectSuggestedQuestion(question)"
          >
            {{ question }}
          </button>
        </div>

        <div v-if="isStreaming" class="streaming-send-mode">
          <span>回复进行中，发送方式</span>
          <select v-model="streamingSendMode">
            <option value="steer">立即干预（中断当前回复）</option>
            <option value="follow_up">轮后追加</option>
          </select>
        </div>

        <ChatInputPanel
          ref="inputPanelRef"
          v-model="inputText"
          :session-id="session.id"
          :workspace-id="workspaceId"
          :agent-id="agentId"
          :disabled="inputDisabled"
          :placeholder="inputPlaceholder"
          @send="sendMessage"
          @slash="executeCustomSlash"
        />
      </div>

      <TaskWorkspacePanel
        v-if="taskPaneOpen && taskCount"
        :tasks="tasks"
        :todos="activeTodos"
        :selected-path="selectedTaskPath"
        @select="selectedTaskPath = $event"
        @close="taskPaneOpen = false"
      />
    </div>

    <ExternalAgentCommandHost
      ref="externalCommandHostRef"
      :session-id="session.id"
      :backend-type="agentBackendType"
      @insert="insertExternalAgentText"
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
import { useSessionStore, useAgentStore, useProviderStore } from "@/store";
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
import ExternalAgentCommandHost from "../components/external-agents/ExternalAgentCommandHost.vue";
import ChatSessionMenu from "../components/ChatSessionMenu.vue";
import SessionLogPanel from "../components/SessionLogPanel.vue";
import ChatViewHeader from "../components/chat/ChatViewHeader.vue";
import ChatSearchBar from "../components/chat/ChatSearchBar.vue";
import ChatMessageList from "../components/chat/ChatMessageList.vue";
import TaskWorkspacePanel from "../components/chat/TaskWorkspacePanel.vue";
import type { ChatSendPayload } from "@/types/chat-compose";
import { getShowThinking, setShowThinking } from "../composables/use-chat-session-prefs";
import { notifyAskUserInput, notifyMessageComplete } from "../composables/use-push-notifications";
import { findPendingAskInDisplayGroups } from "../utils/ask-tool";
import { parseWorkflowState } from "../utils/workflow";

const props = defineProps<{
  session: {
    id: string;
    status: string;
    parentId?: string | null;
    meta?: {
      name?: string;
      builtin?: boolean;
      shadowSuggestedQuestions?: string[];
      git?: { branch?: string; worktreeEnabled?: boolean; mergeError?: string };
      workflow?: { stage: string; status: string };
    };
    workspaceId?: string;
    pinned?: boolean;
    muted?: boolean;
    currentTask?: string | null;
  };
  agentId?: string;
  showBack?: boolean;
}>();

const emit = defineEmits<{
  navigate: [sessionId: string];
  back: [];
  "view-agent": [agentId: string];
}>();

const workflow = computed(() => parseWorkflowState(props.session.meta));

const sessionStore = useSessionStore();
const agentStore = useAgentStore();
const providerStore = useProviderStore();

const agentName = computed(() => {
  if (!props.agentId) return null;
  return agentStore.getAgentById(props.agentId)?.name ?? props.agentId;
});
const agentBackendType = computed(() =>
  props.agentId ? agentStore.getAgentById(props.agentId)?.backendType : undefined,
);

const inputText = ref("");
const suggestedQuestions = ref<string[]>([]);
const inputPanelRef = ref<InstanceType<typeof ChatInputPanel> | null>(null);
const externalCommandHostRef = ref<InstanceType<typeof ExternalAgentCommandHost> | null>(null);
const messageListRef = ref<InstanceType<typeof ChatMessageList> | null>(null);
const searchBarRef = ref<InstanceType<typeof ChatSearchBar> | null>(null);
const sessionTitle = ref("");
const chatEntries = ref<ChatEntry[]>([]);
const toolModal = ref<{ title: string; sections: { label: string; content: string }[] } | null>(
  null,
);
const isStreaming = ref(false);
const streamingSendMode = ref<"steer" | "follow_up">("follow_up");
const streamingAssistantId = ref<string | null>(null);
const sessionMenuOpen = ref(false);
const showLogPanel = ref(false);
const searchOpen = ref(false);
const searchQuery = ref("");
const tasks = ref<api.TaskArtifact[]>([]);
const todos = ref<api.TodoItem[]>([]);
const selectedTaskPath = ref<string | null>(null);
const taskPaneOpen = ref(false);
let streamCleanup: (() => void) | null = null;
let shadowSuggestionCleanup: (() => void) | null = null;

const workspaceId = computed(() => props.session.workspaceId ?? "");
const sessionMuted = computed(() => !!props.session.muted);
const showThinking = ref(false);
const activeTodos = computed(() =>
  todos.value.length > 0 && !todos.value.every((todo) => todo.status === "done") ? todos.value : [],
);
const taskCount = computed(() => tasks.value.length + (activeTodos.value.length ? 1 : 0));
const taskTypeSummary = computed(() =>
  [
    ...new Set([
      ...tasks.value.map((task) => ({ goal: "Goal", plan: "Plan" })[task.type]),
      ...(activeTodos.value.length ? ["Todo"] : []),
    ]),
  ].join(" / "),
);

const terminalStatuses = new Set(["finish", "error", "stopped"]);

const providerDisabled = computed(() => {
  if (!props.agentId) return false;
  const providerId = agentStore.getAgentById(props.agentId)?.providerId;
  if (!providerId) return false;
  return providerStore.getProviderById(providerId)?.isEnabled === false;
});

const inputDisabled = computed(
  () => providerDisabled.value || terminalStatuses.has(props.session.status),
);

const inputPlaceholder = computed(() => {
  if (providerDisabled.value) return "模型供应商已禁用，无法发送消息";
  if (props.session.status === "finish") return "会话已完成";
  if (props.session.status === "error") return "会话出错，请查看菜单中的合并状态";
  if (props.session.status === "stopped") return "会话已停止";
  if (isStreaming.value)
    return streamingSendMode.value === "steer" ? "输入立即干预内容" : "输入轮后追加内容";
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
  const [, queuedInputs, nextTasks, nextTodos] = await Promise.all([
    sessionStore.fetchSessionMessages(sessionId),
    api.getQueuedSessionInputs(sessionId).catch(() => []),
    api.getSessionTasks(sessionId).catch(() => []),
    api.getSessionTodos(sessionId).catch(() => []),
  ]);
  const entries = sessionStore.messages[sessionId] ?? [];
  chatEntries.value = [
    ...sessionTreeToChatEntries(entries),
    ...queuedInputs
      .filter((input) => input.source === null)
      .map((input) => {
        const entry = createUserChatEntry(`queued-${input.id}`, input.message, "queued");
        entry.createdAt = input.enqueuedAt;
        return entry;
      }),
  ];
  tasks.value = nextTasks;
  todos.value = nextTodos;
  const todoActive = nextTodos.length > 0 && !nextTodos.every((todo) => todo.status === "done");
  const preferredPath = props.session.currentTask;
  const selectionExists =
    nextTasks.some((task) => task.path === selectedTaskPath.value) ||
    (selectedTaskPath.value === "$todo" && todoActive);
  if (!selectedTaskPath.value || !selectionExists) {
    selectedTaskPath.value =
      preferredPath && nextTasks.some((task) => task.path === preferredPath)
        ? preferredPath
        : (nextTasks[0]?.path ?? (todoActive ? "$todo" : null));
  }
  if (nextTasks.length === 0 && !todoActive) taskPaneOpen.value = false;
}

async function loadSessionMessages(sessionId: string) {
  stopStreaming();
  await reloadMessagesFromServer(sessionId);
  sessionTitle.value = props.session.meta?.name ?? `Session ${sessionId.substring(0, 8)}`;
  toolModal.value = null;
  searchOpen.value = false;
  searchQuery.value = "";
  sessionMenuOpen.value = false;
  suggestedQuestions.value = Array.isArray(props.session.meta?.shadowSuggestedQuestions)
    ? props.session.meta.shadowSuggestedQuestions.filter(
        (question): question is string =>
          typeof question === "string" && question.trim().length > 0,
      )
    : [];
}

function subscribeShadowSuggestions(sessionId: string) {
  shadowSuggestionCleanup?.();
  shadowSuggestionCleanup = api.subscribeSessionEvents(
    sessionId,
    (payload) => {
      if (payload.type !== "agent" || payload.event?.type !== "shadow_suggestions") return;
      suggestedQuestions.value = payload.event.questions;
    },
    (error) => console.error("Shadow suggestion events error:", error),
  );
}

function selectSuggestedQuestion(question: string) {
  inputText.value = question;
  void nextTick(() => inputPanelRef.value?.focus());
}

function insertExternalAgentText(text: string) {
  inputText.value = text;
  void nextTick(() => inputPanelRef.value?.focus());
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
    subscribeShadowSuggestions(id);
    void loadSessionMessages(id).then(() => scrollToBottom());
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopStreaming();
  shadowSuggestionCleanup?.();
  shadowSuggestionCleanup = null;
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
      if (payload.event.type === "shadow_suggestions") return;
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

const sendMessage = async (payload: ChatSendPayload) => {
  const text = payload.text.trim();
  if ((!text && !payload.images.length) || inputDisabled.value) return;
  suggestedQuestions.value = [];

  if (!payload.images.length && externalCommandHostRef.value?.handleCommand(text)) {
    inputText.value = "";
    inputPanelRef.value?.clearAfterSend();
    return;
  }

  const slash = !payload.images.length ? /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text) : null;
  if (slash) {
    const commands = await api.getSessionCommands(props.session.id).catch(() => []);
    const command = commands.find(
      (item) => item.source === "custom" && item.name === slash[1]!.toLowerCase(),
    );
    if (command) {
      inputText.value = "";
      inputPanelRef.value?.clearAfterSend();
      try {
        await api.executeSessionCommand(props.session.id, command.name, slash[2]);
        await reloadMessagesFromServer(props.session.id);
        await sessionStore.fetchSessions();
      } catch (error) {
        console.error("Slash command failed:", error);
      }
      return;
    }
  }

  const userEntry = createUserChatEntry(
    Date.now().toString(),
    text || " ",
    isStreaming.value && streamingSendMode.value === "follow_up" ? "queued" : undefined,
  );
  chatEntries.value.push(userEntry);
  inputText.value = "";
  inputPanelRef.value?.clearAfterSend();
  void scrollToBottom();
  if (isStreaming.value) {
    const images = payload.images.map((image) => ({ mimeType: image.mimeType, data: image.data }));
    const send =
      streamingSendMode.value === "steer"
        ? api.steerSession(props.session.id, text, images)
        : api.followUpSession(props.session.id, text, images);
    void send
      .then((result) => {
        if ("disposition" in result && result.disposition !== "queued") {
          userEntry.deliveryState = undefined;
        }
      })
      .catch((error) => {
        userEntry.deliveryState = "failed";
        console.error("Send during streaming failed:", error);
      });
    return;
  }
  void sendStreamReply(text, payload.images);
};

async function executeCustomSlash(name: string) {
  try {
    await api.executeSessionCommand(props.session.id, name);
  } catch (error) {
    console.error("Slash command failed:", error);
  } finally {
    await reloadMessagesFromServer(props.session.id);
    await sessionStore.fetchSessions();
  }
}
</script>

<style scoped>
.task-strip {
  padding: 7px 12px 0;
}

.task-tag {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--app-chat-input-island-border);
  border-radius: 999px;
  padding: 5px 10px;
  background: var(--app-chat-bg);
  color: inherit;
  cursor: pointer;
  font-size: 12px;
}

.task-tag__types {
  color: var(--app-text-muted);
}

.task-tag__count {
  display: grid;
  min-width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 999px;
  background: var(--app-chat-input-island-border);
  font-size: 11px;
}

.chat-workspace {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1;
}

.chat-workspace__conversation {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.streaming-send-mode {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 4px 12px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.suggested-questions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.suggested-questions button {
  border: 1px solid var(--app-chat-input-island-border);
  border-radius: 999px;
  padding: 5px 10px;
  background: var(--app-chat-bg);
  color: var(--app-text-primary);
}

.suggested-questions button:hover {
  background: var(--app-hover);
}

.streaming-send-mode select {
  border: 1px solid var(--app-chat-input-island-border);
  border-radius: 6px;
  padding: 3px 6px;
  background: var(--app-chat-bg);
  color: inherit;
}
</style>
