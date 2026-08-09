<template>
  <div
    class="chat-view relative flex flex-col h-full w-full"
    :class="{ 'chat-view--builtin-assistant': session.isBuiltin }"
    :style="{ background: 'var(--app-chat-bg)', '--chat-msg-font-size': fontSizePx }"
    v-if="session"
  >
    <ToolApprovalDialog
      v-if="pendingApproval"
      :session-id="session.id"
      :approval="pendingApproval"
      @resolved="resolvePendingApproval"
      @view-plan="openPendingPlan"
    />
    <ChatViewHeader
      :title="sessionTitle"
      :title-readonly="!!session.isBuiltin"
      :agent-name="agentName"
      :agent-id="agentId"
      :external-agent="isExternalAgent"
      :usage="sessionUsage"
      :status-key="headerStatusKey"
      :stage="stage"
      :show-back="showBack"
      @back="emit('back')"
      @view-agent="emit('view-agent', $event)"
      @open-menu="sessionMenuOpen = true"
    >
      <template #actions>
        <div class="desktop-session-actions">
          <ChatHeaderAction title="搜索消息" :active="searchOpen" @click="toggleSearch">
            <Search />
          </ChatHeaderAction>
          <ChatHeaderAction title="查看会话日志" :active="showLogPanel" @click="toggleLogPanel">
            <ScrollText />
          </ChatHeaderAction>
          <ChatHeaderAction
            title="查看工作区文件"
            :active="showFilesPanel"
            @click="toggleFilesPanel"
          >
            <FolderTree />
          </ChatHeaderAction>
          <SessionCommitPopover :session-id="session.id" />
          <ChatHeaderAction
            v-if="taskCount"
            :title="`Todo · ${taskTypeSummary}`"
            :active="taskPaneOpen"
            :count="taskCount"
            @click="toggleTaskPane"
          >
            <ClipboardList />
          </ChatHeaderAction>
        </div>
        <SessionJobsPopover :session-id="session.id" @detail="openJobDetail" />
        <ChatHeaderAction
          v-if="hasEvalActivity"
          title="查看 Eval"
          :active="toolPanel?.terminal === 'eval'"
          @click="toggleEvalPanel"
        >
          <Braces />
        </ChatHeaderAction>
        <div class="mobile-session-actions">
          <ChatHeaderAction
            v-if="taskCount"
            title="Todo"
            :active="taskPaneOpen"
            :count="taskCount"
            @click="toggleTaskPane"
            ><ClipboardList
          /></ChatHeaderAction>
          <ChatHeaderAction
            title="会话工具"
            :active="sessionActionsOpen"
            @click="sessionActionsOpen = true"
          >
            <SlidersHorizontal />
          </ChatHeaderAction>
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
      <div ref="conversationHostRef" class="chat-workspace__conversation">
        <div
          v-if="!chatViewportReady && !searchOpen"
          class="session-loading session-loading--overlay"
        >
          <Loader2 /><span>正在加载聊天记录...</span>
        </div>
        <ChatMessageList
          ref="messageListRef"
          class="chat-message-list-host"
          :class="{ 'chat-message-list-host--positioning': !chatViewportReady && !searchOpen }"
          :session-id="session.id"
          :groups="visibleGroups"
          :show-thinking-blocks="showThinking"
          :is-streaming="isStreaming"
          :streaming-group-id="streamingAssistantId"
          :show-streaming-placeholder="showStreamingPlaceholder"
          :streaming-time-label="streamingTimeLabel"
          :search-open="searchOpen"
          :search-query="searchQuery"
          :assistant-avatar-label="session.isBuiltin ? 'π' : sessionAvatarValue.text"
          :assistant-avatar-color="sessionAvatarValue.color"
          :assistant-avatar-icon="session.isBuiltin ? null : sessionAvatarValue.icon"
          :assistant-avatar-agent-id="agentId ?? session.id"
          :rewindable-entry-ids="rewindableEntryIds"
          :retrying="retryingError"
          :has-older="hasOlderMessages"
          :loading-older="loadingOlder"
          :scroll-ready="chatViewportReady || searchOpen"
          :external-agent="isExternalAgent"
          @load-older="loadOlderMessages"
          @open-tool="openToolDetail"
          @open-bash="openBashDetail"
          @open-compaction="openCompactionDetail"
          @navigate="navigateToSubagent"
          @answered="onAskAnswered"
          @open-external-detail="openExternalInteractionDetail"
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

        <QueuedInputsBar
          :inputs="queuedInputs"
          :busy-id="queuedActionBusyId"
          @edit="editQueuedInput"
          @submit="submitQueuedInputNow"
          @delete="deleteQueuedInput"
        />

        <div
          class="chat-composer-stack"
          :class="{ 'chat-composer-stack--has-changes': composerStackActive }"
        >
          <SessionPendingSyncBanner
            v-if="showPendingSyncBanner && sessionGitPendingUpdate"
            :pending="sessionGitPendingUpdate"
            :sync-disabled="!canCheckpointActions || isStreaming"
            @sync="onSyncSession"
            @dismiss="dismissPendingSync"
          />
          <SessionChangesPopover v-if="sessionChangedFiles.length" :files="sessionChangedFiles" />

          <ChatInputPanel
            ref="inputPanelRef"
            v-model="inputText"
            :session-id="session.id"
            :workspace-id="workspaceId"
            :agent-id="agentId"
            :disabled="inputDisabled"
            :interrupting="canInterrupt"
            :shadow-running="shadowRunning"
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

        <FloatingPreviewOrb
          :visible="hasServicePreviews"
          :active="servicesRunning"
          :open="previewSplitOpen"
          :container-ref="conversationHostRef"
          :storage-key="`supervisor:preview-orb:${session.id}`"
          @toggle="togglePreviewSplit"
        />
      </div>

      <MobileDrawer
        :open="isMobileViewport && previewSplitOpen"
        ariaLabel="项目页面预览"
        size="tall"
        :resizable="true"
        @close="previewSplitOpen = false"
      >
        <SessionPreviewPanel
          :previews="servicePreviews"
          :loading="previewLoading"
          show-close
          @close="previewSplitOpen = false"
        />
      </MobileDrawer>
      <Transition name="chat-panel" :duration="{ enter: 360, leave: 280 }">
        <div
          v-if="!isMobileViewport && previewSplitOpen"
          class="chat-panel-host"
          :style="sidePanelStyle"
        >
          <ResizeHandle
            orientation="vertical"
            label="调整预览分屏宽度"
            @start="startSidePanelResize"
          />
          <SessionPreviewPanel
            class="chat-panel-host__body"
            :previews="servicePreviews"
            :loading="previewLoading"
            show-close
            @close="previewSplitOpen = false"
          />
        </div>
      </Transition>

      <MobileDrawer
        :open="isMobileViewport && Boolean(taskPaneOpen && taskCount)"
        ariaLabel="任务"
        size="tall"
        :resizable="true"
        @close="taskPaneOpen = false"
      >
        <TaskWorkspacePanel
          mobile
          class="chat-panel-host__body"
          :tasks="tasks"
          :todos="todos"
          :selected-path="selectedTaskPath"
          @select="selectedTaskPath = $event"
          @close="taskPaneOpen = false"
        />
      </MobileDrawer>
      <Transition name="chat-panel" :duration="{ enter: 360, leave: 280 }">
        <div
          v-if="!isMobileViewport && taskPaneOpen && taskCount"
          class="chat-panel-host"
          :style="sidePanelStyle"
        >
          <ResizeHandle
            orientation="vertical"
            label="调整会话分屏宽度"
            @start="startSidePanelResize"
          />
          <TaskWorkspacePanel
            class="chat-panel-host__body"
            :tasks="tasks"
            :todos="todos"
            :selected-path="selectedTaskPath"
            @select="selectedTaskPath = $event"
            @close="taskPaneOpen = false"
          />
        </div>
      </Transition>
      <MobileDrawer
        :open="isMobileViewport && btwPanelOpen"
        ariaLabel="顺便问一下"
        size="tall"
        :resizable="true"
        @close="btwPanelOpen = false"
      >
        <BtwSplitPanel
          mobile
          class="chat-panel-host__body"
          :parent-id="session.id"
          :sessions="btwSessions"
          @close="btwPanelOpen = false"
        />
      </MobileDrawer>
      <Transition name="chat-panel" :duration="{ enter: 360, leave: 280 }">
        <div
          v-if="!isMobileViewport && btwPanelOpen"
          class="chat-panel-host"
          :style="sidePanelStyle"
        >
          <ResizeHandle
            orientation="vertical"
            label="调整会话分屏宽度"
            @start="startSidePanelResize"
          />
          <BtwSplitPanel
            class="chat-panel-host__body"
            :parent-id="session.id"
            :sessions="btwSessions"
            @close="btwPanelOpen = false"
          />
        </div>
      </Transition>
      <MobileDrawer
        :open="isMobileViewport && showLogPanel"
        ariaLabel="会话日志"
        size="tall"
        :resizable="true"
        @close="showLogPanel = false"
      >
        <SessionLogPanel
          mobile
          :active="showLogPanel"
          class="chat-panel-host__body chat-workspace__side-panel"
          :session-id="session.id"
          @close="showLogPanel = false"
        />
      </MobileDrawer>
      <Transition name="chat-panel" :duration="{ enter: 360, leave: 280 }">
        <div
          v-if="!isMobileViewport && showLogPanel"
          class="chat-panel-host"
          :style="sidePanelStyle"
        >
          <ResizeHandle
            orientation="vertical"
            label="调整会话分屏宽度"
            @start="startSidePanelResize"
          />
          <SessionLogPanel
            :active="showLogPanel"
            class="chat-panel-host__body chat-workspace__side-panel"
            :session-id="session.id"
            @close="showLogPanel = false"
          />
        </div>
      </Transition>
      <MobileDrawer
        :open="isMobileViewport && showFilesPanel"
        ariaLabel="工作区文件"
        size="tall"
        :resizable="true"
        @close="showFilesPanel = false"
      >
        <SessionFilesPanel
          mobile
          class="chat-panel-host__body chat-workspace__side-panel"
          :session-id="session.id"
          :initial-path="requestedFilePath"
          :changed-files="sessionChangedFiles"
          @close="showFilesPanel = false"
        />
      </MobileDrawer>
      <Transition name="chat-panel" :duration="{ enter: 360, leave: 280 }">
        <div
          v-if="!isMobileViewport && showFilesPanel"
          class="chat-panel-host"
          :style="sidePanelStyle"
        >
          <ResizeHandle
            orientation="vertical"
            label="调整会话分屏宽度"
            @start="startSidePanelResize"
          />
          <SessionFilesPanel
            class="chat-panel-host__body chat-workspace__side-panel"
            :session-id="session.id"
            :initial-path="requestedFilePath"
            :changed-files="sessionChangedFiles"
            @close="showFilesPanel = false"
          />
        </div>
      </Transition>
      <MobileDrawer
        :open="isMobileViewport && Boolean(toolPanel)"
        :ariaLabel="toolPanel?.title ?? '工具详情'"
        size="tall"
        :resizable="true"
        @close="toolPanel = null"
      >
        <ToolDetailPanel
          v-if="toolPanel"
          mobile
          class="chat-panel-host__body chat-workspace__tool-panel"
          :title="toolPanel.title"
          :sections="toolPanel.sections"
          :terminal="toolPanel.terminal"
          :session-id="session.id"
          @close="toolPanel = null"
        />
      </MobileDrawer>
      <Transition name="chat-panel" :duration="{ enter: 360, leave: 280 }">
        <div v-if="!isMobileViewport && toolPanel" class="chat-panel-host" :style="sidePanelStyle">
          <ResizeHandle
            orientation="vertical"
            label="调整会话分屏宽度"
            @start="startSidePanelResize"
          />
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

    <ChatSessionToolsSheet
      :open="sessionActionsOpen"
      :show-tasks="tasks.length > 0"
      @close="sessionActionsOpen = false"
      @search="runMobileAction(openSearch)"
      @logs="runMobileAction(openLogPanel)"
      @files="runMobileAction(openFilesPanel)"
      @tasks="runMobileAction(() => openSidePanel('task'))"
    />

    <ChatSessionMenu
      :open="sessionMenuOpen"
      :agent-name="agentName ?? session.title ?? 'Agent'"
      :session-title="sessionTitle"
      :title-readonly="!!session.isBuiltin"
      :avatar-label="sessionAvatarValue.text"
      :avatar-color="sessionAvatarValue.color"
      :avatar-icon="sessionAvatarValue.icon"
      :avatar-agent-id="agentId ?? session.id"
      :muted="sessionMuted"
      :show-thinking="showThinking"
      :split-assistant-messages="splitAssistantMessages"
      :session-status="session.status"
      :git-branch="gitBranch"
      :can-complete="canCompleteSession"
      :can-checkpoint="canCheckpointActions"
      :can-sync="canSyncSession"
      :child-sessions="childSessions"
      :configurable-agents="configurableAgents"
      :shadow-enabled="shadowEnabled"
      :spawned-agent-ids="spawnedAgentIds"
      :external-agent="isExternalAgent"
      @close="sessionMenuOpen = false"
      @search="openSearchFromMenu"
      @log="openLogPanel"
      @files="openFilesPanel"
      @complete="onCompleteSession"
      @checkpoint="onCreateCheckpoint"
      @rewind="onRewindSession"
      @commit="onCommitSession"
      @sync="onSyncSession"
      @btw="onCreateBtw"
      @navigate="navigateToSubagent"
      @update:muted="onMutedChange"
      @update:show-thinking="onShowThinkingChange"
      @update:split-assistant-messages="onSplitAssistantMessagesChange"
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
                  @click="selectAgentModel(model.id)"
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
import { ref, computed, nextTick, watch, onBeforeUnmount, onMounted } from "vue";
import {
  Braces,
  ClipboardList,
  FolderTree,
  Loader2,
  SlidersHorizontal,
  ScrollText,
  Search,
} from "lucide-vue-next";
import { useSessionStore, useAgentStore, useProviderStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import { requestUiConfirm } from "@/composables/use-ui-confirm";
import { withUiBusy } from "@/composables/use-ui-busy";
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
  mergeStreamingToolsIntoPersistedEntries,
  sessionTreeToChatEntries,
} from "../utils/session-entries";
import {
  buildToolModal,
  buildBashModal,
  buildExternalInteractionModal,
} from "../utils/tool-detail";
import ToolDetailModal from "../components/ToolDetailModal.vue";
import ToolDetailPanel from "../components/ToolDetailPanel.vue";
import BtwSplitPanel from "../components/BtwSplitPanel.vue";
import ChatInputPanel from "../components/ChatInputPanel.vue";
import ExternalAgentCommandHost from "../components/external-agents/ExternalAgentCommandHost.vue";
import ChatSessionMenu from "../components/ChatSessionMenu.vue";
import SessionLogPanel from "../components/SessionLogPanel.vue";
import SessionFilesPanel from "../components/SessionFilesPanel.vue";
import ResizeHandle from "../components/ResizeHandle.vue";
import { useResizableWidth } from "../composables/use-resizable-width";
import ChatViewHeader from "../components/chat/ChatViewHeader.vue";
import ChatSearchBar from "../components/chat/ChatSearchBar.vue";
import ChatMessageList from "../components/chat/ChatMessageList.vue";
import QueuedInputsBar from "../components/chat/QueuedInputsBar.vue";
import TaskWorkspacePanel from "../components/chat/TaskWorkspacePanel.vue";
import SessionJobsPopover, {
  type JobDetailRequest,
} from "../components/chat/SessionJobsPopover.vue";
import ChatHeaderAction from "../components/chat/ChatHeaderAction.vue";
import ChatSessionToolsSheet from "../components/chat/ChatSessionToolsSheet.vue";
import SessionChangesPopover, {
  type SessionChangedFileView,
} from "../components/chat/SessionChangesPopover.vue";
import SessionPendingSyncBanner from "../components/chat/SessionPendingSyncBanner.vue";
import type { SessionGitMeta, SessionGitPendingUpdate } from "@/api";
import SessionCommitPopover from "../components/chat/SessionCommitPopover.vue";
import SessionPreviewPanel from "../components/SessionPreviewPanel.vue";
import FloatingPreviewOrb from "../components/FloatingPreviewOrb.vue";
import ToolApprovalDialog from "../components/ToolApprovalDialog.vue";
import { MobileDrawer } from "../components/mobile/ui";
import type { ChatSendPayload } from "@/types/chat-compose";
import {
  getShowThinking,
  getSplitAssistantMessages,
  setShowThinking,
  setSplitAssistantMessages,
} from "../composables/use-chat-session-prefs";
import { useChatFontSize } from "../composables/use-chat-font-size";
import { notifyAskUserInput, notifyMessageComplete } from "../composables/use-notifications";
import { endLiveStatus, syncAgentLiveStatus } from "../composables/use-live-status";
import { findPendingAskInDisplayGroups } from "../utils/ask-tool";
import { parseSessionStage } from "../utils/workflow";
import {
  parseSessionServicesFromMeta,
  type SessionServicesPreview,
} from "../utils/session-services";
import { sessionAvatar, type SessionAvatarValue } from "../utils/session-avatar";

