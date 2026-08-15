<template>
  <div
    class="chat-view relative flex flex-col h-full w-full"
    :class="{ 'chat-view--builtin-assistant': session.isBuiltin }"
    :style="{ background: 'var(--app-chat-bg)', '--chat-msg-font-size': fontSizePx }"
    v-if="session"
  >
    <ToolApprovalDialog
      v-if="pendingPlanApproval"
      :session-id="session.id"
      :approval="pendingPlanApproval"
      @resolved="resolvePendingApproval(pendingPlanApproval.approvalId)"
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
          <ChatHeaderAction :title="t('chat.searchMessages')" :active="searchOpen" @click="toggleSearch">
            <Search />
          </ChatHeaderAction>
          <ChatHeaderAction :title="t('chat.viewLog')" :active="logActionActive" @click="toggleLogPanel">
            <ScrollText />
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
          v-if="hasServicePreviews"
            :title="`${t('chat.activeApps')} · ${servicePreviews.length}`"
          :active="previewActionActive"
          :count="servicePreviews.length"
          @click="toggleSessionPreview"
        >
          <AppWindow />
        </ChatHeaderAction>
        <ChatHeaderAction
          v-if="backgroundBashCount > 0"
            :title="`${t('chat.backgroundTerminal')} · ${backgroundBashCount}`"
          :active="bashTerminalsActionActive"
          :count="backgroundBashCount"
          @click="toggleBackgroundBashPanel"
        >
          <Terminal />
        </ChatHeaderAction>
        <ChatHeaderAction
          v-if="hasEvalActivity"
          :title="t('chat.viewEval')"
          :active="evalActionActive"
          @click="toggleEvalPanel"
        >
          <Braces />
        </ChatHeaderAction>
        <ChatHeaderAction
          class="desktop-only-action"
          :title="t('chat.workspaceFiles')"
          :active="filesActionActive"
          @click="toggleFilesPanel"
        >
          <FolderTree />
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
            :title="t('chat.sessionTools')"
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
      <div
        ref="conversationHostRef"
        class="chat-workspace__conversation"
        @touchstart.passive="onConversationTouchStart"
        @touchend="onConversationTouchEnd"
      >
        <div
          v-if="!chatViewportReady && !searchOpen"
          class="session-loading session-loading--overlay"
        >
          <Loader2 /><span>{{ t("chat.loadingHistory") }}</span>
        </div>
        <div class="chat-main-row">
          <MessageMinimap
            v-if="showMessageMinimap"
            :turns="minimapTurns"
            @select="onMinimapSelect"
          />
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
          <ToolPermissionCard
            v-if="pendingToolPermission"
            :session-id="session.id"
            :approval="pendingToolPermission"
            @resolved="resolvePendingApproval(pendingToolPermission.approvalId)"
          />
        </div>

        <div v-if="suggestedQuestions.length" class="suggested-questions">
          <span>{{ t("chat.suggestions") }}</span>
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
          v-if="chatComposerReady"
          :inputs="queuedInputs"
          :busy-id="queuedActionBusyId"
          @edit="editQueuedInput"
          @submit="submitQueuedInputNow"
          @delete="deleteQueuedInput"
        />

        <div
          v-if="chatComposerReady"
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
            :empty-state-title="modelMissing ? t('chat.configureModel') : undefined"
            :empty-state-description="modelMissing ? t('chat.chooseModelContinue') : undefined"
            :empty-state-action="modelMissing ? t('chat.chooseModel') : undefined"
            @send="sendMessage"
            @interrupt="interruptCurrentTurn"
            @slash="executeCustomSlash"
            @empty-action="openModelPicker"
            @btw="onCreateBtw"
          />
        </div>

        <FloatingPreviewOrb
          v-if="isMobileViewport"
          :visible="hasServicePreviews"
          :active="servicesRunning"
          :open="mobilePreviewOpen"
          :count="servicePreviews.length"
          :container-ref="conversationHostRef"
          :storage-key="`supervisor:preview-orb:${session.id}`"
          :label="t('chat.activeApps')"
          @toggle="toggleMobilePreview"
        />
        <FloatingPreviewOrb
          v-if="isMobileViewport"
          :visible="backgroundBashCount > 0"
          :active="backgroundBashCount > 0"
          :open="mobileBashOpen"
          :count="backgroundBashCount"
          default-side="right"
          :label="t('chat.backgroundTerminal')"
          :container-ref="conversationHostRef"
          :storage-key="`supervisor:bash-orb:${session.id}`"
          @toggle="toggleMobileBash"
        />

        <SessionAppPreviewBrowser
          v-if="isMobileViewport"
          :open="mobilePreviewOpen"
          :previews="servicePreviews"
          :loading="previewLoading"
          v-model="lastPreviewKey"
          @close="mobilePreviewOpen = false"
        />
        <ResponsiveSplitSurface
          :open="isMobileViewport && mobileBashOpen"
          :ariaLabel="t('chat.backgroundTerminal')"
          :width="sidePanelWidth"
          @close="mobileBashOpen = false"
          @resize-start="startSidePanelResize"
        >
          <SessionBackgroundBashPanel
            class="chat-panel-host__body"
            :session-id="session.id"
            :initial-job-id="mobileBashJobId ?? undefined"
            @close="mobileBashOpen = false"
          />
        </ResponsiveSplitSurface>
      </div>

      <ResponsiveSplitSurface
        :open="Boolean(taskPaneOpen && taskCount)"
        :ariaLabel="t('chat.todo')"
        :width="sidePanelWidth"
        @close="taskPaneOpen = false"
        @resize-start="startSidePanelResize"
      >
        <template #default="{ mobile }">
          <TaskWorkspacePanel
            :mobile="mobile"
            class="chat-panel-host__body"
            :tasks="tasks"
            :todos="todos"
            :selected-path="selectedTaskPath"
            @select="selectedTaskPath = $event"
            @close="taskPaneOpen = false"
          />
        </template>
      </ResponsiveSplitSurface>

      <ResponsiveSplitSurface
        :open="btwPanelOpen"
        :ariaLabel="t('chat.suggestions')"
        :width="sidePanelWidth"
        @close="btwPanelOpen = false"
        @resize-start="startSidePanelResize"
      >
        <template #default="{ mobile }">
          <BtwSplitPanel
            :mobile="mobile"
            class="chat-panel-host__body"
            :parent-id="session.id"
            :sessions="btwSessions"
            @close="btwPanelOpen = false"
          />
        </template>
      </ResponsiveSplitSurface>

      <!-- Mobile: exclusive drawers (unchanged) -->
      <ResponsiveSplitSurface
        :open="isMobileViewport && showLogPanel"
        :ariaLabel="t('chat.sessionLog')"
        :width="sidePanelWidth"
        @close="showLogPanel = false"
        @resize-start="startSidePanelResize"
      >
        <template #default="{ mobile }">
          <SessionLogPanel
            :mobile="mobile"
            :active="showLogPanel"
            class="chat-panel-host__body chat-workspace__side-panel"
            :session-id="session.id"
            @close="showLogPanel = false"
          />
        </template>
      </ResponsiveSplitSurface>

      <ResponsiveSplitSurface
        :open="isMobileViewport && showFilesPanel"
        :ariaLabel="t('chat.workspaceFiles')"
        :width="sidePanelWidth"
        @close="showFilesPanel = false"
        @resize-start="startSidePanelResize"
      >
        <template #default="{ mobile }">
          <SessionFilesPanel
            :mobile="mobile"
            class="chat-panel-host__body chat-workspace__side-panel"
            :session-id="session.id"
            :initial-path="requestedFilePath"
            :changed-files="sessionChangedFiles"
            @close="showFilesPanel = false"
          />
        </template>
      </ResponsiveSplitSurface>

      <ResponsiveSplitSurface
        :open="isMobileViewport && Boolean(toolPanel)"
        :ariaLabel="toolPanel?.title ?? t('tool.close')"
        :width="sidePanelWidth"
        @close="toolPanel = null"
        @resize-start="startSidePanelResize"
      >
        <template #default="{ mobile }">
          <ToolDetailPanel
            v-if="toolPanel"
            :mobile="mobile"
            class="chat-panel-host__body chat-workspace__tool-panel"
            :title="toolPanel.title"
            :sections="toolPanel.sections"
            :terminal="toolPanel.terminal"
            :job-id="toolPanel.jobId"
            :session-id="session.id"
            @close="toolPanel = null"
            @job-ended="onEvalJobEnded"
          />
        </template>
      </ResponsiveSplitSurface>

      <!-- PC: browser-like multi-tab content surface -->
      <ResponsiveSplitSurface
        :open="!isMobileViewport && contentPanelOpen"
        :ariaLabel="t('chat.sessionLog')"
        :width="sidePanelWidth"
        :tabs="contentSplitTabs"
        :active-tab-id="activeContentTabId"
        @update:active-tab-id="activeContentTabId = $event"
        @close-tab="closeContentTab"
        @close="clearContentTabs"
        @resize-start="startSidePanelResize"
      >
        <template v-for="tab in contentTabs" :key="tab.id">
          <SessionLogPanel
            v-if="tab.kind === 'log'"
            v-show="activeContentTabId === tab.id"
            embedded
            :active="activeContentTabId === tab.id"
            class="chat-panel-host__body"
            :session-id="session.id"
            @close="closeContentTab('log')"
          />
          <SessionFilePreviewPane
            v-else-if="tab.kind === 'file'"
            v-show="activeContentTabId === tab.id"
            class="chat-panel-host__body"
            :session-id="session.id"
            :path="tab.path"
            :changed-files="sessionChangedFiles"
          />
          <ToolDetailPanel
            v-else-if="tab.kind === 'tool'"
            v-show="activeContentTabId === tab.id"
            embedded
            class="chat-panel-host__body chat-workspace__tool-panel"
            :title="tab.title"
            :sections="tab.sections"
            :terminal="tab.terminal"
            :job-id="tab.jobId"
            :session-id="session.id"
            @close="closeContentTab(tab.id)"
            @job-ended="onEvalJobEnded"
          />
          <SessionPreviewPanel
            v-else-if="tab.kind === 'preview'"
            v-show="activeContentTabId === tab.id"
            embedded
            class="chat-panel-host__body"
            :previews="servicePreviews"
            :loading="previewLoading"
            v-model="lastPreviewKey"
            @close="closeContentTab('preview')"
          />
          <SessionBackgroundBashPanel
            v-else-if="tab.kind === 'bash-terminals'"
            v-show="activeContentTabId === tab.id"
            embedded
            class="chat-panel-host__body"
            :session-id="session.id"
            :initial-job-id="tab.jobId"
            @close="closeContentTab('bash-terminals')"
          />
        </template>
      </ResponsiveSplitSurface>

      <SessionFileTreeSidebar
        v-if="!isMobileViewport && showFileTreeSidebar"
        :session-id="session.id"
        :selected-path="selectedFileTabPath"
        :changed-files="sessionChangedFiles"
        @select="openFileContentTab"
        @close="showFileTreeSidebar = false"
      />
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
      :cwd="session.cwd || workspaceId || null"
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
              <strong>{{ t("chat.chooseModel") }}</strong
              ><button type="button" @click="modelPickerOpen = false">{{ t("chat.cancel") }}</button>
            </header>
            <div class="model-picker-search">
              <Search class="h-4 w-4" />
              <input v-model="modelSearch" type="search" :placeholder="t('chat.searchProviderModel')" autofocus />
            </div>
            <div class="model-picker-list">
              <div v-if="modelPickerLoading" class="model-picker-empty">
                <Loader2 class="model-picker-spinner" />{{ t("chat.loadingModels") }}
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
                {{ modelSearch ? t("chat.noMatchingModels") : t("chat.noModelsHint") }}
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
  AppWindow,
  Braces,
  ClipboardList,
  FolderTree,
  Loader2,
  SlidersHorizontal,
  ScrollText,
  Search,
  Terminal,
} from "lucide-vue-next";
import { useSessionStore, useAgentStore, useProviderStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import { requestUiConfirm, requestUiDeleteConfirm } from "@/composables/use-ui-confirm";
import { withUiBusy } from "@/composables/use-ui-busy";
import { viewPreferences } from "@/utils/view-preferences";
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
import ToolDetailModal from "../components/tool/ToolDetailModal.vue";
import ToolDetailPanel from "../components/tool/ToolDetailPanel.vue";
import BtwSplitPanel from "../components/session/BtwSplitPanel.vue";
import ChatInputPanel from "../components/chat/ChatInputPanel.vue";
import ExternalAgentCommandHost from "../components/external-agent/ExternalAgentCommandHost.vue";
import ChatSessionMenu from "../components/session/ChatSessionMenu.vue";
import SessionLogPanel from "../components/session/SessionLogPanel.vue";
import SessionFilesPanel from "../components/session/SessionFilesPanel.vue";
import SessionFilePreviewPane from "../components/session/SessionFilePreviewPane.vue";
import SessionFileTreeSidebar from "../components/session/SessionFileTreeSidebar.vue";
import { ResponsiveSplitSurface } from "../components/base";
import { fileBasename, isSupervisorRuntimePath } from "../utils/session-file-tree";
import { useResizableWidth } from "../composables/use-resizable-width";
import { useMobileViewport } from "../composables/use-mobile-viewport";
import ChatViewHeader from "../components/chat/ChatViewHeader.vue";
import ChatSearchBar from "../components/chat/ChatSearchBar.vue";
import ChatMessageList from "../components/chat/ChatMessageList.vue";
import MessageMinimap from "../components/chat/MessageMinimap.vue";
import QueuedInputsBar from "../components/chat/QueuedInputsBar.vue";
import { useSessionMessageSync } from "../composables/use-session-message-sync";
import { chatEntriesToTurns } from "../utils/session-turns";
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
import SessionPreviewPanel from "../components/session/SessionPreviewPanel.vue";
import SessionAppPreviewBrowser from "../components/session/SessionAppPreviewBrowser.vue";
import FloatingPreviewOrb from "../components/mobile/FloatingPreviewOrb.vue";
import SessionBackgroundBashPanel from "../components/session/SessionBackgroundBashPanel.vue";
import ToolApprovalDialog from "../components/tool/ToolApprovalDialog.vue";
import ToolPermissionCard from "../components/chat/ToolPermissionCard.vue";
import type { ChatSendPayload } from "@/types/chat-compose";
import {
  getShowThinking,
  getSplitAssistantMessages,
  setShowThinking,
  setSplitAssistantMessages,
} from "../composables/use-chat-session-prefs";
import { useChatFontSize } from "../composables/use-chat-font-size";
import {
  attachPendingShareToInput,
  usePendingShareRevision,
} from "../composables/use-pending-share";
import { notifyAskUserInput, notifyMessageComplete } from "../composables/use-notifications";
import { syncAgentLiveStatus } from "../composables/use-live-status";
import { findPendingAskInDisplayGroups } from "../utils/ask-tool";
import { parseSessionStage } from "../utils/workflow";
import {
  parseSessionServicesFromMeta,
  type SessionServicesPreview,
} from "../utils/session-services";
import { sessionAvatar, type SessionAvatarValue } from "../utils/session-avatar";
import { useI18n } from "@/i18n";

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
    cwd?: string | null;
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
const { t } = useI18n();

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
  const raw: SessionChangedFileView[] = Array.isArray(props.session.meta?.changedFiles)
    ? props.session.meta.changedFiles
    : (() => {
        const files = new Map<string, SessionChangedFileView>();
        for (const turn of props.session.meta?.turns ?? []) {
          for (const path of turn.files?.added ?? []) files.set(path, { path, status: "added" });
          for (const path of turn.files?.modified ?? []) {
            files.set(path, {
              path,
              status: files.get(path)?.status === "added" ? "added" : "modified",
            });
          }
          for (const path of turn.files?.deleted ?? [])
            files.set(path, { path, status: "deleted" });
        }
        return [...files.values()];
      })();
  return raw
    .filter((file) => file?.path && !isSupervisorRuntimePath(file.path))
    .sort((a, b) => a.path.localeCompare(b.path));
});

