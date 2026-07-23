<template>
  <div
    class="relative flex flex-col h-full w-full"
    style="background: var(--app-chat-bg)"
    v-if="session"
  >
    <ChatViewHeader
      :title="sessionTitle"
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
    >
      <template #actions>
        <div class="desktop-session-actions">
          <button class="chat-header-action" type="button" title="搜索消息" @click="openSearch">
            <Search class="h-[17px] w-[17px]" />
          </button>
          <button
            class="chat-header-action"
            type="button"
            title="查看会话日志"
            @click="showLogPanel = true"
          >
            <ScrollText class="h-[17px] w-[17px]" />
          </button>
          <SessionCommitPopover :session-id="session.id" />
          <button
            v-if="tasks.length"
            class="chat-header-action context-count"
            type="button"
            :title="`任务 · ${taskTypeSummary}`"
            @click="taskPaneOpen = !taskPaneOpen"
          >
            <ClipboardList class="h-[17px] w-[17px]" /><span>{{ tasks.length }}</span>
          </button>
          <SessionTodoPopover v-if="activeTodos.length" :todos="activeTodos" />
          <SessionChangesPopover v-if="sessionChangedFiles.length" :files="sessionChangedFiles" />
        </div>
        <SessionJobsPopover :session-id="session.id" @detail="openJobDetail" />
        <button
          v-if="hasEvalActivity"
          class="chat-header-action"
          type="button"
          title="查看 Eval"
          @click="openEvalPanel"
        >
          <Braces class="h-[17px] w-[17px]" />
        </button>
        <div class="mobile-session-actions">
          <SessionTodoPopover v-if="activeTodos.length" :todos="activeTodos" />
          <SessionChangesPopover v-if="sessionChangedFiles.length" :files="sessionChangedFiles" />
          <button
            class="chat-header-action"
            type="button"
            title="会话工具"
            @click="sessionActionsOpen = true"
          >
            <SlidersHorizontal class="h-[18px] w-[18px]" />
          </button>
        </div>
      </template>
    </ChatViewHeader>

    <ChatSearchBar
      v-if="searchOpen"
      v-model:query="searchQuery"
      :hit-count="searchHitCount"
      ref="searchBarRef"
    />

    <div class="chat-workspace">
      <div class="chat-workspace__conversation">
        <div v-if="sessionLoading && !chatEntries.length" class="session-loading">
          <Loader2 /><span>正在加载聊天记录...</span>
        </div>
        <button
          v-else-if="hasOlderGroups"
          type="button"
          class="load-older-messages"
          @click="historyLimit += 80"
        >
          查看更早的消息
        </button>
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
          :assistant-avatar-label="session.meta?.builtin ? 'π' : sessionAvatarValue.text"
          :assistant-avatar-color="sessionAvatarValue.color"
          :assistant-avatar-icon="session.meta?.builtin ? null : sessionAvatarValue.icon"
          :assistant-avatar-agent-id="agentId ?? session.id"
          :rewindable-entry-ids="rewindableEntryIds"
          :retrying="retryingError"
          @open-tool="openToolDetail"
          @open-bash="openBashDetail"
          @open-compaction="openCompactionDetail"
          @navigate="navigateToSubagent"
          @answered="onAskAnswered"
          @rewind="rewindToMessage"
          @fork="forkFromMessage"
          @retry-error="onRetryLlmError"
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
          :interrupting="isStreaming"
          :placeholder="inputPlaceholder"
          :empty-state-title="modelMissing ? '需要先配置模型' : undefined"
          :empty-state-description="modelMissing ? '选择模型后即可继续这段对话' : undefined"
          :empty-state-action="modelMissing ? '选择模型' : undefined"
          @send="sendMessage"
          @interrupt="interruptCurrentTurn"
          @slash="executeCustomSlash"
          @empty-action="openModelPicker"
          @btw="onCreateBtw"
        />
      </div>

      <Transition name="chat-panel" :duration="{ enter: 360, leave: 280 }">
        <div v-if="taskPaneOpen && tasks.length" class="chat-panel-host">
          <TaskWorkspacePanel
            class="chat-panel-host__body"
            :tasks="tasks"
            :todos="[]"
            :selected-path="selectedTaskPath"
            @select="selectedTaskPath = $event"
            @close="taskPaneOpen = false"
          />
        </div>
      </Transition>
      <Transition name="chat-panel" :duration="{ enter: 360, leave: 280 }">
        <div v-if="btwPanelOpen" class="chat-panel-host">
          <BtwSplitPanel
            class="chat-panel-host__body"
            :parent-id="session.id"
            :sessions="btwSessions"
            @close="btwPanelOpen = false"
          />
        </div>
      </Transition>
      <Transition name="chat-panel" :duration="{ enter: 360, leave: 280 }">
        <div v-if="showLogPanel" class="chat-panel-host">
          <SessionLogPanel
            class="chat-panel-host__body chat-workspace__side-panel"
            :session-id="session.id"
            @close="showLogPanel = false"
          />
        </div>
      </Transition>
      <Transition name="chat-panel" :duration="{ enter: 360, leave: 280 }">
        <div v-if="toolPanel" class="chat-panel-host">
          <ToolDetailPanel
            class="chat-panel-host__body chat-workspace__tool-panel"
            :title="toolPanel.title"
            :sections="toolPanel.sections"
            :terminal="toolPanel.terminal"
            :session-id="session.id"
            @close="toolPanel = null"
          />
        </div>
      </Transition>
    </div>

    <ExternalAgentCommandHost
      ref="externalCommandHostRef"
      :session-id="session.id"
      :backend-type="agentBackendType"
      @insert="insertExternalAgentText"
    />

    <Teleport to="body">
      <Transition name="chat-sheet" :duration="{ enter: 300, leave: 180 }">
        <div
          v-if="sessionActionsOpen"
          class="mobile-actions-backdrop"
          @click.self="sessionActionsOpen = false"
        >
          <section class="mobile-actions-sheet">
            <div class="mobile-actions-handle" />
            <div class="mobile-actions-grid">
              <button type="button" @click="runMobileAction(openSearch)">
                <Search /><span>搜索</span>
              </button>
              <button
                type="button"
                @click="
                  runMobileAction(() => {
                    showLogPanel = true;
                  })
                "
              >
                <ScrollText /><span>日志</span>
              </button>
              <button
                v-if="tasks.length"
                type="button"
                @click="
                  runMobileAction(() => {
                    taskPaneOpen = true;
                  })
                "
              >
                <ClipboardList /><span>任务</span>
              </button>
            </div>
            <button class="mobile-actions-cancel" type="button" @click="sessionActionsOpen = false">
              取消
            </button>
          </section>
        </div>
      </Transition>
    </Teleport>

    <ChatSessionMenu
      :open="sessionMenuOpen"
      :agent-name="agentName ?? session.meta?.name ?? 'Agent'"
      :session-title="sessionTitle"
      :title-readonly="!!session.meta?.builtin"
      :avatar-label="sessionAvatarValue.text"
      :avatar-color="sessionAvatarValue.color"
      :avatar-icon="sessionAvatarValue.icon"
      :avatar-agent-id="agentId ?? session.id"
      :muted="sessionMuted"
      :show-thinking="showThinking"
      :session-status="session.status"
      :git-branch="gitBranch"
      :can-complete="canCompleteSession"
      :can-checkpoint="canCheckpointActions"
      :child-sessions="childSessions"
      :configurable-agents="configurableAgents"
      :shadow-enabled="shadowEnabled"
      :spawned-agent-ids="spawnedAgentIds"
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
      @update:avatar="onAvatarChange"
      @update:title="onSessionTitleChange"
      @update:shadow-enabled="onShadowEnabledChange"
      @update:spawned-agents="onSpawnedAgentsChange"
    />

    <Teleport to="body">
      <Transition name="chat-overlay" :duration="{ enter: 200, leave: 160 }">
        <div
          v-if="modelPickerOpen"
          class="model-picker-backdrop"
          @click.self="modelPickerOpen = false"
        >
          <section class="model-picker-sheet">
            <header>
              <strong>选择模型</strong
              ><button type="button" @click="modelPickerOpen = false">取消</button>
            </header>
          <div class="model-picker-search">
            <Search class="h-4 w-4" />
            <input v-model="modelSearch" type="search" placeholder="搜索供应商或模型" autofocus />
          </div>
          <div class="model-picker-list">
            <div v-if="modelPickerLoading" class="model-picker-empty">
              <Loader2 class="model-picker-spinner" />正在加载模型
            </div>
            <details
              v-for="provider in filteredModelProviders"
              v-else
              :key="provider.id"
              class="model-picker-provider"
              :open="!!modelSearch || filteredModelProviders.length === 1"
            >
              <summary>
                {{ provider.name }}<small>{{ provider.models.length }}</small>
              </summary>
              <button
                v-for="model in provider.models"
                :key="`${provider.id}:${model.modelId}`"
                type="button"
                :disabled="modelPickerSaving"
                @click="selectAgentModel(provider.id, model.modelId)"
              >
                <span>{{ model.name || model.modelId }}</span
                ><small>{{ model.modelId }}</small>
              </button>
            </details>
            <div
              v-if="!modelPickerLoading && !filteredModelProviders.length"
              class="model-picker-empty"
            >
              {{ modelSearch ? "没有匹配的模型" : "暂无可用模型，请先在“模型”中添加。" }}
            </div>
          </div>
        </section>
      </div>
      </Transition>
    </Teleport>

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
import {
  Braces,
  ClipboardList,
  Loader2,
  SlidersHorizontal,
  ScrollText,
  Search,
} from "lucide-vue-next";
import { useSessionStore, useAgentStore, useProviderStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import { requestUiConfirm } from "@/composables/use-ui-confirm";
import { formatMessageClock } from "@/utils/format-time";
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
import ToolDetailPanel from "../components/ToolDetailPanel.vue";
import BtwSplitPanel from "../components/BtwSplitPanel.vue";
import ChatInputPanel from "../components/ChatInputPanel.vue";
import ExternalAgentCommandHost from "../components/external-agents/ExternalAgentCommandHost.vue";
import ChatSessionMenu from "../components/ChatSessionMenu.vue";
import SessionLogPanel from "../components/SessionLogPanel.vue";
import ChatViewHeader from "../components/chat/ChatViewHeader.vue";
import ChatSearchBar from "../components/chat/ChatSearchBar.vue";
import ChatMessageList from "../components/chat/ChatMessageList.vue";
import TaskWorkspacePanel from "../components/chat/TaskWorkspacePanel.vue";
import SessionJobsPopover, {
  type JobDetailRequest,
} from "../components/chat/SessionJobsPopover.vue";
import SessionTodoPopover from "../components/chat/SessionTodoPopover.vue";
import SessionChangesPopover, {
  type SessionChangedFileView,
} from "../components/chat/SessionChangesPopover.vue";
import SessionCommitPopover from "../components/chat/SessionCommitPopover.vue";
import type { ChatSendPayload } from "@/types/chat-compose";
import { getShowThinking, setShowThinking } from "../composables/use-chat-session-prefs";
import { notifyAskUserInput, notifyMessageComplete } from "../composables/use-push-notifications";
import { findPendingAskInDisplayGroups } from "../utils/ask-tool";
import { parseWorkflowState } from "../utils/workflow";
import { sessionAvatar, type SessionAvatarValue } from "../utils/session-avatar";

const props = defineProps<{
  session: {
    id: string;
    status: string;
    parentId?: string | null;
    meta?: {
      name?: string;
      builtin?: boolean;
      shadowDisabled?: boolean;
      shadow?: { suggestedQuestions?: string[]; status?: string };
      git?: { branch?: string; worktreeEnabled?: boolean; mergeError?: string };
      workflow?: { stage: string; status: string };
      avatar?: SessionAvatarValue;
      changedFiles?: SessionChangedFileView[];
      turns?: Array<{ files?: { added?: string[]; modified?: string[]; deleted?: string[] } }>;
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
const sessionChangedFiles = computed<SessionChangedFileView[]>(() => {
  if (Array.isArray(props.session.meta?.changedFiles)) return props.session.meta.changedFiles;
  const files = new Map<string, SessionChangedFileView>();
  for (const turn of props.session.meta?.turns ?? []) {
    for (const path of turn.files?.added ?? []) files.set(path, { path, status: "added" });
    for (const path of turn.files?.modified ?? []) {
      files.set(path, { path, status: files.get(path)?.status === "added" ? "added" : "modified" });
    }
    for (const path of turn.files?.deleted ?? []) files.set(path, { path, status: "deleted" });
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
});

const sessionStore = useSessionStore();
const agentStore = useAgentStore();
const providerStore = useProviderStore();

const agentName = computed(() => {
  if (!props.agentId) return null;
  return agentStore.getAgentById(props.agentId)?.name ?? props.agentId;
});
const sessionAvatarValue = computed(() =>
  sessionAvatar(
    props.session.id,
    props.session.meta?.name ?? agentName.value ?? "Agent",
    props.session.meta?.avatar,
    props.agentId ? agentStore.getAgentById(props.agentId)?.icon : null,
  ),
);
const agentBackendType = computed(() =>
  props.agentId ? agentStore.getAgentById(props.agentId)?.backendType : undefined,
);
const modelMissing = computed(() => {
  if (!props.agentId) return false;
  const agent = agentStore.getAgentById(props.agentId);
  return agent?.backendType === "native" && (!agent.providerId || !agent.modelId);
});
const inputText = ref("");
const suggestedQuestions = ref<string[]>([]);
const rewindableEntryIds = ref<string[]>([]);
const inputPanelRef = ref<InstanceType<typeof ChatInputPanel> | null>(null);
const externalCommandHostRef = ref<InstanceType<typeof ExternalAgentCommandHost> | null>(null);
const messageListRef = ref<InstanceType<typeof ChatMessageList> | null>(null);
const searchBarRef = ref<InstanceType<typeof ChatSearchBar> | null>(null);
const sessionTitle = ref("");
const chatEntries = ref<ChatEntry[]>([]);
const sessionLoading = ref(false);
const historyLimit = ref(80);
const toolModal = ref<{ title: string; sections: { label: string; content: string }[] } | null>(
  null,
);
const toolPanel = ref<{
  title: string;
  sections: { label: string; content: string }[];
  terminal?: "bash" | "eval";
} | null>(null);

function openJobDetail(request: JobDetailRequest): void {
  if (request.presentation === "panel" || window.matchMedia("(max-width: 767px)").matches) {
    toolPanel.value = {
      title: request.title,
      sections: request.sections,
      terminal: request.terminal,
    };
    return;
  }
  toolModal.value = { title: request.title, sections: request.sections };
}
const isStreaming = ref(false);
const streamingSendMode = ref<"steer" | "follow_up">("follow_up");
const streamingAssistantId = ref<string | null>(null);
const activeTurn = ref<{
  userEntryId: string;
  text: string;
  assistantActivitySeen: boolean;
} | null>(null);
const sessionMenuOpen = ref(false);
const modelPickerOpen = ref(false);
const btwPanelOpen = ref(false);
const modelPickerLoading = ref(false);
const modelPickerSaving = ref(false);
const modelSearch = ref("");
const sessionActionsOpen = ref(false);
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
const retryingError = ref(false);
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

const selectableProviders = computed(() =>
  providerStore.providers
    .filter((provider) => provider.isEnabled)
    .map((provider) => ({ ...provider, models: providerStore.models[provider.id] ?? [] }))
    .filter((provider) => provider.models.length > 0),
);

const filteredModelProviders = computed(() => {
  const query = modelSearch.value.trim().toLocaleLowerCase();
  if (!query) return selectableProviders.value;
  return selectableProviders.value
    .map((provider) => ({
      ...provider,
      models: provider.models.filter(
        (model) =>
          provider.name.toLocaleLowerCase().includes(query) ||
          model.modelId.toLocaleLowerCase().includes(query) ||
          model.name?.toLocaleLowerCase().includes(query),
      ),
    }))
    .filter((provider) => provider.models.length > 0);
});

async function openModelPicker() {
  modelPickerOpen.value = true;
  modelSearch.value = "";
  modelPickerLoading.value = true;
  try {
    if (!providerStore.providers.length) await providerStore.fetchProviders();
    await Promise.all(
      providerStore.providers.map((provider) =>
        providerStore.fetchModels(provider.id).catch(() => []),
      ),
    );
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "模型加载失败", "error");
  } finally {
    modelPickerLoading.value = false;
  }
}

async function selectAgentModel(providerId: string, modelId: string) {
  if (!props.agentId || modelPickerSaving.value) return;
  modelPickerSaving.value = true;
  try {
    await agentStore.updateAgent(props.agentId, { providerId, modelId });
    modelPickerOpen.value = false;
    showUiMessage("模型设置成功", "success");
    await nextTick(() => inputPanelRef.value?.focus());
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "模型设置失败", "error");
  } finally {
    modelPickerSaving.value = false;
  }
}

const inputDisabled = computed(
  () => modelMissing.value || providerDisabled.value || terminalStatuses.has(props.session.status),
);

const inputPlaceholder = computed(() => {
  if (modelMissing.value) return "请先为 Agent 配置模型";
  if (providerDisabled.value) return "模型供应商已禁用，无法发送消息";
  if (props.session.status === "finish") return "会话已完成";
  if (props.session.status === "error") {
    return chatEntries.value.some((entry) => entry.type === "llm_error")
      ? "模型调用失败，请点击错误卡片重试"
      : "会话出错，请查看菜单中的合并状态";
  }
  if (props.session.status === "stopped") return "会话已停止";
  if (isStreaming.value)
    return streamingSendMode.value === "steer" ? "输入立即干预内容" : "输入轮后追加内容";
  if (props.session.meta?.shadow?.status) return props.session.meta.shadow.status;
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
const configurableAgents = computed(() =>
  agentStore.agents.filter((agent) => !agent.meta?.builtin),
);
const sessionMembers = ref<api.SessionMember[]>([]);
const shadowEnabled = computed(() => props.session.meta?.shadowDisabled === false);
const spawnedAgentIds = computed(() =>
  sessionMembers.value
    .filter((member) => member.role === "spawned")
    .map((member) => String(member.agentId)),
);

const btwSessions = computed(() =>
  childSessions.value
    .filter((session) => session.branchType === "btw")
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
);

function onCreateBtw() {
  sessionMenuOpen.value = false;
  btwPanelOpen.value = true;
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

async function interruptCurrentTurn() {
  if (!isStreaming.value) return;
  const turn = activeTurn.value;
  const shouldRetract = !!turn && !turn.assistantActivitySeen;
  try {
    const result = await api.abortSession(props.session.id, {
      retractIfNoAssistant: shouldRetract,
    });
    if (turn && shouldRetract && result.retracted) {
      const assistantId = streamingAssistantId.value;
      chatEntries.value = chatEntries.value.filter(
        (entry) => entry.id !== turn.userEntryId && entry.id !== assistantId,
      );
      inputText.value = [turn.text, inputText.value].filter((value) => value.trim()).join("\n\n");
      await nextTick(() => inputPanelRef.value?.focus());
    }
  } catch (error) {
    console.error("Interrupt failed:", error);
  } finally {
    activeTurn.value = null;
    stopStreaming();
    void sessionStore.fetchSessions();
  }
}

async function reloadMessagesFromServer(sessionId: string) {
  const [, queuedInputs, nextTasks, nextTodos, checkpoints, members] = await Promise.all([
    sessionStore.fetchSessionMessages(sessionId),
    api.getQueuedSessionInputs(sessionId).catch(() => []),
    api.getSessionTasks(sessionId).catch(() => []),
    api.getSessionTodos(sessionId).catch(() => []),
    api.listCheckpoints(sessionId).catch(() => []),
    api.getSessionMembers(sessionId).catch(() => []),
  ]);
  sessionMembers.value = members;
  const entries = sessionStore.messages[sessionId] ?? [];
  chatEntries.value = [
    ...sessionTreeToChatEntries(entries),
    ...queuedInputs.map((input) => {
      const entry = createUserChatEntry(
        `queued-${input.id}`,
        input.message,
        "queued",
        input.source,
      );
      entry.createdAt = input.enqueuedAt;
      return entry;
    }),
  ];
  rewindableEntryIds.value = checkpoints.map((checkpoint) => checkpoint.entryId);
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
  historyLimit.value = 80;
  const cached = sessionStore.messages[sessionId];
  if (cached?.length) chatEntries.value = sessionTreeToChatEntries(cached);
  else chatEntries.value = [];
  sessionLoading.value = true;
  try {
    await reloadMessagesFromServer(sessionId);
  } finally {
    sessionLoading.value = false;
  }
  sessionTitle.value = props.session.meta?.name ?? `Session ${sessionId.substring(0, 8)}`;
  toolModal.value = null;
  searchOpen.value = false;
  searchQuery.value = "";
  sessionMenuOpen.value = false;
  suggestedQuestions.value = Array.isArray(props.session.meta?.shadow?.suggestedQuestions)
    ? props.session.meta.shadow.suggestedQuestions.filter(
        (question): question is string =>
          typeof question === "string" && question.trim().length > 0,
      )
    : [];
}

function handleUiNotifyEvent(event: { type?: string; kind?: string; message?: string } | undefined) {
  if (!event || event.type !== "ui_notify" || typeof event.message !== "string") return false;
  const kind =
    event.kind === "success" || event.kind === "info" || event.kind === "error"
      ? event.kind
      : "error";
  showUiMessage(event.message, kind);
  return true;
}

function subscribeShadowSuggestions(sessionId: string) {
  shadowSuggestionCleanup?.();
  shadowSuggestionCleanup = api.subscribeSessionEvents(
    sessionId,
    (payload) => {
      if (payload.type !== "agent" || !payload.event) return;
      if (handleUiNotifyEvent(payload.event)) return;
      if (payload.event.type !== "shadow_suggestions") return;
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

async function onSessionTitleChange(value: string) {
  sessionTitle.value = value;
  await saveSessionTitle();
}

async function onShadowEnabledChange(value: boolean) {
  try {
    const members = await api.updateSessionMembers(props.session.id, {
      shadowAgentId: null,
      spawnedAgentIds: spawnedAgentIds.value,
    });
    await sessionStore.updateSessionMeta(props.session.id, { shadowDisabled: !value });
    sessionMembers.value = members;
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "影子代理设置更新失败", "error");
  }
}

async function onSpawnedAgentsChange(spawnedAgentIds: string[]) {
  try {
    sessionMembers.value = await api.updateSessionMembers(props.session.id, {
      shadowAgentId: null,
      spawnedAgentIds,
    });
    showUiMessage("Session 代理配置已更新", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "代理配置更新失败", "error");
  }
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

async function onAvatarChange(avatar: SessionAvatarValue) {
  await sessionStore.updateSessionMeta(props.session.id, {
    avatar: {
      ...sessionAvatarValue.value,
      ...avatar,
    },
  });
}

async function rewindToMessage(entryId: string) {
  const confirmed = await requestUiConfirm({
    title: "回到这条消息",
    message: "此后的代码修改和消息都会被移除，确定继续？",
    confirmText: "回到这里",
    danger: true,
  });
  if (!confirmed) return;
  try {
    stopStreaming();
    await api.rewindSessionToEntry(props.session.id, entryId);
    await reloadMessagesFromServer(props.session.id);
    await sessionStore.fetchSessions();
    await scrollToBottom();
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "回撤失败", "error");
  }
}

async function forkFromMessage(entryId: string) {
  try {
    const forked = await sessionStore.forkSession(props.session.id, { entryId });
    emit("navigate", forked.id);
    showUiMessage("已从此消息创建分支会话", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "分支失败", "error");
  }
}

function runMobileAction(action: () => void | Promise<void>) {
  sessionActionsOpen.value = false;
  void action();
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
    showUiMessage(err instanceof Error ? err.message : "完成会话失败", "error");
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
    await reloadMessagesFromServer(props.session.id);
    void scrollToBottom();
  } catch (err) {
    console.error("Commit failed:", err);
    window.alert(err instanceof Error ? err.message : "提交失败");
  }
}

async function onRetryLlmError() {
  if (retryingError.value || isStreaming.value) return;
  retryingError.value = true;
  try {
    await api.retrySession(props.session.id);
    await sessionStore.fetchSession(props.session.id);
    await reloadMessagesFromServer(props.session.id);
    attachToRunningSession();
    void scrollToBottom();
  } catch (err) {
    console.error("Retry failed:", err);
    showUiMessage(err instanceof Error ? err.message : "重试失败", "error");
    await reloadMessagesFromServer(props.session.id).catch(() => {});
    await sessionStore.fetchSession(props.session.id).catch(() => {});
  } finally {
    retryingError.value = false;
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
const hasEvalActivity = computed(
  () =>
    sessionTitle.value.toLowerCase().includes("eval") ||
    chatEntries.value.some(
      (entry) =>
        entry.type === "message" &&
        Array.isArray(entry.message.content) &&
        entry.message.content.some(
          (part) => part.type === "toolCall" && part.name.toLowerCase().includes("eval"),
        ),
    ),
);

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
  if (searchOpen.value && q)
    return displayGroups.value.filter((group) => groupMatchesSearch(group, q));
  return displayGroups.value.slice(-historyLimit.value);
});

const hasOlderGroups = computed(
  () => !searchOpen.value && displayGroups.value.length > historyLimit.value,
);

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

const streamingTimeLabel = computed(() => formatMessageClock(Date.now()));

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
  const detail = buildToolModal(toolName, callArgs, resultContent);
  const normalizedToolName = toolName.toLowerCase();
  const isEval = normalizedToolName.includes("eval");
  const isTerminal = isEval || normalizedToolName.includes("bash");
  if (isTerminal || window.matchMedia("(max-width: 767px)").matches) {
    toolPanel.value = { ...detail, ...(isTerminal ? { terminal: isEval ? "eval" : "bash" } : {}) };
  } else toolModal.value = detail;
}

function openEvalPanel() {
  toolPanel.value = {
    title: "Eval",
    sections: [{ label: "运行环境", content: "正在读取 Eval 历史…" }],
    terminal: "eval",
  };
}

function openBashDetail(
  command: string,
  resultContent?: Array<{ type: string; text: string }>,
  intent?: string,
) {
  const detail = buildBashModal(command, resultContent, intent);
  const output = resultContent?.map((part) => part.text ?? "").join("\n") ?? "";
  const terminalPresentation =
    resultContent === undefined || output.length > 1000 || output.split(/\r?\n/).length > 8;
  if (terminalPresentation) toolPanel.value = { ...detail, terminal: "bash" };
  else toolModal.value = detail;
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
      if (handleUiNotifyEvent(payload.event)) return;
      if (payload.event.type === "shadow_suggestions") return;
      applyAgentEventToChatEntries(chatEntries.value, assistantId, payload.event);
      void scrollToBottom();
      if (payload.event.type === "agent_end") {
        stopStreaming();
        void reloadMessagesFromServer(props.session.id).then(() => scrollToBottom());
        void sessionStore.fetchSessions();
      }
    },
    (err) => {
      console.error("Session events error:", err);
      showUiMessage(err.message, "error");
    },
  );
}

async function sendStreamReply(userText: string, images: ChatSendPayload["images"]) {
  const assistantId = `stream-${Date.now()}`;
  streamingAssistantId.value = assistantId;
  isStreaming.value = true;

  const userEntry = [...chatEntries.value]
    .reverse()
    .find((entry) => entry.type === "message" && entry.message.role === "user");
  activeTurn.value = userEntry
    ? { userEntryId: userEntry.id, text: userText, assistantActivitySeen: false }
    : null;

  chatEntries.value.push(createStreamingAssistantEntry(assistantId));
  void scrollToBottom();

  const imagePayload = images.map((img) => ({ mimeType: img.mimeType, data: img.data }));
  const sessionName = props.session.meta?.name ?? "会话";

  streamCleanup = api.promptSession(
    props.session.id,
    userText,
    (event) => {
      if (handleUiNotifyEvent(event)) return;
      if (event.type === "shadow_suggestions") return;
      if (
        activeTurn.value &&
        (event.type === "message_update" ||
          event.type === "tool_execution_start" ||
          event.type === "tool_execution_end")
      ) {
        activeTurn.value.assistantActivitySeen = true;
      }
      applyAgentEventToChatEntries(chatEntries.value, assistantId, event);
      void scrollToBottom();
    },
    (err) => {
      console.error("Stream error:", err);
      showUiMessage(err.message, "error");
    },
    () => {
      isStreaming.value = false;
      streamingAssistantId.value = null;
      streamCleanup = null;
      activeTurn.value = null;
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
    const commandName = slash[1]!.toLowerCase();
    const command = commands.find((item) => {
      const name = item.name.replace(/^\//, "").toLowerCase();
      if (name !== commandName) return false;
      // Skills / prompts still go through normal prompt expansion.
      return item.source !== "skill" && item.source !== "prompt";
    });
    if (command) {
      inputText.value = "";
      inputPanelRef.value?.clearAfterSend();
      try {
        await api.executeSessionCommand(props.session.id, command.name, slash[2]);
        await reloadMessagesFromServer(props.session.id);
        await sessionStore.fetchSessions();
      } catch (error) {
        showUiMessage(error instanceof Error ? error.message : "斜杠命令执行失败", "error");
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
.desktop-session-actions,
.mobile-session-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.mobile-session-actions {
  display: none;
}

.chat-header-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 30px;
  height: 30px;
  border-radius: 6px;
  color: var(--app-text-secondary);
  font-size: 11px;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease;
}

.chat-header-action:hover,
.chat-header-action:focus-visible {
  color: #07a65a;
  background: var(--app-hover);
  outline: none;
}

.chat-header-action:active {
  transform: scale(0.94);
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
  min-height: 0;
  overflow: hidden;
}

.chat-panel-host :deep(.tool-detail-panel),
.chat-panel-host :deep(.task-workspace),
.chat-panel-host :deep(.btw-panel),
.chat-panel-host :deep(.session-log-panel) {
  width: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
  flex: 1 1 auto !important;
  border-left: 1px solid var(--app-border-subtle);
}

.session-loading {
  display: flex;
  min-height: 180px;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--app-text-muted);
  font-size: 13px;
}
.session-loading svg {
  width: 17px;
  height: 17px;
  animation: spin 0.8s linear infinite;
}
.load-older-messages {
  align-self: center;
  margin: 10px 0 2px;
  padding: 6px 13px;
  border-radius: 16px;
  color: var(--app-text-link);
  background: var(--app-hover);
  font-size: 12px;
  transition:
    background-color 0.15s,
    transform 0.1s;
}
.load-older-messages:hover {
  background: var(--app-list-active-bg);
}
.load-older-messages:active {
  transform: scale(0.97);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.chat-workspace__side-panel {
  border-left: 1px solid var(--app-border-subtle);
}

.desktop-session-actions,
.mobile-session-actions {
  position: relative;
  z-index: 70;
}

@media (max-width: 767px) {
  .chat-panel-host :deep(.tool-detail-panel),
  .chat-panel-host :deep(.task-workspace),
  .chat-panel-host :deep(.btw-panel),
  .chat-panel-host :deep(.session-log-panel) {
    border-top: 1px solid var(--app-border-subtle);
    border-left: 0;
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -10px 30px rgb(0 0 0 / 14%);
  }
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

.mobile-actions-backdrop {
  position: fixed;
  z-index: 80;
  inset: 0;
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 32%);
}

.mobile-actions-sheet {
  width: 100%;
  padding: 8px 12px calc(12px + env(safe-area-inset-bottom));
  border-radius: 16px 16px 0 0;
  background: #f7f7f7;
}

.mobile-actions-handle {
  width: 34px;
  height: 4px;
  margin: 0 auto 12px;
  border-radius: 999px;
  background: #c8c8c8;
}

.mobile-actions-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 14px 10px;
  border-radius: 12px;
  background: #fff;
}

.mobile-actions-grid button {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 2px;
  color: #575757;
  font-size: 12px;
}

.mobile-actions-grid button :deep(svg) {
  width: 22px;
  height: 22px;
  color: #07a65a;
}

.mobile-actions-grid button:active {
  border-radius: 8px;
  background: #ededed;
}

.mobile-actions-cancel {
  width: 100%;
  margin-top: 8px;
  padding: 12px;
  border-radius: 12px;
  background: #fff;
  color: #191919;
  font-size: 15px;
}

.model-picker-backdrop {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(0 0 0 / 36%);
}

.model-picker-sheet {
  width: min(420px, 100%);
  max-height: min(560px, 78vh);
  overflow: hidden;
  border-radius: 12px;
  color: var(--app-text-primary);
  background: var(--app-popup-bg);
  box-shadow: 0 14px 50px rgb(0 0 0 / 22%);
}

.model-picker-sheet header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 18px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.model-picker-sheet header button {
  color: #576b95;
  font-size: 13px;
}

.model-picker-list {
  max-height: calc(min(560px, 78vh) - 54px);
  overflow-y: auto;
  padding: 8px 0;
}

.model-picker-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 12px 4px;
  padding: 8px 10px;
  border-radius: 7px;
  color: var(--app-text-muted);
  background: var(--app-hover);
}

.model-picker-search input {
  min-width: 0;
  flex: 1;
  outline: none;
  color: var(--app-text-primary);
  background: transparent;
  font-size: 13px;
}

.model-picker-provider summary {
  display: flex;
  cursor: pointer;
  align-items: center;
  justify-content: space-between;
  padding: 9px 18px;
  color: var(--app-text-muted);
  font-size: 12px;
  user-select: none;
}

.model-picker-provider summary:hover {
  background: var(--app-popup-hover);
}

.model-picker-list button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 11px 18px;
  text-align: left;
}

.model-picker-list button:hover,
.model-picker-list button:focus-visible {
  background: var(--app-popup-hover);
  outline: none;
}

.model-picker-list small,
.model-picker-empty {
  color: var(--app-text-muted);
  font-size: 11px;
}

.model-picker-empty {
  padding: 28px 18px;
  text-align: center;
}

.model-picker-spinner {
  display: inline-block;
  width: 16px;
  margin-right: 7px;
  animation: model-picker-spin 0.8s linear infinite;
}

@keyframes model-picker-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 767px) {
  .desktop-session-actions {
    display: none;
  }

  .mobile-session-actions {
    display: flex;
  }

  .model-picker-backdrop {
    align-items: end;
    padding: 0;
  }

  .model-picker-sheet {
    width: 100%;
    max-height: 72vh;
    border-radius: 16px 16px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
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