const props = defineProps<{
  session: {
    id: string;
    status: string;
    parentId?: string | null;
    title?: string | null;
    isBuiltin?: boolean;
    avatar?: Partial<SessionAvatarValue> | null;
    shadowEnabled?: boolean;
    stage?: string | null;
    meta?: {
      subagentIds?: number[];
      shadow?: { suggestedQuestions?: string[]; status?: string; running?: boolean };
      git?: { branch?: string; worktreeEnabled?: boolean; mergeError?: string };
      workflow?: { stage: string; status: string };
      changedFiles?: SessionChangedFileView[];
      turns?: Array<{ files?: { added?: string[]; modified?: string[]; deleted?: string[] } }>;
    };
    workspaceId?: string;
    pinned?: boolean;
    muted?: boolean;
    currentTask?: string | null;
    gitSessionBranch?: string | null;
    gitWorktreeEnabled?: boolean;
  };
  agentId?: string;
  showBack?: boolean;
}>();

const emit = defineEmits<{
  navigate: [sessionId: string];
  back: [];
  "view-agent": [agentId: string];
}>();

const stage = computed(() => parseSessionStage(props.session));

function parseSessionGitPendingUpdate(
  meta: Record<string, unknown>,
): SessionGitPendingUpdate | null {
  const git = meta.git;
  if (!git || typeof git !== "object" || Array.isArray(git)) return null;
  const pending = (git as SessionGitMeta).pendingUpdate;
  if (!pending || typeof pending !== "object") return null;
  if (!Array.isArray(pending.files)) return null;
  return pending;
}