const sessionStore = useSessionStore();
const { width: sidePanelWidth, startResize: startSidePanelResize } = useResizableWidth({
  defaultWidth: 420,
  minWidth: 280,
  maxWidth: 560,
  storageKey: "supervisor:chat-side-panel-width",
  direction: "rtl",
});
const isMobileViewport = useMobileViewport();

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
const pendingToolPermission = computed(
  () => pendingApprovals.value.find((item) => item.kind === "tool_permission") ?? null,
);
const pendingPlanApproval = computed(
  () => pendingApprovals.value.find((item) => item.kind === "plan_review") ?? null,
);
const rewindableEntryIds = ref<string[]>([]);
const inputPanelRef = ref<InstanceType<typeof ChatInputPanel> | null>(null);
const pendingShareRevision = usePendingShareRevision();
const externalCommandHostRef = ref<InstanceType<typeof ExternalAgentCommandHost> | null>(null);
const messageListRef = ref<InstanceType<typeof ChatMessageList> | null>(null);
const searchBarRef = ref<InstanceType<typeof ChatSearchBar> | null>(null);
const sessionTitle = ref("");
const chatEntries = ref<ChatEntry[]>([]);
const sessionIdRef = computed(() => props.session.id);
/** Web + mobile both sync into MessageStorage; minimap UI is PC-only. */
const enableMessageArchiveCrawl = computed(() => true);
const { turns: archivedTurns } = useSessionMessageSync({
  sessionId: sessionIdRef,
  chatEntries,
  enableBackgroundCrawl: enableMessageArchiveCrawl,
});
const fallbackMinimapTurns = computed(() =>
  chatEntriesToTurns(props.session.id, chatEntries.value),
);
const minimapTurns = computed(() =>
  archivedTurns.value.length > 0 ? archivedTurns.value : fallbackMinimapTurns.value,
);
const showMessageMinimap = computed(() => !isMobileViewport.value && minimapTurns.value.length > 0);
const sessionLoading = ref(false);
const chatViewportReady = ref(false);
const chatComposerReady = computed(() => chatViewportReady.value || searchOpen.value);
const historyHasMore = ref(false);
const loadingOlder = ref(false);
const toolModal = ref<{ title: string; sections: { label: string; content: string }[] } | null>(
  null,
);
const toolPanel = ref<{
  title: string;
  sections: { label: string; content: string }[];
  terminal?: "bash" | "eval";
  jobId?: string;
} | null>(null);