const sessionGitPendingUpdate = computed(() => {
  const meta = props.session.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  return parseSessionGitPendingUpdate(meta as Record<string, unknown>);
});

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
const { width: sidePanelWidth, startResize: startSidePanelResize } = useResizableWidth({
  defaultWidth: 520,
  minWidth: 320,
  maxWidth: 960,
  storageKey: "supervisor:chat-side-panel-width",
  direction: "rtl",
});
const isMobileViewport = ref(false);

function syncMobileViewport() {
  isMobileViewport.value = window.matchMedia("(max-width: 767px)").matches;
}

const sidePanelStyle = computed(() =>
  isMobileViewport.value ? undefined : { width: `${sidePanelWidth.value}px` },
);
const agentStore = useAgentStore();
const providerStore = useProviderStore();

const agentName = computed(() => {
  if (!props.agentId) return null;
  return agentStore.getAgentById(props.agentId)?.name ?? props.agentId;
});
const sessionAvatarValue = computed(() =>
  sessionAvatar(
    props.session.id,
    props.session.title ?? agentName.value ?? "Agent",
    props.session.avatar ?? undefined,
    props.agentId ? agentStore.getAgentById(props.agentId)?.avatar : null,
  ),
);
const agentBackendType = computed(() =>
  props.agentId ? agentStore.getAgentById(props.agentId)?.backendType : undefined,
);
const isExternalAgent = computed(
  () => !!agentBackendType.value && agentBackendType.value !== "native",
);
const { fontSizePx } = useChatFontSize();
const modelMissing = computed(() => {
  if (!props.agentId) return false;
  const agent = agentStore.getAgentById(props.agentId);
  return agent?.backendType === "native" && (!agent.providerId || !agent.modelId);
});
const inputText = ref("");
const suggestedQuestions = ref<string[]>([]);
const shadowRunning = ref(false);
const pendingApprovals = ref<api.ApprovalPendingEvent[]>([]);
const pendingApproval = computed(() => pendingApprovals.value[0] ?? null);
const rewindableEntryIds = ref<string[]>([]);
const inputPanelRef = ref<InstanceType<typeof ChatInputPanel> | null>(null);
const externalCommandHostRef = ref<InstanceType<typeof ExternalAgentCommandHost> | null>(null);
const messageListRef = ref<InstanceType<typeof ChatMessageList> | null>(null);
const searchBarRef = ref<InstanceType<typeof ChatSearchBar> | null>(null);
const sessionTitle = ref("");
const chatEntries = ref<ChatEntry[]>([]);
const sessionLoading = ref(false);
const chatViewportReady = ref(false);
const historyHasMore = ref(false);
const loadingOlder = ref(false);
const toolModal = ref<{ title: string; sections: { label: string; content: string }[] } | null>(
  null,
);
const toolPanel = ref<{
  title: string;
  sections: { label: string; content: string }[];
  terminal?: "bash" | "eval";
} | null>(null);

function openJobDetail(request: JobDetailRequest): void {
  if (request.presentation === "panel" || isMobileViewport.value) {
    setToolPanel({
      title: request.title,
      sections: request.sections,
      terminal: request.terminal,
    });
    return;
  }
  toolModal.value = { title: request.title, sections: request.sections };
}
const isStreaming = ref(false);

watch(
  () =>
    [isStreaming.value, props.session?.status, props.session?.title, props.session?.id] as const,
  ([streaming, status, title, sessionId]) => {
    if (!sessionId) return;
    const running =
      Boolean(streaming) ||
      status === "running" ||
      status === "blocked" ||
      status === "initializing";
    void syncAgentLiveStatus({
      sessionId,
      title: title?.trim() || "Supervisor",
      subtitle:
        status === "blocked"
          ? "等待你确认"
          : streaming
            ? "思考中"
            : status === "running"
              ? "运行中"
              : "连接中",
      phase: status === "blocked" ? "waiting" : streaming ? "thinking" : "connecting",
      running,
    });
  },
  { immediate: true },
);
const streamingAssistantId = ref<string | null>(null);
const activeTurn = ref<{
  userEntryId: string;
  text: string;
  assistantActivitySeen: boolean;
} | null>(null);
const sessionMenuOpen = ref(false);
const sessionUsage = ref<api.SessionUsage | null>(null);
const modelPickerOpen = ref(false);
const btwPanelOpen = ref(false);
const modelPickerLoading = ref(false);
const modelPickerSaving = ref(false);
const modelSearch = ref("");
const sessionActionsOpen = ref(false);
const previewSplitOpen = ref(false);
const previewLoading = ref(false);
const conversationHostRef = ref<HTMLElement | null>(null);
const showLogPanel = ref(false);
const showFilesPanel = ref(false);
const requestedFilePath = ref<string | null>(null);

type SidePanelKind = "task" | "btw" | "log" | "files";

function closeAllSidePanels() {
  taskPaneOpen.value = false;
  btwPanelOpen.value = false;
  showLogPanel.value = false;
  showFilesPanel.value = false;
  previewSplitOpen.value = false;
  toolPanel.value = null;
}

function openSidePanel(kind: SidePanelKind) {
  if (isMobileViewport.value) closeAllSidePanels();
  previewSplitOpen.value = false;
  switch (kind) {
    case "task":
      taskPaneOpen.value = true;
      break;
    case "btw":
      btwPanelOpen.value = true;
      break;
    case "log":
      showLogPanel.value = true;
      if (!isMobileViewport.value) showFilesPanel.value = false;
      break;
    case "files":
      showFilesPanel.value = true;
      if (!isMobileViewport.value) showLogPanel.value = false;
      break;
  }
}

function setToolPanel(panel: NonNullable<typeof toolPanel.value>) {
  if (isMobileViewport.value) closeAllSidePanels();
  previewSplitOpen.value = false;
  toolPanel.value = panel;
}

function toggleTaskPane() {
  if (taskPaneOpen.value) {
    taskPaneOpen.value = false;
    return;
  }
  openSidePanel("task");
}

function onOpenFileEvent(event: Event) {
  const path = (event as CustomEvent<{ path?: string }>).detail?.path;
  if (!path) return;
  requestedFilePath.value = null;
  openFilesPanel();
  void nextTick(() => {
    requestedFilePath.value = path;
  });
}

onMounted(() => {
  syncMobileViewport();
  window.addEventListener("resize", syncMobileViewport);
  window.addEventListener("supervisor:open-file", onOpenFileEvent);
});

function toggleLogPanel() {
  if (showLogPanel.value) {
    showLogPanel.value = false;
    return;
  }
  openSidePanel("log");
}

function toggleFilesPanel() {
  if (showFilesPanel.value) {
    showFilesPanel.value = false;
    return;
  }
  openSidePanel("files");
}

function openLogPanel() {
  openSidePanel("log");
}

function openFilesPanel() {
  openSidePanel("files");
}
const searchOpen = ref(false);
const searchQuery = ref("");
const tasks = ref<api.TaskArtifact[]>([]);
const todos = ref<api.TodoItem[]>([]);
const selectedTaskPath = ref<string | null>(null);
const taskPaneOpen = ref(false);
let streamCleanup: (() => void) | null = null;
let shadowSuggestionCleanup: (() => void) | null = null;
let streamingReconcileTimer: ReturnType<typeof setInterval> | null = null;

const workspaceId = computed(() => props.session.workspaceId ?? "");
const sessionMuted = computed(() => !!props.session.muted);
const showThinking = ref(false);
const splitAssistantMessages = ref(false);
const retryingError = ref(false);
const taskCount = computed(() => tasks.value.length + todos.value.length);
const taskTypeSummary = computed(() =>
  [
    ...new Set([
      ...tasks.value.map((task) => ({ goal: "Goal", plan: "Plan" })[task.type]),
      ...(todos.value.length ? ["Todo"] : []),
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

async function selectAgentModel(modelId: string) {
  if (!props.agentId || modelPickerSaving.value) return;
  modelPickerSaving.value = true;
  try {
    await agentStore.updateAgent(props.agentId, { modelId });
    modelPickerOpen.value = false;
    showUiMessage("模型设置成功", "success");
    await nextTick(() => inputPanelRef.value?.focus());
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "模型设置失败", "error");
  } finally {
    modelPickerSaving.value = false;
  }
}

const isInitializing = computed(() => props.session.status === "initializing");

const queuedInputs = ref<api.QueuedSessionInput[]>([]);
const queuedActionBusyId = ref<string | null>(null);

async function refreshQueuedInputs(sessionId = props.session.id) {
  queuedInputs.value = await api.getQueuedSessionInputs(sessionId).catch(() => []);
}

async function editQueuedInput(input: api.QueuedSessionInput) {
  if (queuedActionBusyId.value) return;
  queuedActionBusyId.value = input.id;
  try {
    await api.cancelQueuedSessionInput(props.session.id, input.id);
    const next = [input.message.trim(), inputText.value.trim()].filter(Boolean).join("\n\n");
    inputText.value = next;
    await refreshQueuedInputs();
    await nextTick(() => inputPanelRef.value?.focus());
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "取回排队消息失败", "error");
  } finally {
    queuedActionBusyId.value = null;
  }
}

async function deleteQueuedInput(input: api.QueuedSessionInput) {
  if (queuedActionBusyId.value) return;
  queuedActionBusyId.value = input.id;
  try {
    await api.cancelQueuedSessionInput(props.session.id, input.id);
    await refreshQueuedInputs();
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "删除排队消息失败", "error");
  } finally {
    queuedActionBusyId.value = null;
  }
}

async function submitQueuedInputNow(input: api.QueuedSessionInput) {
  if (queuedActionBusyId.value) return;
  queuedActionBusyId.value = input.id;
  try {
    stopStreaming();
    await api.submitQueuedSessionInput(props.session.id, input.id);
    await refreshQueuedInputs();
    await reloadMessagesFromServer(props.session.id);
    attachToRunningSession();
    void scrollToBottom();
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "立即发送失败", "error");
    await refreshQueuedInputs();
  } finally {
    queuedActionBusyId.value = null;
  }
}

const inputDisabled = computed(
  () =>
    modelMissing.value ||
    providerDisabled.value ||
    isInitializing.value ||
    terminalStatuses.has(props.session.status),
);

/** Stop only while generating — never during create-time initialization. */
const canInterrupt = computed(() => isStreaming.value && !isInitializing.value);

const inputPlaceholder = computed(() => {
  if (modelMissing.value) return "请先为 Agent 配置模型";
  if (providerDisabled.value) return "模型供应商已禁用，无法发送消息";
  if (isInitializing.value) return "正在初始化工作区，请稍候，马上就能开始对话…";
  if (props.session.status === "finish") return "会话已完成";
  if (props.session.status === "error") {
    return chatEntries.value.some((entry) => entry.type === "llm_error")
      ? "模型调用失败，请点击错误卡片重试"
      : "会话出错，请查看菜单中的合并状态";
  }
  if (props.session.status === "stopped") return "会话已停止";
  if (isStreaming.value) return "回复结束后发送";
  if (props.session.meta?.shadow?.status) return props.session.meta.shadow.status;
  return "输入消息";
});

const gitBranch = computed(() => props.session.gitSessionBranch ?? null);