function openJobDetail(request: JobDetailRequest): void {
  // Mobile: exclusive drawer; PC: content tab (both via setToolPanel)
  setToolPanel({
    title: request.title,
    sections: request.sections,
    terminal: request.terminal,
    jobId: request.jobId,
  });
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
          ? t("chat.awaitingConfirmation")
          : status === "error"
            ? t("chat.errorNeedsAction")
            : streaming
              ? t("chat.thinking")
              : status === "running"
                ? t("chat.running")
                : t("chat.connecting"),
      phase:
        status === "blocked" || status === "error"
          ? "waiting"
          : streaming
            ? "thinking"
            : "connecting",
      running,
      status,
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
const mobilePreviewOpen = ref(false);
const mobileBashOpen = ref(false);
const mobileBashJobId = ref<string | null>(null);
const backgroundBashCount = ref(0);
let backgroundBashPoll: ReturnType<typeof setInterval> | undefined;
const previewLoading = ref(false);
const lastPreviewKey = ref("");
const conversationHostRef = ref<HTMLElement | null>(null);
const showLogPanel = ref(false);
const showFilesPanel = ref(false);
const requestedFilePath = ref<string | null>(null);

type SidePanelKind = "task" | "btw" | "log" | "files";

type ContentTab =
  | { id: "log"; kind: "log"; title: string }
  | { id: "preview"; kind: "preview"; title: string }
  | { id: "bash-terminals"; kind: "bash-terminals"; title: string; jobId?: string }
  | { id: string; kind: "file"; path: string; title: string }
  | {
      id: string;
      kind: "tool";
      title: string;
      sections: { label: string; content: string; markdown?: boolean }[];
      terminal?: "bash" | "eval";
      jobId?: string;
    };

const contentTabs = ref<ContentTab[]>([]);
const activeContentTabId = ref<string | null>(null);
const showFileTreeSidebar = ref(true);

const contentPanelOpen = computed(() => contentTabs.value.length > 0);
const contentSplitTabs = computed(() =>
  contentTabs.value.map((tab) => ({
    id: tab.id,
    title: tab.title,
  })),
);
const activeContentTab = computed(
  () => contentTabs.value.find((tab) => tab.id === activeContentTabId.value) ?? null,
);
const selectedFileTabPath = computed(() => {
  const tab = activeContentTab.value;
  return tab?.kind === "file" ? tab.path : null;
});
const hasLogTab = computed(() => contentTabs.value.some((tab) => tab.kind === "log"));
const hasEvalTab = computed(() =>
  contentTabs.value.some((tab) => tab.kind === "tool" && tab.terminal === "eval"),
);
const hasBashTerminalsTab = computed(() =>
  contentTabs.value.some((tab) => tab.kind === "bash-terminals"),
);
const logActionActive = computed(() =>
  isMobileViewport.value ? showLogPanel.value : hasLogTab.value,
);
const filesActionActive = computed(() =>
  isMobileViewport.value ? showFilesPanel.value : showFileTreeSidebar.value,
);
const evalActionActive = computed(() => {
  if (isMobileViewport.value) {
    return toolPanel.value?.terminal === "eval";
  }
  return hasEvalTab.value;
});
const bashTerminalsActionActive = computed(() => {
  if (isMobileViewport.value) return mobileBashOpen.value;
  return hasBashTerminalsTab.value;
});
const previewActionActive = computed(() => {
  if (isMobileViewport.value) return mobilePreviewOpen.value;
  return hasPreviewTab.value;
});

function bashTerminalsTabTitle(count = backgroundBashCount.value): string {
  return count > 0 ? t("chat.backgroundTerminalCount", { count }) : t("chat.backgroundTerminal");
}

function openBackgroundBashPanel(jobId?: string) {
  if (isMobileViewport.value) {
    taskPaneOpen.value = false;
    btwPanelOpen.value = false;
    showLogPanel.value = false;
    showFilesPanel.value = false;
    mobilePreviewOpen.value = false;
    toolPanel.value = null;
    mobileBashJobId.value = jobId ?? null;
    mobileBashOpen.value = true;
    return;
  }
  upsertContentTab({
    id: "bash-terminals",
    kind: "bash-terminals",
    title: bashTerminalsTabTitle(),
    jobId,
  });
}

function toggleBackgroundBashPanel() {
  if (isMobileViewport.value) {
    toggleMobileBash();
    return;
  }
  if (hasBashTerminalsTab.value) {
    closeContentTab("bash-terminals");
    return;
  }
  openBackgroundBashPanel();
}

function toggleMobileBash() {
  if (mobileBashOpen.value) {
    mobileBashOpen.value = false;
    return;
  }
  if (backgroundBashCount.value <= 0) return;
  openBackgroundBashPanel();
}

async function refreshBackgroundBashCount() {
  if (!props.session.id || document.hidden) return;
  try {
    const snapshot = await api.getSessionJobs(props.session.id);
    backgroundBashCount.value = snapshot.jobs.filter(
      (job) =>
        (job.status === "running" || job.status === "waiting" || job.status === "queued") &&
        (job.kind === "shell" ||
          (job.kind === "project-service" && (job.name || "").startsWith("start:"))),
    ).length;
  } catch {
    /* ignore transient poll errors */
  }
}

function startBackgroundBashPolling() {
  if (backgroundBashPoll) clearInterval(backgroundBashPoll);
  void refreshBackgroundBashCount();
  backgroundBashPoll = setInterval(() => void refreshBackgroundBashCount(), 2000);
}

function toolTabId(panel: { title: string; terminal?: "bash" | "eval"; jobId?: string }): string {
  if (panel.terminal === "eval" && panel.jobId) return `tool:eval:${panel.jobId}`;
  if (panel.terminal) return `tool:${panel.terminal}`;
  return `tool:${panel.title}`;
}

function upsertContentTab(tab: ContentTab) {
  const index = contentTabs.value.findIndex((item) => item.id === tab.id);
  if (index >= 0) contentTabs.value[index] = tab;
  else contentTabs.value.push(tab);
  activeContentTabId.value = tab.id;
}

function closeContentTab(id: string) {
  const index = contentTabs.value.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const removed = contentTabs.value[index];
  contentTabs.value.splice(index, 1);
  if (
    removed?.kind === "tool" &&
    removed.terminal &&
    toolPanel.value?.terminal === removed.terminal
  ) {
    toolPanel.value = null;
  } else if (removed?.kind === "tool" && toolPanel.value?.title === removed.title) {
    toolPanel.value = null;
  }
  if (activeContentTabId.value === id) {
    const next = contentTabs.value[index] ?? contentTabs.value[index - 1] ?? null;
    activeContentTabId.value = next?.id ?? null;
  }
}

function clearContentTabs() {
  contentTabs.value = [];
  activeContentTabId.value = null;
  toolPanel.value = null;
}

function openFileContentTab(path: string) {
  const normalized = path.replace(/\\/g, "/");
  upsertContentTab({
    id: `file:${normalized}`,
    kind: "file",
    path: normalized,
    title: fileBasename(normalized),
  });
}

function closeAllSidePanels() {
  taskPaneOpen.value = false;
  btwPanelOpen.value = false;
  showLogPanel.value = false;
  showFilesPanel.value = false;
  mobilePreviewOpen.value = false;
  mobileBashOpen.value = false;
  mobileBashJobId.value = null;
  toolPanel.value = null;
  clearContentTabs();
}

function openSidePanel(kind: SidePanelKind) {
  if (isMobileViewport.value) closeAllSidePanels();
  switch (kind) {
    case "task":
      taskPaneOpen.value = true;
      break;
    case "btw":
      btwPanelOpen.value = true;
      break;
    case "log":
      if (isMobileViewport.value) {
        showLogPanel.value = true;
      } else {
        upsertContentTab({ id: "log", kind: "log", title: t("chat.sessionLog") });
      }
      break;
    case "files":
      if (isMobileViewport.value) {
        showFilesPanel.value = true;
      } else {
        showFileTreeSidebar.value = true;
      }
      break;
  }
}

function setToolPanel(panel: NonNullable<typeof toolPanel.value>) {
  if (isMobileViewport.value) {
    closeAllSidePanels();
    toolPanel.value = panel;
    return;
  }
  toolPanel.value = panel;
  upsertContentTab({
    id: toolTabId(panel),
    kind: "tool",
    title: panel.title,
    sections: panel.sections,
    terminal: panel.terminal,
    jobId: panel.jobId,
  });
}

function toggleTaskPane() {
  if (taskPaneOpen.value) {
    taskPaneOpen.value = false;
    return;
  }
  void loadFullSessionTasks().finally(() => {
    if (props.session.id) openSidePanel("task");
  });
}

function onOpenFileEvent(event: Event) {
  const path = (event as CustomEvent<{ path?: string }>).detail?.path;
  if (!path) return;
  if (isMobileViewport.value) {
    requestedFilePath.value = null;
    openFilesPanel();
    void nextTick(() => {
      requestedFilePath.value = path;
    });
    return;
  }
  showFileTreeSidebar.value = true;
  openFileContentTab(path);
}

onMounted(() => {
  window.addEventListener("supervisor:open-file", onOpenFileEvent);
});

function toggleLogPanel() {
  if (isMobileViewport.value) {
    if (showLogPanel.value) {
      showLogPanel.value = false;
      return;
    }
    openSidePanel("log");
    return;
  }
  if (hasLogTab.value && activeContentTabId.value === "log") {
    closeContentTab("log");
    return;
  }
  openSidePanel("log");
}

function toggleFilesPanel() {
  if (isMobileViewport.value) {
    if (showFilesPanel.value) {
      showFilesPanel.value = false;
      return;
    }
    openSidePanel("files");
    return;
  }
  showFileTreeSidebar.value = !showFileTreeSidebar.value;
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
    showUiMessage(error instanceof Error ? error.message : t("chat.modelLoadFailed"), "error");
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
    showUiMessage(t("chat.modelSet"), "success");
    await nextTick(() => inputPanelRef.value?.focus());
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("chat.modelSetFailed"), "error");
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
    showUiMessage(error instanceof Error ? error.message : t("chat.fetchQueuedFailed"), "error");
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
    showUiMessage(error instanceof Error ? error.message : t("chat.deleteQueuedFailed"), "error");
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
    showUiMessage(error instanceof Error ? error.message : t("chat.sendNowFailed"), "error");
    await refreshQueuedInputs();
  } finally {
    queuedActionBusyId.value = null;
  }
}