const childSessions = computed(() =>
  sessionStore.sessions.filter((session) => session.parentId === props.session.id),
);
const configurableAgents = computed(() => agentStore.agents.filter((agent) => !agent.isBuiltin));
const shadowEnabled = computed(() => !!props.session.shadowEnabled);
const spawnedAgentIds = computed(() =>
  Array.isArray(props.session.meta?.subagentIds)
    ? props.session.meta.subagentIds
        .filter((id): id is number => typeof id === "number" && Number.isInteger(id))
        .map(String)
    : [],
);

const btwSessions = computed(() =>
  childSessions.value
    .filter((session) => session.spawnType === "btw")
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
);

function onCreateBtw() {
  sessionMenuOpen.value = false;
  openSidePanel("btw");
}

const canCompleteSession = computed(() => {
  if (props.session.isBuiltin || props.session.parentId) return false;
  if (!props.session.gitWorktreeEnabled) return false;
  return !terminalStatuses.has(props.session.status);
});

const canCheckpointActions = computed(() => {
  if (props.session.isBuiltin) return false;
  if (isStreaming.value) return false;
  return props.session.status === "idle";
});
const canSyncSession = computed(
  () => !props.session.isBuiltin && props.session.status !== "finish" && !isStreaming.value,
);
const showPendingSyncBanner = computed(
  () => !!sessionGitPendingUpdate.value && canSyncSession.value,
);
const composerStackActive = computed(
  () => sessionChangedFiles.value.length > 0 || showPendingSyncBanner.value,
);

watch(
  () => props.session.title,
  (title) => {
    if (title) sessionTitle.value = title;
  },
);

watch(
  () => [props.session.id, isExternalAgent.value] as const,
  ([id, external]) => {
    showThinking.value = getShowThinking(id);
    splitAssistantMessages.value = getSplitAssistantMessages(id);
    sessionUsage.value = null;
    if (external) return;
    void api
      .getSessionUsage(id)
      .then((usage) => {
        sessionUsage.value = usage;
      })
      .catch(() => {});
  },
  { immediate: true },
);

function stopStreaming() {
  streamCleanup?.();
  streamCleanup = null;
  if (streamingReconcileTimer) {
    clearInterval(streamingReconcileTimer);
    streamingReconcileTimer = null;
  }
  isStreaming.value = false;
  streamingAssistantId.value = null;
}