const inputDisabled = computed(
  () =>
    !chatComposerReady.value ||
    modelMissing.value ||
    providerDisabled.value ||
    isInitializing.value ||
    terminalStatuses.has(props.session.status),
);

/** Stop only while generating — never during create-time initialization. */
const canInterrupt = computed(() => isStreaming.value && !isInitializing.value);

const inputPlaceholder = computed(() => {
  if (!chatComposerReady.value) return "";
  if (modelMissing.value) return t("chat.modelRequired");
  if (providerDisabled.value) return t("chat.providerDisabled");
  if (isInitializing.value) return t("chat.initializing");
  if (props.session.status === "finish") return t("chat.completed");
  if (props.session.status === "error") {
    return chatEntries.value.some((entry) => entry.type === "llm_error")
      ? t("chat.retryModel")
      : t("chat.sessionError");
  }
  if (props.session.status === "stopped") return t("chat.stopped");
  if (isStreaming.value) return t("chat.sendAfterReply");
  if (props.session.meta?.shadow?.status) return props.session.meta.shadow.status;
  return t("chat.inputMessage");
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
  await applySessionMessages(sessionId, localSnapshot);
  void refreshSessionSideData(sessionId);
}

async function applySessionMessages(sessionId: string, localSnapshot = chatEntries.value) {
  await sessionStore.fetchSessionMessages(sessionId);
  historyHasMore.value = sessionStore.messageCursors[sessionId]?.hasMore ?? false;
  const entries = sessionStore.messages[sessionId] ?? [];
  chatEntries.value = mergeStreamingToolsIntoPersistedEntries(
    sessionTreeToChatEntries(entries),
    localSnapshot,
  );
}

function applySessionSideData(
  sessionId: string,
  nextQueued: api.QueuedSessionInput[],
  nextTasks: api.TaskArtifact[],
  nextTodos: api.TodoItem[],
  checkpoints: api.SessionCheckpoint[],
) {
  if (sessionId !== props.session.id) return;
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

let sessionSideDataGeneration = 0;

async function refreshSessionSideData(sessionId: string) {
  const generation = ++sessionSideDataGeneration;
  const includeTaskContent = tasksDetailLoaded.value;
  const [nextQueued, nextTasks, nextTodos, checkpoints] = await Promise.all([
    api.getQueuedSessionInputs(sessionId).catch(() => []),
    api
      .getSessionTasks(sessionId, { includeContent: includeTaskContent })
      .catch(() => [] as api.TaskArtifact[]),
    api.getSessionTodos(sessionId).catch(() => []),
    api.listCheckpoints(sessionId).catch(() => []),
  ]);
  if (generation !== sessionSideDataGeneration || sessionId !== props.session.id) return;
  applySessionSideData(sessionId, nextQueued, nextTasks, nextTodos, checkpoints);
}

const tasksDetailLoaded = ref(false);

async function loadFullSessionTasks(): Promise<void> {
  if (tasksDetailLoaded.value) return;
  const sessionId = props.session.id;
  const full = await api.getSessionTasks(sessionId, { includeContent: true }).catch(() => null);
  if (!full || sessionId !== props.session.id) return;
  tasks.value = full;
  tasksDetailLoaded.value = true;
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

/** Minimap jump: scroll if loaded; otherwise page older until found (or history ends). */
async function onMinimapSelect(userEntryId: string) {
  const list = messageListRef.value;
  if (!list) return;
  if (await list.scrollToEntryId(userEntryId)) return;

  let guard = 0;
  while (historyHasMore.value && guard < 40) {
    guard += 1;
    await loadOlderMessages();
    await nextTick();
    if (await list.scrollToEntryId(userEntryId)) return;
  }
}

async function loadSessionMessages(sessionId: string) {
  stopStreaming();
  historyHasMore.value = false;
  tasksDetailLoaded.value = false;
  tasks.value = [];
  todos.value = [];
  const cached = sessionStore.messages[sessionId];
  if (cached?.length) chatEntries.value = sessionTreeToChatEntries(cached);
  else chatEntries.value = [];
  sessionLoading.value = true;
  try {
    await applySessionMessages(sessionId);
  } finally {
    sessionLoading.value = false;
  }
  void refreshSessionSideData(sessionId);
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
  void maybeResumeRunningSession(sessionId);
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

function resolvePendingApproval(approvalId?: string) {
  if (approvalId) {
    pendingApprovals.value = pendingApprovals.value.filter(
      (item) => item.approvalId !== approvalId,
    );
    return;
  }
  pendingApprovals.value.shift();
}

async function openPendingPlan() {
  await loadFullSessionTasks().catch(() => undefined);
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
    clearContentTabs();
    showFileTreeSidebar.value = true;
    showLogPanel.value = false;
    showFilesPanel.value = false;
    mobilePreviewOpen.value = false;
    mobileBashOpen.value = false;
    mobileBashJobId.value = null;
    backgroundBashCount.value = 0;
    lastPreviewKey.value = "";
    startBackgroundBashPolling();
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
      if (payload.event.type === "session_status" || payload.event.type === "session_services") {
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
    showUiMessage(error instanceof Error ? error.message : t("chat.shadowUpdateFailed"), "error");
  }
}

async function onSpawnedAgentsChange(spawnedAgentIds: string[]) {
  try {
    const { agentIds } = await api.setSessionSubagents(props.session.id, spawnedAgentIds);
    await sessionStore.updateSessionMeta(props.session.id, { subagentIds: agentIds });
    showUiMessage(t("chat.shadowUpdated"), "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("chat.agentUpdateFailed"), "error");
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
  const confirmed = await requestUiDeleteConfirm({
    title: t("chat.revertTitle"),
    message: t("chat.revertMessage"),
    confirmText: t("chat.revertConfirm"),
  });
  if (!confirmed) return;
  try {
    stopStreaming();
    await api.rewindSessionToEntry(props.session.id, entryId);
    await reloadMessagesFromServer(props.session.id);
    await sessionStore.fetchSessions();
    await scrollToBottom();
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("chat.revertFailed"), "error");
  }
}

async function forkFromMessage(entryId: string) {
  try {
    const forked = await sessionStore.forkSession(props.session.id, { entryId });
    emit("navigate", forked.id);
    showUiMessage(t("chat.branchCreated"), "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("chat.branchFailed"), "error");
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
    title: t("chat.completeTitle"),
    message: t("chat.completeMessage"),
    confirmText: t("chat.completeConfirm"),
  });
  if (!confirmed) return;
  stopStreaming();
  try {
    await sessionStore.completeSession(props.session.id);
    await sessionStore.fetchSession(props.session.id);
    sessionTitle.value = props.session.title ?? sessionTitle.value;
    showUiMessage(t("chat.completeSuccess"), "success");
  } catch (err) {
    showUiMessage(err instanceof Error ? err.message : t("chat.completeFailed"), "error");
    await sessionStore.fetchSession(props.session.id);
  }
}

async function onSyncSession() {
  sessionMenuOpen.value = false;
  if (!canCheckpointActions.value || isStreaming.value) return;
  const confirmed = await requestUiConfirm({
    title: t("chat.syncTitle"),
    message: t("chat.syncMessage"),
    confirmText: t("chat.syncConfirm"),
  });
  if (!confirmed) return;
  try {
    await withUiBusy(t("chat.syncing"), () => sessionStore.syncSession(props.session.id));
    showUiMessage(t("chat.syncSuccess"), "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("chat.syncFailed"), "error");
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
    showUiMessage(error instanceof Error ? error.message : t("chat.operationFailed"), "error");
  }
}

async function onCreateCheckpoint() {
  sessionMenuOpen.value = false;
  if (!canCheckpointActions.value) return;
  try {
    await sessionStore.createCheckpoint(props.session.id);
    showUiMessage(t("chat.checkpointCreated"), "success");
  } catch (err) {
    console.error("Create checkpoint failed:", err);
    showUiMessage(err instanceof Error ? err.message : t("chat.checkpointCreateFailed"), "error");
  }
}

async function onRewindSession() {
  sessionMenuOpen.value = false;
  if (!canCheckpointActions.value) return;
  try {
    const checkpoints = await sessionStore.listCheckpoints(props.session.id);
    if (checkpoints.length === 0) {
      showUiMessage(t("chat.noCheckpoints"), "info");
      return;
    }
    const target = checkpoints[checkpoints.length - 1]!;
    const confirmed = await requestUiConfirm({
      title: t("chat.rollbackTitle"),
      message: t("chat.rollbackMessage", { label: target.label ?? target.id.slice(0, 8) }),
      confirmText: t("chat.rollbackConfirm"),
      danger: true,
    });
    if (!confirmed) return;
    stopStreaming();
    await sessionStore.rewindSession(props.session.id, target.id);
    await reloadMessagesFromServer(props.session.id);
    showUiMessage(t("chat.rollbackSuccess"), "success");
  } catch (err) {
    console.error("Rewind failed:", err);
    showUiMessage(err instanceof Error ? err.message : t("chat.rollbackFailed"), "error");
  }
}

async function onCommitSession() {
  sessionMenuOpen.value = false;
  if (!canCheckpointActions.value) return;
  try {
    const result = await sessionStore.commitSession(props.session.id);
    if (!result.commit) {
      showUiMessage(t("chat.noChangesToCommit"), "info");
      return;
    }
    await reloadMessagesFromServer(props.session.id);
    void scrollToBottom();
    showUiMessage(t("chat.changesCommitted"), "success");
  } catch (err) {
    console.error("Commit failed:", err);
    showUiMessage(err instanceof Error ? err.message : t("chat.commitFailed"), "error");
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
    showUiMessage(err instanceof Error ? err.message : t("chat.retryFailed"), "error");
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
  // Keep Live Update aggregate across session switches; completion is tracked via
  // syncAgentLiveStatus / session-store watch, not view unmount.
  window.removeEventListener("supervisor:open-file", onOpenFileEvent);
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
  if (backgroundBashPoll) {
    clearInterval(backgroundBashPoll);
    backgroundBashPoll = undefined;
  }
});

const displayGroups = computed(() =>
  buildDisplayGroups(chatEntries.value, {
    splitAssistantMessages: splitAssistantMessages.value,
    collapseConclusionOnly: viewPreferences.collapseExternalAgentDetails,
    showThinkingBlocks: showThinking.value,
  }),
);
const sessionServices = computed(() => parseSessionServicesFromMeta(props.session.meta));
const servicesRunning = computed(() => {
  const status = sessionServices.value?.status;
  return status === "running" || status === "starting" || status === "active";
});
/** Eval header only for eval kernel activity (not background bash). */
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

const servicePreviews = computed<SessionServicesPreview[]>(() => {
  const services = sessionServices.value;
  if (!services?.apps?.length) return [];
  const status = services.status;
  if (status !== "active" && status !== "running" && status !== "starting") return [];
  return services.apps.map((app) => ({
    name: app.name,
    port: app.port,
    path: app.path,
    label: app.name,
    scriptName: app.name,
    previewUrl: api.buildSessionPreviewUrl(props.session.id, app.name, app.path ?? "/"),
  }));
});
const hasServicePreviews = computed(() => servicePreviews.value.length > 0);
const hasPreviewTab = computed(() => contentTabs.value.some((tab) => tab.kind === "preview"));

function ensureLastPreviewKey() {
  if (
    lastPreviewKey.value &&
    servicePreviews.value.some((item) => `${item.name}:${item.port}` === lastPreviewKey.value)
  ) {
    return;
  }
  const first = servicePreviews.value[0];
  lastPreviewKey.value = first ? `${first.name}:${first.port}` : "";
}

async function wakePreviewServicesIfNeeded(): Promise<boolean> {
  const status = sessionServices.value?.status;
  if (status !== "stopped" && status !== "idle") return true;
  previewLoading.value = true;
  try {
    await api.wakeSessionServices(props.session.id);
    await sessionStore.fetchSession(props.session.id);
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    showUiMessage(`唤醒服务失败：${message}`, "error");
    return false;
  } finally {
    previewLoading.value = false;
  }
}

async function openSessionPreview() {
  if (!hasServicePreviews.value) return;
  ensureLastPreviewKey();
  const woke = await wakePreviewServicesIfNeeded();
  if (!woke) return;

  if (isMobileViewport.value) {
    taskPaneOpen.value = false;
    btwPanelOpen.value = false;
    showLogPanel.value = false;
    showFilesPanel.value = false;
    toolPanel.value = null;
    mobileBashOpen.value = false;
    mobilePreviewOpen.value = true;
    return;
  }

  taskPaneOpen.value = false;
  btwPanelOpen.value = false;
  upsertContentTab({ id: "preview", kind: "preview", title: t("chat.activeApps") });
}

function toggleSessionPreview() {
  if (isMobileViewport.value) {
    if (mobilePreviewOpen.value) {
      mobilePreviewOpen.value = false;
      return;
    }
    void openSessionPreview();
    return;
  }
  if (hasPreviewTab.value) {
    closeContentTab("preview");
    return;
  }
  void openSessionPreview();
}

async function toggleMobilePreview() {
  if (!hasServicePreviews.value) return;
  if (mobilePreviewOpen.value) {
    mobilePreviewOpen.value = false;
    return;
  }
  await openSessionPreview();
}

type ConversationTouch = { x: number; y: number; edge: "left" | "right" | null };
const conversationTouch = ref<ConversationTouch | null>(null);
const CONVERSATION_EDGE_PX = 24;
const CONVERSATION_SWIPE_MIN = 56;
const CONVERSATION_AXIS_RATIO = 1.35;

function onConversationTouchStart(event: TouchEvent) {
  if (!isMobileViewport.value) return;
  if (mobilePreviewOpen.value || mobileBashOpen.value) return;
  const canPreview = hasServicePreviews.value;
  const canBash = backgroundBashCount.value > 0;
  if (!canPreview && !canBash) return;
  const t = event.touches[0];
  const host = conversationHostRef.value;
  if (!t || !host) return;
  const rect = host.getBoundingClientRect();
  const fromRightEdge = t.clientX >= rect.right - CONVERSATION_EDGE_PX;
  const fromLeftEdge = t.clientX <= rect.left + CONVERSATION_EDGE_PX;
  conversationTouch.value = {
    x: t.clientX,
    y: t.clientY,
    edge: fromRightEdge ? "right" : fromLeftEdge ? "left" : null,
  };
}

function onConversationTouchEnd(event: TouchEvent) {
  const start = conversationTouch.value;
  conversationTouch.value = null;
  if (!start || !isMobileViewport.value) return;
  if (mobilePreviewOpen.value || mobileBashOpen.value) return;
  const t = event.changedTouches[0];
  if (!t) return;
  const dx = t.clientX - start.x;
  const dy = t.clientY - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const horizontalDominant =
    absX >= CONVERSATION_SWIPE_MIN && absX > absY * CONVERSATION_AXIS_RATIO;

  // 右滑 → 活跃应用预览
  if (dx > 0 && hasServicePreviews.value) {
    if (start.edge === "left") return;
    if (!start.edge && !horizontalDominant) return;
    if (start.edge === "right" && absX < 28) return;
    void openSessionPreview();
    return;
  }

  // 左滑 → 后台终端
  if (dx < 0 && backgroundBashCount.value > 0) {
    if (start.edge === "left") {
      if (absX < 28) return;
    } else if (!horizontalDominant) {
      return;
    }
    openBackgroundBashPanel();
  }
}

watch(hasServicePreviews, (has) => {
  if (!has) {
    mobilePreviewOpen.value = false;
    if (hasPreviewTab.value) closeContentTab("preview");
  }
});

watch(backgroundBashCount, (count) => {
  if (count <= 0) {
    mobileBashOpen.value = false;
    mobileBashJobId.value = null;
    if (hasBashTerminalsTab.value) closeContentTab("bash-terminals");
    return;
  }
  const tab = contentTabs.value.find((item) => item.kind === "bash-terminals");
  if (tab) tab.title = bashTerminalsTabTitle(count);
});

const lastNotifiedAskId = ref<string | null>(null);

async function consumePendingShareImages() {
  await nextTick();
  await attachPendingShareToInput((file) => inputPanelRef.value?.addPendingImage(file));
}

watch(
  [pendingShareRevision, () => props.session.id],
  () => {
    void consumePendingShareImages();
  },
  { immediate: true },
);

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

function extractBackgroundBashTaskId(
  callArgs?: Record<string, unknown>,
  resultContent?: Array<{ type: string; text: string }>,
): string | undefined {
  if (callArgs?.run_in_background === true || typeof callArgs?.task_id === "string") {
    if (typeof callArgs.task_id === "string" && callArgs.task_id.trim()) {
      return callArgs.task_id.trim();
    }
  }
  const text = resultContent?.map((part) => part.text ?? "").join("\n") ?? "";
  const match = text.match(/(?:^|\n)task_id:\s*(\S+)/);
  return match?.[1]?.trim() || undefined;
}

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
  const isBash = normalizedToolName.includes("bash");
  if (isBash) {
    const jobId = extractBackgroundBashTaskId(callArgs, content);
    if (jobId) {
      openBackgroundBashPanel(jobId);
      return;
    }
    setToolPanel(detail);
    return;
  }
  setToolPanel({
    ...detail,
    ...(isEval ? { terminal: "eval" as const } : {}),
  });
}

function openExternalInteractionDetail(
  callArgs?: Record<string, unknown>,
  resultContent?: Array<{ type: string; text: string }>,
) {
  toolModal.value = buildExternalInteractionModal(callArgs, resultContent);
}

async function openEvalPanel() {
  setToolPanel({
    title: "Eval",
    sections: [{ label: t("chat.evalEnvironment"), content: t("chat.readingEvalHistory") }],
    terminal: "eval",
  });
}

function toggleEvalPanel() {
  if (isMobileViewport.value) {
    if (toolPanel.value?.terminal === "eval") {
      toolPanel.value = null;
      return;
    }
    void openEvalPanel();
    return;
  }
  const evalTabs = contentTabs.value.filter(
    (tab) => tab.kind === "tool" && tab.terminal === "eval",
  );
  if (evalTabs.length) {
    for (const tab of [...evalTabs]) closeContentTab(tab.id);
    return;
  }
  void openEvalPanel();
}

function onEvalJobEnded(jobId: string) {
  if (isMobileViewport.value) {
    if (toolPanel.value?.jobId === jobId) toolPanel.value = null;
    return;
  }
  const tab = contentTabs.value.find(
    (item) => item.kind === "tool" && item.terminal === "eval" && item.jobId === jobId,
  );
  if (tab) closeContentTab(tab.id);
  if (toolPanel.value?.jobId === jobId) toolPanel.value = null;
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
  const jobId = extractBackgroundBashTaskId(undefined, content);
  if (jobId) {
    openBackgroundBashPanel(jobId);
    return;
  }
  const terminalPresentation =
    content === undefined || output.length > 1000 || output.split(/\r?\n/).length > 8;
  if (isMobileViewport.value) {
    if (terminalPresentation) setToolPanel({ ...detail, terminal: "bash" });
    else toolModal.value = detail;
    return;
  }
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
    label: t("chat.metadata"),
    content: [
      `tokensBefore: ${entry.tokensBefore}`,
      `firstKeptEntryId: ${entry.firstKeptEntryId}`,
      `reason: ${entry.reason ?? "threshold"}`,
      `entry.id: ${entry.id}`,
    ].join("\n"),
  });
  toolModal.value = { title: t("chat.compressionSummary"), sections };
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
        showUiMessage(error instanceof Error ? error.message : t("chat.slashCommandFailed"), "error");
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
        showUiMessage(error instanceof Error ? error.message : t("chat.queueSendFailed"), "error");
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

.chat-main-row {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: row;
  align-items: stretch;
}

.chat-message-list-host {
  min-width: 0;
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
  min-width: 280px;
  max-width: min(58vw, 560px);
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
  .desktop-only-action {
    display: none !important;
  }

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