function startStreamingReconcilePoll() {
  if (streamingReconcileTimer) clearInterval(streamingReconcileTimer);
  streamingReconcileTimer = setInterval(() => {
    void reconcileStreamingWithServer();
  }, 8000);
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

async function reloadMessagesFromServer(sessionId: string, localSnapshot = chatEntries.value) {
  const [, nextQueued, nextTasks, nextTodos, checkpoints] = await Promise.all([
    sessionStore.fetchSessionMessages(sessionId),
    api.getQueuedSessionInputs(sessionId).catch(() => []),
    api.getSessionTasks(sessionId).catch(() => []),
    api.getSessionTodos(sessionId).catch(() => []),
    api.listCheckpoints(sessionId).catch(() => []),
  ]);
  historyHasMore.value = sessionStore.messageCursors[sessionId]?.hasMore ?? false;
  const entries = sessionStore.messages[sessionId] ?? [];
  chatEntries.value = mergeStreamingToolsIntoPersistedEntries(
    sessionTreeToChatEntries(entries),
    localSnapshot,
  );
  queuedInputs.value = nextQueued;
  rewindableEntryIds.value = checkpoints.map((checkpoint) => checkpoint.entryId);
  tasks.value = nextTasks;
  todos.value = nextTodos;
  const hasTodos = nextTodos.length > 0;
  const preferredPath = props.session.currentTask;
  const selectionExists =
    nextTasks.some((task) => task.path === selectedTaskPath.value) ||
    (selectedTaskPath.value === "$todo" && hasTodos);
  if (!selectedTaskPath.value || !selectionExists) {
    selectedTaskPath.value =
      preferredPath && nextTasks.some((task) => task.path === preferredPath)
        ? preferredPath
        : (nextTasks.find((task) => task.type === "goal")?.path ??
          (hasTodos ? "$todo" : (nextTasks[0]?.path ?? null)));
  }
  if (nextTasks.length === 0 && !hasTodos) taskPaneOpen.value = false;
}

async function loadOlderMessages() {
  if (loadingOlder.value || !historyHasMore.value) return;
  loadingOlder.value = true;
  const listEl = messageListRef.value?.containerRef;
  const prevHeight = listEl?.scrollHeight ?? 0;
  const prevTop = listEl?.scrollTop ?? 0;
  try {
    const page = await sessionStore.fetchOlderSessionMessages(props.session.id);
    historyHasMore.value = page.hasMore;
    const entries = sessionStore.messages[props.session.id] ?? [];
    chatEntries.value = sessionTreeToChatEntries(entries);
    await nextTick();
    if (listEl) {
      listEl.scrollTop = listEl.scrollHeight - prevHeight + prevTop;
    }
    // Keep going if still pinned to the top (or content shorter than viewport).
    await nextTick();
    if (
      historyHasMore.value &&
      listEl &&
      (listEl.scrollTop <= 80 || listEl.scrollHeight <= listEl.clientHeight + 8)
    ) {
      loadingOlder.value = false;
      await loadOlderMessages();
      return;
    }
  } finally {
    loadingOlder.value = false;
  }
}

async function loadSessionMessages(sessionId: string) {
  stopStreaming();
  historyHasMore.value = false;
  const cached = sessionStore.messages[sessionId];
  if (cached?.length) chatEntries.value = sessionTreeToChatEntries(cached);
  else chatEntries.value = [];
  sessionLoading.value = true;
  try {
    await reloadMessagesFromServer(sessionId);
  } finally {
    sessionLoading.value = false;
  }
  sessionTitle.value = props.session.title ?? `Session ${sessionId.substring(0, 8)}`;
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
  const shadowMeta = props.session.meta?.shadow;
  shadowRunning.value = !!(
    shadowMeta &&
    typeof shadowMeta === "object" &&
    !Array.isArray(shadowMeta) &&
    (shadowMeta as { running?: boolean }).running === true
  );
  await maybeResumeRunningSession(sessionId);
}

/** After refresh/open: if the turn is still running, restore the thinking UI + SSE. */
async function maybeResumeRunningSession(sessionId: string) {
  if (sessionId !== props.session.id || isStreaming.value) return;
  let running = props.session.status === "running";
  let streamingReply: string | undefined;
  try {
    const state = await api.getSessionState(sessionId);
    running = running || state.isStreaming;
    if (typeof state.streamingReply === "string" && state.streamingReply.trim()) {
      streamingReply = state.streamingReply;
    }
  } catch {
    // Ignore — status from session row is enough to attempt attach.
  }
  if (!running) return;
  attachToRunningSession(streamingReply);
}

function handleUiNotifyEvent(event: { type?: string } | undefined) {
  if (!event || event.type !== "ui_notify") return false;
  const notify = event as { type: "ui_notify"; kind?: string; message?: string };
  if (typeof notify.message !== "string") return false;
  const kind =
    notify.kind === "success" || notify.kind === "info" || notify.kind === "error"
      ? notify.kind
      : "error";
  showUiMessage(notify.message, kind);
  return true;
}

function handleApprovalEvent(event: api.SessionStreamEvent | undefined) {
  if (!event || event.type !== "approval.pending") return false;
  if (!pendingApprovals.value.some((item) => item.approvalId === event.approvalId)) {
    pendingApprovals.value.push(event);
  }
  return true;
}

function resolvePendingApproval() {
  pendingApprovals.value.shift();
}

async function openPendingPlan() {
  if (!tasks.value.some((task) => task.type === "plan")) {
    tasks.value = await api.getSessionTasks(props.session.id).catch(() => tasks.value);
  }
  const plan =
    tasks.value.find((task) => task.type === "plan" && task.status === "planning") ??
    tasks.value.find((task) => task.type === "plan");
  if (plan) selectedTaskPath.value = plan.path;
  openSidePanel("task");
}

async function restorePendingApprovals(sessionId: string) {
  try {
    pendingApprovals.value = await api.getPendingSessionApprovals(sessionId);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    console.error("Restore pending approvals failed:", error);
  }
}

watch(
  () => props.session.id,
  (sessionId) => {
    pendingApprovals.value = [];
    void restorePendingApprovals(sessionId);
  },
  { immediate: true },
);

function subscribeShadowSuggestions(sessionId: string) {
  shadowSuggestionCleanup?.();
  shadowSuggestionCleanup = api.subscribeSessionEvents(
    sessionId,
    (payload) => {
      if (payload.type !== "agent" || !payload.event) return;
      if (handleUiNotifyEvent(payload.event)) return;
      if (handleApprovalEvent(payload.event)) return;
      if (payload.event.type === "session_status") {
        void sessionStore.fetchSession(sessionId);
        return;
      }
      if (payload.event.type === "shadow_running") {
        shadowRunning.value = payload.event.running;
        return;
      }
      if (payload.event.type !== "shadow_suggestions") return;
      shadowRunning.value = false;
      suggestedQuestions.value = payload.event.questions;
    },
    (error) => {
      if (error.name === "AbortError") return;
      console.error("Shadow suggestion events error:", error);
    },
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
  if (props.session.isBuiltin) return;
  const title = sessionTitle.value.trim();
  if (!title) return;
  await sessionStore.updateSessionMeta(props.session.id, { title });
}

async function onSessionTitleChange(value: string) {
  sessionTitle.value = value;
  await saveSessionTitle();
}

async function onShadowEnabledChange(value: boolean) {
  try {
    await sessionStore.updateSessionMeta(props.session.id, { shadowEnabled: value });
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "影子代理设置更新失败", "error");
  }
}

async function onSpawnedAgentsChange(spawnedAgentIds: string[]) {
  try {
    const { agentIds } = await api.setSessionSubagents(props.session.id, spawnedAgentIds);
    await sessionStore.updateSessionMeta(props.session.id, { subagentIds: agentIds });
    showUiMessage("Session 代理配置已更新", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "代理配置更新失败", "error");
  }
}

function toggleSearch() {
  if (searchOpen.value) {
    closeSearch();
    return;
  }
  openSearch();
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

function onSplitAssistantMessagesChange(value: boolean) {
  splitAssistantMessages.value = value;
  setSplitAssistantMessages(props.session.id, value);
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
  const confirmed = await requestUiConfirm({
    title: "完成会话",
    message: "完成会话将把 worktree 分支合并到主分支，并关闭此会话。请先提交所有变更。继续？",
    confirmText: "完成",
  });
  if (!confirmed) return;
  stopStreaming();
  try {
    await sessionStore.completeSession(props.session.id);
    await sessionStore.fetchSession(props.session.id);
    sessionTitle.value = props.session.title ?? sessionTitle.value;
    showUiMessage("会话已完成", "success");
  } catch (err) {
    showUiMessage(err instanceof Error ? err.message : "完成会话失败", "error");
    await sessionStore.fetchSession(props.session.id);
  }
}

async function onSyncSession() {
  sessionMenuOpen.value = false;
  if (!canCheckpointActions.value || isStreaming.value) return;
  const confirmed = await requestUiConfirm({
    title: "同步项目修改",
    message: "将合并项目最新修改，并重新安装依赖和启动服务。请先提交当前会话中的修改。",
    confirmText: "同步",
  });
  if (!confirmed) return;
  try {
    await withUiBusy("正在同步项目修改…", () => sessionStore.syncSession(props.session.id));
    showUiMessage("同步完成，服务已重新启动", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "同步失败", "error");
  }
}

async function dismissPendingSync() {
  const git = props.session.meta?.git;
  if (!git || typeof git !== "object" || Array.isArray(git)) return;
  const nextGit = { ...(git as Record<string, unknown>) };
  delete nextGit.pendingUpdate;
  try {
    await sessionStore.updateSessionMeta(props.session.id, { git: nextGit });
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "操作失败", "error");
  }
}

async function onCreateCheckpoint() {
  sessionMenuOpen.value = false;
  if (!canCheckpointActions.value) return;
  try {
    await sessionStore.createCheckpoint(props.session.id);
    showUiMessage("存档点已创建", "success");
  } catch (err) {
    console.error("Create checkpoint failed:", err);
    showUiMessage(err instanceof Error ? err.message : "创建存档点失败", "error");
  }
}

async function onRewindSession() {
  sessionMenuOpen.value = false;
  if (!canCheckpointActions.value) return;
  try {
    const checkpoints = await sessionStore.listCheckpoints(props.session.id);
    if (checkpoints.length === 0) {
      showUiMessage("没有可用的存档点", "info");
      return;
    }
    const target = checkpoints[checkpoints.length - 1]!;
    const confirmed = await requestUiConfirm({
      title: "回滚存档点",
      message: `回滚到最近存档点 ${target.label ?? target.id.slice(0, 8)}？将恢复代码与会话位置。`,
      confirmText: "回滚",
      danger: true,
    });
    if (!confirmed) return;
    stopStreaming();
    await sessionStore.rewindSession(props.session.id, target.id);
    await reloadMessagesFromServer(props.session.id);
    showUiMessage("已回滚到存档点", "success");
  } catch (err) {
    console.error("Rewind failed:", err);
    showUiMessage(err instanceof Error ? err.message : "回滚失败", "error");
  }
}

async function onCommitSession() {
  sessionMenuOpen.value = false;
  if (!canCheckpointActions.value) return;
  try {
    const result = await sessionStore.commitSession(props.session.id);
    if (!result.commit) {
      showUiMessage("没有需要提交的变更", "info");
      return;
    }
    await reloadMessagesFromServer(props.session.id);
    void scrollToBottom();
    showUiMessage("已提交变更", "success");
  } catch (err) {
    console.error("Commit failed:", err);
    showUiMessage(err instanceof Error ? err.message : "提交失败", "error");
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

async function prepareChatViewport(sessionId: string) {
  await scrollToBottom();
  await nextTick();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
  if (props.session.id !== sessionId) return;
  await scrollToBottom();
  chatViewportReady.value = true;
}

watch(
  () => props.session.id,
  (id) => {
    chatViewportReady.value = false;
    subscribeShadowSuggestions(id);
    void loadSessionMessages(id).then(() => prepareChatViewport(id));
  },
  { immediate: true },
);

// Create returns as `initializing` while worktree/runtime prepare; refresh until ready.
let initializingPollTimer: ReturnType<typeof setInterval> | null = null;
watch(
  () => [props.session.id, props.session.status] as const,
  ([id, status]) => {
    if (initializingPollTimer) {
      clearInterval(initializingPollTimer);
      initializingPollTimer = null;
    }
    if (status !== "initializing") return;
    initializingPollTimer = setInterval(() => {
      void sessionStore.fetchSession(id);
    }, 500);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (props.session?.id) void endLiveStatus(props.session.id);
  window.removeEventListener("supervisor:open-file", onOpenFileEvent);
  window.removeEventListener("resize", syncMobileViewport);
  stopStreaming();
  shadowSuggestionCleanup?.();
  shadowSuggestionCleanup = null;
  if (initializingPollTimer) {
    clearInterval(initializingPollTimer);
    initializingPollTimer = null;
  }
  if (streamingReconcileTimer) {
    clearInterval(streamingReconcileTimer);
    streamingReconcileTimer = null;
  }
});

const displayGroups = computed(() =>
  buildDisplayGroups(chatEntries.value, {
    splitAssistantMessages: splitAssistantMessages.value,
  }),
);
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
  if (isInitializing.value) return "initializing";
  if (isStreaming.value) return "running";
  if (props.session.status === "blocked" || pendingAsk.value) return "blocked";
  return props.session.status;
});

const sessionServices = computed(() => parseSessionServicesFromMeta(props.session.meta));
const servicesRunning = computed(() => sessionServices.value?.status === "running");
const servicePreviews = computed<SessionServicesPreview[]>(() => {
  const services = sessionServices.value;
  if (!services?.uiPorts?.length) return [];
  return services.uiPorts.map((port) => ({
    ...port,
    previewUrl: api.buildSessionPreviewUrl(props.session.id, port.scriptName, port.path ?? "/"),
  }));
});
const hasServicePreviews = computed(() => servicePreviews.value.length > 0);

async function togglePreviewSplit() {
  if (!hasServicePreviews.value) return;
  if (previewSplitOpen.value) {
    previewSplitOpen.value = false;
    return;
  }
  if (isMobileViewport.value) closeAllSidePanels();
  else {
    taskPaneOpen.value = false;
    btwPanelOpen.value = false;
    showLogPanel.value = false;
    showFilesPanel.value = false;
    toolPanel.value = null;
  }
  if (sessionServices.value?.status === "stopped") {
    previewLoading.value = true;
    try {
      await api.wakeSessionServices(props.session.id);
      await sessionStore.fetchSession(props.session.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      showUiMessage(`唤醒服务失败：${message}`, "error");
      return;
    } finally {
      previewLoading.value = false;
    }
  }
  previewSplitOpen.value = true;
}

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
    sessionName: props.session.title ?? sessionTitle.value,
    prompt: ask.prompt,
    muted: sessionMuted.value,
  });
});

const visibleGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (searchOpen.value && q)
    return displayGroups.value.filter((group) => groupMatchesSearch(group, q));
  return displayGroups.value;
});

const hasOlderMessages = computed(() => !searchOpen.value && historyHasMore.value);

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

async function openToolDetail(
  toolName: string,
  callArgs?: Record<string, unknown>,
  resultContent?: Array<{ type: string; text: string }>,
  resultEntryId?: string,
) {
  if (toolName === "external_interaction" || callArgs?.externalInteraction === true) {
    openExternalInteractionDetail(callArgs, resultContent);
    return;
  }
  let content = resultContent;
  const truncated = chatEntries.value.some(
    (entry) =>
      entry.type === "toolResult" && entry.id === resultEntryId && entry.truncated === true,
  );
  if (truncated && resultEntryId) {
    try {
      const full = await api.getSessionMessage(props.session.id, resultEntryId);
      const fullEntry = sessionTreeToChatEntries([full])[0];
      if (fullEntry?.type === "toolResult") content = fullEntry.content;
    } catch (error) {
      console.error("Failed to load full tool result:", error);
    }
  }
  const detail = buildToolModal(toolName, callArgs, content);
  const normalizedToolName = toolName.toLowerCase();
  const isEval = normalizedToolName.includes("eval");
  const isTerminal = isEval || normalizedToolName.includes("bash");
  if (isTerminal || isMobileViewport.value) {
    setToolPanel({ ...detail, ...(isTerminal ? { terminal: isEval ? "eval" : "bash" } : {}) });
  } else toolModal.value = detail;
}

function openExternalInteractionDetail(
  callArgs?: Record<string, unknown>,
  resultContent?: Array<{ type: string; text: string }>,
) {
  toolModal.value = buildExternalInteractionModal(callArgs, resultContent);
}

function openEvalPanel() {
  setToolPanel({
    title: "Eval",
    sections: [{ label: "运行环境", content: "正在读取 Eval 历史…" }],
    terminal: "eval",
  });
}

function toggleEvalPanel() {
  if (toolPanel.value?.terminal === "eval") {
    toolPanel.value = null;
    return;
  }
  openEvalPanel();
}

async function openBashDetail(
  command: string,
  resultContent?: Array<{ type: string; text: string }>,
  intent?: string,
  resultEntryId?: string,
) {
  let content = resultContent;
  const truncated = chatEntries.value.some(
    (entry) =>
      entry.type === "toolResult" && entry.id === resultEntryId && entry.truncated === true,
  );
  if (truncated && resultEntryId) {
    try {
      const full = await api.getSessionMessage(props.session.id, resultEntryId);
      const fullEntry = sessionTreeToChatEntries([full])[0];
      if (fullEntry?.type === "toolResult") content = fullEntry.content;
    } catch (error) {
      console.error("Failed to load full bash result:", error);
    }
  }
  const detail = buildBashModal(command, content, intent);
  const output = content?.map((part) => part.text ?? "").join("\n") ?? "";
  const terminalPresentation =
    content === undefined || output.length > 1000 || output.split(/\r?\n/).length > 8;
  if (terminalPresentation) setToolPanel({ ...detail, terminal: "bash" });
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

function attachToRunningSession(streamingReply?: string) {
  if (isStreaming.value) return;

  const groups = displayGroups.value;
  const lastGroup = groups[groups.length - 1];
  const trailingUser =
    !!lastGroup && lastGroup.type === "message" && lastGroup.message?.role === "user";
  // Codex only persists the assistant message at turn end — after refresh the
  // trailing entry is usually the user message, so always open a fresh bubble.
  const assistantId =
    trailingUser || !lastGroup
      ? `stream-${Date.now()}`
      : (streamingAssistantId.value ??
        (lastGroup.type === "grouped_assistant" ? lastGroup.id : `stream-${Date.now()}`));

  const hasStreamingEntry = chatEntries.value.some((entry) => entry.id === assistantId);
  if (!hasStreamingEntry) {
    const entry = createStreamingAssistantEntry(assistantId);
    if (
      streamingReply?.trim() &&
      entry.type === "message" &&
      Array.isArray(entry.message.content)
    ) {
      entry.message.content = [{ type: "text", text: streamingReply }];
    }
    chatEntries.value.push(entry);
  }

  streamingAssistantId.value = assistantId;
  isStreaming.value = true;
  startStreamingReconcilePoll();
  void sessionStore.fetchSession(props.session.id);

  streamCleanup = api.subscribeSessionEvents(
    props.session.id,
    (payload) => {
      if (payload.type !== "agent" || !payload.event) return;
      if (handleUiNotifyEvent(payload.event)) return;
      if (handleApprovalEvent(payload.event)) return;
      if (payload.event.type === "session_status") {
        void sessionStore.fetchSession(props.session.id);
        if (payload.event.status === "idle" || payload.event.status === "error") {
          stopStreaming();
          void reloadMessagesFromServer(props.session.id).then(() => scrollToBottom());
          void sessionStore.fetchSessions();
        }
        return;
      }
      if (payload.event.type === "shadow_suggestions") return;
      applyAgentEventToChatEntries(
        chatEntries.value,
        assistantId,
        payload.event as import("@earendil-works/pi-agent-core").AgentEvent,
      );
      void scrollToBottom();
      if (payload.event.type === "agent_end") {
        const snapshot = chatEntries.value;
        stopStreaming();
        void reloadMessagesFromServer(props.session.id, snapshot).then(() => scrollToBottom());
        void sessionStore.fetchSessions();
      }
    },
    (err) => {
      if (err.name === "AbortError") return;
      console.error("Session events error:", err);
      showUiMessage(err.message, "error");
      void reconcileStreamingWithServer();
    },
    () => {
      // Connected after refresh: if the turn already finished, drop thinking UI.
      void reconcileStreamingWithServer();
    },
    () => {
      // SSE dropped (server restart / network). Don't leave the UI stuck on 思考中.
      void reconcileStreamingWithServer();
    },
  );
}

async function reconcileStreamingWithServer() {
  if (!isStreaming.value) return;
  try {
    const state = await api.getSessionState(props.session.id);
    if (state.isStreaming || state.status === "running") return;
  } catch {
    // Session gone or API down — still clear local thinking UI.
  }
  stopStreaming();
  void reloadMessagesFromServer(props.session.id).then(() => scrollToBottom());
  void sessionStore.fetchSessions();
}

async function sendStreamReply(userText: string, images: ChatSendPayload["images"]) {
  const assistantId = `stream-${Date.now()}`;
  streamingAssistantId.value = assistantId;
  isStreaming.value = true;
  startStreamingReconcilePoll();

  const userEntry = [...chatEntries.value]
    .reverse()
    .find((entry) => entry.type === "message" && entry.message.role === "user");
  activeTurn.value = userEntry
    ? { userEntryId: userEntry.id, text: userText, assistantActivitySeen: false }
    : null;

  chatEntries.value.push(createStreamingAssistantEntry(assistantId));
  void scrollToBottom();

  const imagePayload = images.map((img) => ({
    mediaId: img.mediaId,
    mimeType: img.mimeType,
    name: img.name,
  }));
  const sessionName = props.session.title ?? "会话";

  streamCleanup = api.promptSession(
    props.session.id,
    userText,
    (event) => {
      if (handleUiNotifyEvent(event)) return;
      if (handleApprovalEvent(event)) return;
      if (event.type === "shadow_suggestions") return;
      if (
        activeTurn.value &&
        (event.type === "message_update" ||
          event.type === "tool_execution_start" ||
          event.type === "tool_execution_end")
      ) {
        activeTurn.value.assistantActivitySeen = true;
      }
      applyAgentEventToChatEntries(
        chatEntries.value,
        assistantId,
        event as import("@earendil-works/pi-agent-core").AgentEvent,
      );
      void scrollToBottom();
    },
    (err) => {
      console.error("Stream error:", err);
      showUiMessage(err.message, "error");
      // Drop the optimistic streaming bubble; server persists llm_error on failure.
      chatEntries.value = chatEntries.value.filter((entry) => entry.id !== assistantId);
      if (userEntry && userEntry.type === "message") {
        userEntry.deliveryState = "failed";
      }
      isStreaming.value = false;
      streamingAssistantId.value = null;
      streamCleanup = null;
      activeTurn.value = null;
      void reloadMessagesFromServer(props.session.id).then(() => scrollToBottom());
      void sessionStore.fetchSessions();
    },
    () => {
      if (!isStreaming.value && !streamingAssistantId.value) {
        // Error path already finalized the turn.
        return;
      }
      const snapshot = chatEntries.value;
      isStreaming.value = false;
      streamingAssistantId.value = null;
      streamCleanup = null;
      activeTurn.value = null;
      void reloadMessagesFromServer(props.session.id, snapshot).then(() => scrollToBottom());
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

  inputText.value = "";
  inputPanelRef.value?.clearAfterSend();
  if (isStreaming.value) {
    // Queue above the composer; do not inject a chat bubble with "排队中".
    const images = payload.images.map((image) => ({
      mediaId: image.mediaId,
      mimeType: image.mimeType,
      name: image.name,
    }));
    void api
      .followUpSession(props.session.id, text, images)
      .then(() => refreshQueuedInputs())
      .catch((error) => {
        console.error("Send during streaming failed:", error);
        showUiMessage(error instanceof Error ? error.message : "排队发送失败", "error");
        void refreshQueuedInputs();
      });
    return;
  }
  const userEntry = createUserChatEntry(Date.now().toString(), text || " ");
  chatEntries.value.push(userEntry);
  void scrollToBottom();
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

@media (min-width: 768px) {
  /* PC 聊天：白底 + 灰气泡，消息区居中（与移动端微信风格区分） */
  .chat-view {
    --app-chat-input-island-border: var(--app-border);
    --app-chat-bg: #ffffff;
    --app-chat-header-bg: #ffffff;
    --app-chat-message-bg: #ffffff;
    --app-chat-message-inherited: #fafafa;
    --app-bubble-assistant: #ededf0;
    --app-chat-input-island-bg: #ffffff;
    --chat-conversation-max-width: 880px;
  }

  html[data-theme="dark"] .chat-view {
    --app-chat-bg: #1a1a1a;
    --app-chat-header-bg: #1a1a1a;
    --app-chat-message-bg: #1a1a1a;
    --app-chat-message-inherited: #202020;
    --app-bubble-assistant: #2c2c2c;
    --app-chat-input-island-bg: #1a1a1a;
  }

  .chat-view :deep(.chat-view-header) {
    height: 52px;
    padding-inline: 16px;
  }

  .chat-view .chat-message-list-host :deep(.chat-message-list) {
    box-sizing: border-box;
    padding-inline: max(12px, calc((100% - var(--chat-conversation-max-width)) / 2));
  }
}

.chat-workspace {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1;
}

.chat-workspace__conversation {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.chat-message-list-host {
  min-height: 0;
  flex: 1;
}

.chat-message-list-host--positioning {
  visibility: hidden;
  pointer-events: none;
}

.chat-view--builtin-assistant :deep(.assistant-message-body .md-content) {
  color: var(--app-accent);
}

.chat-panel-host {
  position: relative;
  display: flex;
  min-width: 320px;
  max-width: min(72vw, 960px);
  flex: none;
}

.chat-panel-host > :deep(.resize-handle--vertical) {
  right: auto;
  left: 0;
  transform: translateX(-50%);
}

.chat-composer-stack {
  margin: 0 8px 8px;
}

.chat-composer-stack--has-changes {
  overflow: hidden;
  border: 1px solid var(--app-chat-input-island-border);
  border-radius: 12px;
  background: var(--app-chat-input-island-bg, var(--app-chat-bg));
}

.chat-composer-stack--has-changes :deep(.chat-input-shell) {
  padding: 0 8px 8px;
  background: transparent;
}

.chat-composer-stack--has-changes :deep(.chat-input-island) {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.chat-composer-stack--has-changes :deep(.changes-wrap) {
  border-bottom: 1px solid var(--app-border-subtle);
}

.chat-composer-stack--has-changes :deep(.pending-sync-wrap) {
  border-bottom: 1px solid var(--app-border-subtle);
}

.chat-panel-host :deep(.tool-detail-panel),
.chat-panel-host :deep(.task-workspace),
.chat-panel-host :deep(.btw-panel),
.chat-panel-host :deep(.session-log-panel),
.chat-panel-host :deep(.session-files-panel) {
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
.session-loading--overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  min-height: 0;
  background: var(--app-chat-message-bg, var(--app-chat-bg));
}
.session-loading svg {
  width: 17px;
  height: 17px;
  animation: spin 0.8s linear infinite;
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
  .chat-panel-host {
    width: 100% !important;
    min-width: 0;
    max-width: none;
  }

  .chat-panel-host > :deep(.resize-handle--vertical) {
    display: none;
  }
  .chat-composer-changes {
    margin: 0 5px 5px;
  }
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
</style>
