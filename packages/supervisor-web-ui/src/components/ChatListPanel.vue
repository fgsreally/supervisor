<template>
  <div
    class="relative h-full w-full flex flex-col shrink-0 min-w-0"
    :style="{ ...panelStyle, background: 'var(--app-list-section-bg)' }"
  >
    <div
      class="chat-list-header h-16 flex items-center px-4 shrink-0 border-b"
      style="
        background: var(--app-list-header-bg);
        border-color: var(--app-header-divider, var(--app-border-subtle));
      "
    >
      <h1 class="text-[16px] font-medium flex-1" style="color: var(--app-text-primary)">聊天</h1>
      <button
        type="button"
        class="chat-list-search-icon"
        title="搜索"
        aria-label="搜索"
        @click="openMobileSearch"
      >
        <Search />
      </button>
      <button
        type="button"
        class="chat-list-import-icon chat-list-import-icon--desktop"
        :class="{ 'chat-list-import-icon--active': externalImportOpen }"
        title="从外部引入会话"
        aria-label="从外部引入会话"
        @click="openExternalImport"
      >
        <MessageSquareReply class="h-5 w-5" stroke-width="1.75" />
      </button>
      <button
        type="button"
        class="chat-list-add-icon"
        :class="{ 'chat-list-add-icon--active': mobileAddMenuOpen }"
        title="更多操作"
        aria-label="更多操作"
        :aria-expanded="mobileAddMenuOpen"
        @click="mobileAddMenuOpen = !mobileAddMenuOpen"
      >
        <Plus />
      </button>

      <template v-if="mobileAddMenuOpen">
        <button
          type="button"
          class="chat-list-add-backdrop"
          aria-label="关闭更多操作"
          @click="mobileAddMenuOpen = false"
        />
        <div class="chat-list-add-menu">
          <button type="button" @click="openExternalImportFromMobileMenu">
            <MessageSquareReply />
            <span>从外部导入会话</span>
          </button>
        </div>
      </template>
    </div>

    <div
      class="chat-list-search px-3 py-2 shrink-0 border-b"
      style="
        background: var(--app-list-header-bg);
        border-color: var(--app-header-divider, var(--app-border-subtle));
      "
    >
      <div class="relative">
        <Search class="w-4 h-4 absolute left-2.5 top-2" style="color: var(--app-text-muted)" />
        <input
          v-model="query"
          type="text"
          placeholder="搜索"
          class="list-search-input w-full rounded-md pl-8 pr-2 py-1.5 text-[13px] focus:outline-none transition-colors"
        />
      </div>
    </div>

    <div
      ref="sessionScrollPanel"
      class="chat-list-scroll flex-1 overflow-y-auto custom-scrollbar"
      @scroll.passive="refreshProjectHighlight"
    >
      <template v-if="query.trim()">
        <div v-if="searching" class="chat-search-state">搜索中...</div>
        <button
          v-for="result in searchResults"
          v-else
          :key="result.session.id"
          type="button"
          class="chat-search-result"
          :class="{ 'chat-search-result--active': activeId === result.session.id }"
          @click="emit('select', result.session.id)"
        >
          <SessionAvatar
            class="chat-search-result__avatar"
            :session-id="result.session.id"
            :name="result.session.title"
            :agent-id="result.session.agentId"
            :avatar="result.session.avatar"
            :agent-icon="
              result.session.agentId
                ? agentStore.getAgentById(result.session.agentId)?.avatar
                : null
            "
            :size="42"
          />
          <span class="chat-search-result__body">
            <strong>
              <template
                v-for="(part, index) in highlightSearch(result.session.title)"
                :key="`title-${index}`"
              >
                <span :class="{ 'chat-search-highlight': part.highlight }">{{ part.text }}</span>
              </template>
            </strong>
            <small>
              <template
                v-for="(part, index) in highlightSearch(result.description)"
                :key="`description-${index}`"
              >
                <span :class="{ 'chat-search-highlight': part.highlight }">{{ part.text }}</span>
              </template>
            </small>
          </span>
        </button>
        <div v-if="!searching && !searchResults.length" class="chat-search-state">无匹配会话</div>
      </template>
      <template v-else>
        <div v-if="sessionsLoading && !hasListContent" class="chat-list-state">
          <Loader2 class="chat-list-state__spin" aria-hidden="true" />
          <span>加载会话...</span>
        </div>
        <UiEmptyState
          v-else-if="showSessionsListFullError"
          tone="error"
          title="会话加载失败"
          :description="sessionsListError"
          action-label="重试"
          @action="retryLoadSessions"
        >
          <template #icon><MessageSquareReply /></template>
        </UiEmptyState>
        <UiEmptyState
          v-else-if="!sessionStore.projects.length && !showPinnedSection"
          title="暂无项目"
          description="创建项目后即可在此开始会话。"
          action-label="创建项目"
          @action="projectCreateOpen = true"
        >
          <template #icon><Plus /></template>
        </UiEmptyState>
        <template v-else>
          <div v-if="sessionsListError" class="chat-list-error-banner">
            <span class="chat-list-error-banner__text"
              >会话列表刷新失败：{{ sessionsListError }}</span
            >
            <button type="button" class="chat-list-error-banner__retry" @click="retryLoadSessions">
              重试
            </button>
          </div>
          <template v-if="showPinnedSection">
            <div class="list-section-header list-section-header--pinned sticky top-0 z-10">
              <button
                type="button"
                class="section-action-btn section-action-btn--chevron"
                :title="pinnedSectionCollapsed ? '展开' : '折叠'"
                @click="togglePinnedCollapse"
              >
                <ChevronRight
                  class="w-4 h-4 section-chevron"
                  :class="{ 'section-chevron--open': !pinnedSectionCollapsed }"
                />
              </button>
              <button
                type="button"
                class="list-section-title flex-1 truncate text-left"
                @click="togglePinnedCollapse"
              >
                置顶
              </button>
            </div>
            <div
              class="workspace-collapse"
              :class="{ 'workspace-collapse--open': !pinnedSectionCollapsed }"
            >
              <div
                class="workspace-collapse__inner"
                :class="{ 'workspace-collapse__inner--hold-leave': unpinLeaveIds.size > 0 }"
              >
                <DustTransitionGroup
                  name="session-list"
                  tag="div"
                  content-class="chat-list-roots"
                  @after-leave="onPinnedSessionAfterLeave"
                >
                  <div
                    v-for="root in pinnedRoots"
                    :key="root.id"
                    class="chat-list-root"
                    :data-session-id="root.id"
                  >
                    <SessionListItem
                      :session="root"
                      :active="activeId === root.id"
                      mode="chat"
                      :depth="0"
                      @select="$emit('select', $event)"
                      @context-menu="openContextMenu(root.id, $event)"
                      @hover-change="highlightPinnedProject(root, $event)"
                    />
                  </div>
                </DustTransitionGroup>
              </div>
            </div>
          </template>

          <template v-if="workspaceGroups.length">
            <DustTransitionGroup name="session-list" tag="div" content-class="chat-list-projects">
              <div
                v-for="group in workspaceGroups"
                :key="group.workspace.id"
                class="workspace-group"
                :data-project-id="group.workspace.id"
              >
                <div
                  class="list-section-header sticky top-0 z-10"
                  :ref="(element) => setProjectHeaderRef(group.workspace.id, element)"
                  draggable="true"
                  :class="{
                    'list-section-header--dragging': draggedProjectId === group.workspace.id,
                    'list-section-header--linked': highlightedProjectId === group.workspace.id,
                  }"
                  @dragstart="onProjectDragStart(group.workspace.id, $event)"
                  @dragover.prevent
                  @drop="onProjectDrop(group.workspace.id)"
                  @dragend="draggedProjectId = null"
                  @contextmenu.prevent.stop="openProjectContextMenu(group.workspace.id, $event)"
                >
                  <button
                    type="button"
                    class="section-action-btn section-action-btn--chevron"
                    :title="isWorkspaceCollapsed(group.workspace.id) ? '展开' : '折叠'"
                    @click="toggleWorkspaceCollapse(group.workspace.id)"
                  >
                    <ChevronRight
                      class="w-4 h-4 section-chevron"
                      :class="{
                        'section-chevron--open': !isWorkspaceCollapsed(group.workspace.id),
                      }"
                    />
                  </button>
                  <button
                    type="button"
                    class="list-section-title flex-1 truncate text-left"
                    @click="toggleWorkspaceCollapse(group.workspace.id)"
                  >
                    {{ group.workspace.name }}
                  </button>
                  <button
                    type="button"
                    class="section-action-btn"
                    title="Git"
                    @click="openProjectGit(group.workspace.id, $event)"
                  >
                    <GitBranch class="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    class="section-action-btn"
                    title="项目设置"
                    @click="openProjectSettings(group.workspace.id)"
                  >
                    <Settings class="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    class="section-action-btn"
                    title="在此项目添加会话"
                    @click="openAgentPicker(group.workspace.id)"
                  >
                    <Plus class="w-4 h-4" />
                  </button>
                </div>

                <div
                  class="workspace-collapse"
                  :class="{ 'workspace-collapse--open': !isWorkspaceCollapsed(group.workspace.id) }"
                >
                  <div
                    class="workspace-collapse__inner"
                    :class="{
                      'workspace-collapse__inner--hold-leave': workspaceHoldsPinLeave(
                        group.workspace.id,
                      ),
                    }"
                  >
                    <DustTransitionGroup
                      name="session-list"
                      tag="div"
                      content-class="chat-list-roots"
                      @after-leave="onRegularSessionAfterLeave"
                    >
                      <div
                        v-for="root in group.sessions"
                        :key="root.id"
                        class="workspace-session-block"
                        :data-session-id="root.id"
                      >
                        <SessionListItem
                          :session="root"
                          :active="activeId === root.id"
                          mode="chat"
                          :depth="0"
                          @select="$emit('select', $event)"
                          @context-menu="openContextMenu(root.id, $event)"
                        />
                        <SessionListSubtree
                          v-if="childrenOf(root.id).length"
                          :parent-id="root.id"
                          :depth="1"
                          :active-id="activeId"
                          :sessions="filtered"
                          :ancestor-open-depths="[]"
                          @select="$emit('select', $event)"
                          @context-menu="openContextMenu($event.sessionId, $event)"
                        />
                      </div>
                    </DustTransitionGroup>
                    <div v-if="!group.sessions.length" class="chat-list-project-empty">
                      <MessageSquareReply
                        class="chat-list-project-empty__icon"
                        aria-hidden="true"
                      />
                      <p>暂无会话</p>
                    </div>
                  </div>
                </div>
              </div>
            </DustTransitionGroup>
          </template>
        </template>
      </template>
    </div>

    <Transition name="project-beacon">
      <div v-if="projectBelowViewport" class="project-scroll-beacon" aria-hidden="true">
        <div class="project-scroll-beacon__glow" />
        <div class="project-scroll-beacon__label">
          <ChevronDown />
          <span>{{ highlightedProjectName }}</span>
        </div>
      </div>
    </Transition>

    <SessionAgentPicker
      :open="agentPickerWorkspaceId != null"
      :project-id="agentPickerWorkspaceId"
      :projects="sessionStore.projects"
      @close="closeAgentPicker"
      @select="onAgentPicked"
    />

    <ProjectCreateDialog
      :open="projectCreateOpen"
      :busy="projectCreating"
      @close="projectCreateOpen = false"
      @create="createProjectFromDialog"
    />

    <ExternalSessionImportDialog
      :open="externalImportOpen"
      @close="externalImportOpen = false"
      @imported="onExternalSessionImported"
    />

    <SessionListContextMenu
      :open="contextMenu != null"
      :pinned="
        contextSession ? viewPreferences.pinnedSessionIds.includes(contextSession.id) : false
      "
      :x="contextMenu?.x ?? 0"
      :y="contextMenu?.y ?? 0"
      :status="contextSession?.status"
      :protected-session="contextSession?.isBuiltin"
      @close="closeContextMenu"
      @pin="togglePinnedSession"
      @sync="syncSession"
      @delete="confirmDeleteSession"
      @achieve="achieveSession"
      @fork="forkSessionFromMenu"
    />

    <ProjectListContextMenu
      :open="projectContextMenu != null"
      :x="projectContextMenu?.x ?? 0"
      :y="projectContextMenu?.y ?? 0"
      @close="projectContextMenu = null"
      @delete="confirmDeleteProject"
    />

    <ProjectSettingsMenu
      :open="projectSettingsId != null"
      :name="projectSettingsProject?.name"
      :cwd="projectSettingsProject?.cwd"
      :busy="projectBusy"
      :parsing="projectParsing"
      @close="closeProjectSettings"
      @rename="renameProject"
      @parse="parseCurrentProject"
    />

    <ProjectGitMenu
      :open="projectGit != null"
      :x="projectGit?.x ?? 0"
      :y="projectGit?.y ?? 0"
      :busy="projectBusy"
      :loading="projectGitLoading"
      :error="projectGitError"
      :current-branch="projectGitInfo?.currentBranch"
      :branches="projectGitInfo?.branches ?? []"
      @close="closeProjectGit"
      @pull="runProjectGit('pull')"
      @push="runProjectGit('push')"
      @checkout="runProjectGitCheckout"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Loader2,
  MessageSquareReply,
  Plus,
  Search,
  Settings,
} from "lucide-vue-next";
import {
  setPinnedSectionCollapsed,
  setProjectCollapsed,
  setProjectOrder,
  setSessionViewFlag,
  viewPreferences,
} from "@/utils/view-preferences";
import type { UISession } from "@/types/ui";
import { useAgentStore, useRootStore, useSessionStore } from "@/store";
import {
  groupSessionsByWorkspace,
  toUISession,
  compareSessionsByRecentActivity,
} from "@/utils/ui-session";
import { rememberCwd } from "@/config/workspace";
import {
  pullProjectGit,
  pushProjectGit,
  getProjectGitInfo,
  checkoutProjectGit,
  deleteProject as apiDeleteProject,
  parseProject as apiParseProject,
  searchMessages,
} from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import { requestUiConfirm, requestUiDeleteConfirm } from "@/composables/use-ui-confirm";
import { withUiBusy } from "@/composables/use-ui-busy";
import ExternalSessionImportDialog from "./ExternalSessionImportDialog.vue";
import DustTransitionGroup from "./DustTransitionGroup.vue";
import {
  isAdvancedAnimationEnabled,
  queryDustTarget,
  withDustRemove,
} from "@/composables/use-dust-transition";
import ProjectCreateDialog from "./ProjectCreateDialog.vue";
import ProjectGitMenu from "./ProjectGitMenu.vue";
import ProjectListContextMenu from "./ProjectListContextMenu.vue";
import ProjectSettingsMenu from "./ProjectSettingsMenu.vue";
import SessionAgentPicker from "./SessionAgentPicker.vue";
import SessionListContextMenu from "./SessionListContextMenu.vue";
import SessionListItem from "./SessionListItem.vue";
import SessionListSubtree from "./SessionListSubtree.vue";
import SessionAvatar from "./SessionAvatar.vue";
import UiEmptyState from "./ui/UiEmptyState.vue";

const props = defineProps<{
  activeId: string;
  width?: number;
}>();
const router = useRouter();

function openMobileSearch() {
  router.push("/search");
}

const emit = defineEmits<{
  select: [id: string];
  delete: [id: string];
  settings: [];
}>();

const sessionStore = useSessionStore();
const rootStore = useRootStore();
const agentStore = useAgentStore();

const sessionsLoading = computed(() => rootStore.loading.sessions);
const sessionsListError = computed(() => sessionStore.sessionsListError ?? "");
const hasListContent = computed(
  () =>
    sessionStore.projects.length > 0 ||
    sessionStore.sessions.some((session) => session.showInSessionList),
);
const showSessionsListFullError = computed(
  () => !sessionsLoading.value && !!sessionsListError.value && !hasListContent.value,
);

async function retryLoadSessions() {
  sessionStore.sessionsListError = null;
  await Promise.all([sessionStore.fetchProjects(), sessionStore.fetchSessions()]).catch(
    () => undefined,
  );
}

const query = ref("");
const mobileAddMenuOpen = ref(false);
const draggedProjectId = ref<string | null>(null);
const highlightedProjectId = ref<string | null>(null);
const projectBelowViewport = ref(false);
const sessionScrollPanel = ref<HTMLElement | null>(null);
const pinLeaveIds = ref<Set<string>>(new Set());
const unpinLeaveIds = ref<Set<string>>(new Set());
const projectHeaderRefs = new Map<string, HTMLElement>();
const highlightedProjectName = computed(
  () =>
    sessionStore.projects.find((project) => project.id === highlightedProjectId.value)?.name ??
    "对应项目在下方",
);

function setProjectHeaderRef(projectId: string, element: unknown) {
  if (element instanceof HTMLElement) projectHeaderRefs.set(projectId, element);
  else projectHeaderRefs.delete(projectId);
}

function refreshProjectHighlight() {
  const projectId = highlightedProjectId.value;
  const panel = sessionScrollPanel.value;
  const header = projectId ? projectHeaderRefs.get(projectId) : undefined;
  if (!projectId || !panel || !header) {
    projectBelowViewport.value = false;
    return;
  }
  const panelRect = panel.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  projectBelowViewport.value = headerRect.top >= panelRect.bottom - 2;
}

function highlightPinnedProject(session: UISession, hovered: boolean) {
  highlightedProjectId.value =
    hovered && !session.isBuiltin && session.workspaceId !== "none" ? session.workspaceId : null;
  if (!hovered) projectBelowViewport.value = false;
  else void nextTick(refreshProjectHighlight);
}

function onProjectDragStart(projectId: string, event: DragEvent) {
  draggedProjectId.value = projectId;
  event.dataTransfer?.setData("text/plain", projectId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onProjectDrop(targetId: string) {
  const sourceId = draggedProjectId.value;
  if (!sourceId || sourceId === targetId) return;
  const next = [...sessionStore.projects];
  const sourceIndex = next.findIndex((project) => project.id === sourceId);
  const targetIndex = next.findIndex((project) => project.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [project] = next.splice(sourceIndex, 1);
  if (!project) return;
  next.splice(targetIndex, 0, project);
  sessionStore.projects = next;
  setProjectOrder(next.map((item) => item.id));
  draggedProjectId.value = null;
}
const searching = ref(false);
const messageMatches = ref<Map<string, string>>(new Map());
let searchGeneration = 0;
const collapsedWorkspaceIds = computed(() => new Set(viewPreferences.collapsedProjectIds));
const pinnedSectionCollapsed = computed(() => viewPreferences.pinnedSectionCollapsed);
const agentPickerWorkspaceId = ref<string | null>(null);
const projectCreateOpen = ref(false);
const projectCreating = ref(false);
const projectParsing = ref(false);
const externalImportOpen = ref(false);
const contextMenu = ref<{ sessionId: string; x: number; y: number } | null>(null);
const projectContextMenu = ref<{ projectId: string; x: number; y: number } | null>(null);
const contextSession = computed(() =>
  contextMenu.value
    ? sessionStore.sessions.find((session) => session.id === contextMenu.value?.sessionId)
    : undefined,
);
const projectSettingsId = ref<string | null>(null);
const projectGit = ref<{ projectId: string; x: number; y: number } | null>(null);
const projectGitLoading = ref(false);
const projectGitError = ref<string | null>(null);
const projectGitInfo = ref<{ currentBranch: string; branches: string[] } | null>(null);
const projectBusy = ref(false);
const projectSettingsProject = computed(() =>
  projectSettingsId.value
    ? sessionStore.projects.find((project) => project.id === projectSettingsId.value)
    : undefined,
);
const panelStyle = computed(() => {
  if (props.width == null) return undefined;
  return { width: `${props.width}px` };
});

function filterSessions(list: UISession[]): UISession[] {
  const q = query.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.lastMessagePreview.toLowerCase().includes(q) ||
      s.meta.description?.toLowerCase().includes(q),
  );
}

const uiSessions = computed(() => sessionStore.sessions.map(toUISession));
const sortByRecentActivity = (left: UISession, right: UISession) =>
  compareSessionsByRecentActivity(left, right, uiSessions.value);
const searchResults = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  return uiSessions.value
    .filter((session) => session.showInSessionList)
    .map((session) => {
      const titleMatch = session.title.toLowerCase().includes(q);
      const description =
        messageMatches.value.get(session.id) ??
        (titleMatch ? session.lastMessagePreview || session.meta.description || "标题匹配" : "");
      return {
        session,
        description,
        matched: titleMatch || Boolean(messageMatches.value.get(session.id)),
      };
    })
    .filter((result) => result.matched)
    .sort((a, b) => sortByRecentActivity(a.session, b.session));
});

function highlightSearch(text: string): Array<{ text: string; highlight: boolean }> {
  const keyword = query.value.trim();
  if (!keyword) return [{ text, highlight: false }];
  const parts: Array<{ text: string; highlight: boolean }> = [];
  const lowerText = text.toLocaleLowerCase();
  const lowerKeyword = keyword.toLocaleLowerCase();
  let cursor = 0;
  let index = lowerText.indexOf(lowerKeyword, cursor);
  while (index >= 0) {
    if (index > cursor) parts.push({ text: text.slice(cursor, index), highlight: false });
    parts.push({ text: text.slice(index, index + keyword.length), highlight: true });
    cursor = index + keyword.length;
    index = lowerText.indexOf(lowerKeyword, cursor);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), highlight: false });
  return parts.length ? parts : [{ text, highlight: false }];
}

watch(query, async (value) => {
  const generation = ++searchGeneration;
  const normalized = value.trim();
  if (!normalized) {
    messageMatches.value = new Map();
    searching.value = false;
    return;
  }
  searching.value = true;
  try {
    const hits = await searchMessages(normalized, { limit: 80 });
    if (generation !== searchGeneration) return;
    const matches = new Map<string, string>();
    for (const hit of hits) {
      const sessionId = String(hit.sessionId);
      if (!matches.has(sessionId)) matches.set(sessionId, hit.snippet);
    }
    messageMatches.value = matches;
  } catch {
    if (generation === searchGeneration) messageMatches.value = new Map();
  } finally {
    if (generation === searchGeneration) searching.value = false;
  }
});
const filtered = computed(() => filterSessions(uiSessions.value));
const listVisible = computed(() => filtered.value.filter((session) => session.showInSessionList));

const rootsToShow = computed(() => {
  const visibleIds = new Set(listVisible.value.map((session) => session.id));
  return listVisible.value
    .filter((session) => !session.parentId || !visibleIds.has(session.parentId))
    .sort(sortByRecentActivity);
});

function isPinnedRoot(session: UISession): boolean {
  return !!session.pinned || !!session.isBuiltin;
}

function isPinnedListVisible(session: UISession): boolean {
  if (!isPinnedRoot(session)) return false;
  return !unpinLeaveIds.value.has(session.id);
}

function isRegularListVisible(session: UISession): boolean {
  if (isPinnedRoot(session)) return false;
  return !pinLeaveIds.value.has(session.id);
}

const pinnedRoots = computed(() =>
  rootsToShow.value.filter(isPinnedListVisible).sort((left, right) => {
    if (!!left.isBuiltin !== !!right.isBuiltin) return left.isBuiltin ? -1 : 1;
    return sortByRecentActivity(left, right);
  }),
);
const showPinnedSection = computed(
  () => pinnedRoots.value.length > 0 || unpinLeaveIds.value.size > 0 || pinLeaveIds.value.size > 0,
);
const regularRoots = computed(() => rootsToShow.value.filter(isRegularListVisible));

const workspaceGroups = computed(() => {
  const groups = groupSessionsByWorkspace(regularRoots.value, sessionStore.projects);
  return groups.map((g) => ({
    ...g,
    sessions: g.sessions.sort(sortByRecentActivity),
  }));
});

function childrenOf(parentId: string): UISession[] {
  return listVisible.value.filter((s) => s.parentId === parentId).sort(sortByRecentActivity);
}

function isWorkspaceCollapsed(workspaceId: string): boolean {
  return collapsedWorkspaceIds.value.has(workspaceId);
}

/** Only hold leave space in the workspace that owns the pinning session. */
function workspaceHoldsPinLeave(workspaceId: string): boolean {
  if (pinLeaveIds.value.size === 0) return false;
  for (const sessionId of pinLeaveIds.value) {
    const raw = sessionStore.sessions.find((session) => session.id === sessionId);
    if (!raw) continue;
    if (toUISession(raw).workspaceId === workspaceId) return true;
  }
  return false;
}

function toggleWorkspaceCollapse(workspaceId: string) {
  setProjectCollapsed(workspaceId, !collapsedWorkspaceIds.value.has(workspaceId));
}

function togglePinnedCollapse() {
  setPinnedSectionCollapsed(!pinnedSectionCollapsed.value);
}

function openAgentPicker(workspaceId: string) {
  agentPickerWorkspaceId.value = workspaceId;
}

function openProjectSettings(projectId: string) {
  closeProjectGit();
  projectSettingsId.value = projectId;
}

function openProjectContextMenu(projectId: string, event: MouseEvent) {
  closeContextMenu();
  projectContextMenu.value = {
    projectId,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 136)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - 56)),
  };
}

async function confirmDeleteProject() {
  const target = projectContextMenu.value;
  projectContextMenu.value = null;
  if (!target) return;
  const project = sessionStore.projects.find((item) => item.id === target.projectId);
  if (!project) return;
  const ok = await requestUiDeleteConfirm({
    title: "删除项目",
    message: `这会删除项目下的所有会话和对应目录。请输入项目名“${project.name}”确认。`,
    confirmText: "删除项目",
    expectedText: project.name,
  });
  if (!ok) return;
  try {
    await apiDeleteProject(project.id, project.name);
    await Promise.all([sessionStore.fetchProjects(), sessionStore.fetchSessions()]);
    showUiMessage("项目已删除", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "删除项目失败", "error");
  }
}

function closeProjectSettings() {
  if (projectBusy.value) return;
  projectSettingsId.value = null;
}

function openProjectGit(projectId: string, event: MouseEvent) {
  closeProjectSettings();
  const target = event.currentTarget as HTMLElement | null;
  const rect = target?.getBoundingClientRect();
  const width = 240;
  const left = rect ? rect.right - width : event.clientX;
  projectGit.value = {
    projectId,
    x: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
    y: rect ? Math.min(rect.bottom + 4, window.innerHeight - 320) : event.clientY,
  };
  void refreshProjectGitInfo(projectId);
}

async function refreshProjectGitInfo(projectId: string) {
  projectGitLoading.value = true;
  projectGitError.value = null;
  projectGitInfo.value = null;
  try {
    projectGitInfo.value = await getProjectGitInfo(projectId);
  } catch (error) {
    projectGitError.value = error instanceof Error ? error.message : "读取 Git 分支失败";
  } finally {
    projectGitLoading.value = false;
  }
}

function closeProjectGit() {
  if (projectBusy.value) return;
  projectGit.value = null;
  projectGitInfo.value = null;
  projectGitError.value = null;
}

async function renameProject(name: string) {
  const projectId = projectSettingsId.value;
  if (!projectId || projectBusy.value) return;
  projectBusy.value = true;
  try {
    await sessionStore.updateProject(projectId, { name });
    showUiMessage("项目名已更新", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "项目名更新失败", "error");
  } finally {
    projectBusy.value = false;
  }
}

async function runProjectGitCheckout(branch: string) {
  const target = projectGit.value;
  if (!target || projectBusy.value) return;
  projectBusy.value = true;
  try {
    const result = await checkoutProjectGit(target.projectId, branch);
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    showUiMessage(detail || `已切换到 ${branch}`, "success");
    await refreshProjectGitInfo(target.projectId);
  } catch (error) {
    showUiMessage(formatProjectGitError(error, "checkout"), "error");
  } finally {
    projectBusy.value = false;
  }
}

async function runProjectGit(action: "pull" | "push") {
  const target = projectGit.value;
  if (!target || projectBusy.value) return;
  projectBusy.value = true;
  try {
    const result =
      action === "pull"
        ? await pullProjectGit(target.projectId)
        : await pushProjectGit(target.projectId);
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    showUiMessage(detail || (action === "pull" ? "Git Pull 完成" : "Git Push 完成"), "success");
    projectGit.value = null;
  } catch (error) {
    showUiMessage(formatProjectGitError(error, action), "error");
  } finally {
    projectBusy.value = false;
  }
}

function formatProjectGitError(error: unknown, action: "pull" | "push" | "checkout"): string {
  const fallback =
    action === "pull" ? "Git Pull 失败" : action === "push" ? "Git Push 失败" : "切换分支失败";
  if (!(error instanceof Error)) return fallback;
  const match = error.message.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { error?: string };
      if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error.trim();
    } catch {
      // keep raw message
    }
  }
  return error.message || fallback;
}

function closeAgentPicker() {
  agentPickerWorkspaceId.value = null;
}

function openExternalImport() {
  closeAgentPicker();
  externalImportOpen.value = true;
}

function openExternalImportFromMobileMenu() {
  mobileAddMenuOpen.value = false;
  openExternalImport();
}

function onExternalSessionImported(sessionId: string) {
  externalImportOpen.value = false;
  emit("select", sessionId);
}

async function createProjectFromDialog(cwd: string) {
  if (projectCreating.value) return;
  projectCreating.value = true;
  try {
    const project = await sessionStore.createProject({ cwd });
    rememberCwd(cwd);
    projectCreateOpen.value = false;
    setProjectCollapsed(project.id, false);
    showUiMessage("项目已创建，正在解析", "success");
    projectSettingsId.value = project.id;
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "创建项目失败", "error");
  } finally {
    projectCreating.value = false;
  }
}

async function parseCurrentProject() {
  const projectId = projectSettingsId.value;
  if (!projectId || projectParsing.value) return;
  projectParsing.value = true;
  try {
    const result = await apiParseProject(projectId);
    const index = sessionStore.projects.findIndex((project) => project.id === result.project.id);
    if (index >= 0) sessionStore.projects[index] = result.project;
    else sessionStore.projects.unshift(result.project);
    if (result.status === "ready") showUiMessage("项目解析完成", "success");
    else if (result.status === "skipped") {
      showUiMessage(result.error || "未配置「助手模型」", "error");
    } else {
      showUiMessage(result.error || "解析失败", "error");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "项目解析失败";
    showUiMessage(message, "error");
    await sessionStore.fetchProjects().catch(() => undefined);
  } finally {
    projectParsing.value = false;
  }
}

function openContextMenu(sessionId: string, pos: { x: number; y: number }) {
  if (sessionStore.sessions.find((session) => session.id === sessionId)?.isBuiltin) return;
  const menuWidth = 120;
  const menuHeight = 80;
  const x = Math.min(pos.x, window.innerWidth - menuWidth - 8);
  const y = Math.min(pos.y, window.innerHeight - menuHeight - 8);
  contextMenu.value = { sessionId, x: Math.max(8, x), y: Math.max(8, y) };
}

function closeContextMenu() {
  contextMenu.value = null;
}

function sessionIdFromLeaveEl(el: Element): string | null {
  if (!(el instanceof HTMLElement)) return null;
  return (
    el.dataset.sessionId ?? el.closest("[data-session-id]")?.getAttribute("data-session-id") ?? null
  );
}

function completePinLeave(sessionId: string) {
  if (!pinLeaveIds.value.has(sessionId)) return;
  if (pinLeaveTimer != null) {
    clearTimeout(pinLeaveTimer);
    pinLeaveTimer = null;
  }
  const next = new Set(pinLeaveIds.value);
  next.delete(sessionId);
  pinLeaveIds.value = next;
  setSessionViewFlag("pinnedSessionIds", sessionId, true);
}

function completeUnpinLeave(sessionId: string) {
  if (!unpinLeaveIds.value.has(sessionId)) return;
  if (unpinLeaveTimer != null) {
    clearTimeout(unpinLeaveTimer);
    unpinLeaveTimer = null;
  }
  const next = new Set(unpinLeaveIds.value);
  next.delete(sessionId);
  unpinLeaveIds.value = next;
  setSessionViewFlag("pinnedSessionIds", sessionId, false);
  const raw = sessionStore.sessions.find((item) => item.id === sessionId);
  if (raw) {
    const session = toUISession(raw);
    if (session.workspaceId !== "none") {
      setProjectCollapsed(session.workspaceId, false);
    }
  }
}

function onRegularSessionAfterLeave(el: Element) {
  const sessionId = sessionIdFromLeaveEl(el);
  if (!sessionId) return;
  completePinLeave(sessionId);
}

function onPinnedSessionAfterLeave(el: Element) {
  const sessionId = sessionIdFromLeaveEl(el);
  if (!sessionId) return;
  completeUnpinLeave(sessionId);
}

function togglePinnedSession() {
  const target = contextMenu.value;
  closeContextMenu();
  if (!target) return;
  if (sessionStore.sessions.find((session) => session.id === target.sessionId)?.isBuiltin) return;
  const pinned = viewPreferences.pinnedSessionIds.includes(target.sessionId);
  const willPin = !pinned;

  setPinnedSectionCollapsed(false);

  if (isAdvancedAnimationEnabled()) {
    setSessionViewFlag("pinnedSessionIds", target.sessionId, willPin);
    showUiMessage(pinned ? "已取消置顶" : "已置顶", "success");
    return;
  }

  if (willPin) {
    pinLeaveIds.value = new Set([...pinLeaveIds.value, target.sessionId]);
    schedulePinLeaveFallback(target.sessionId);
  } else {
    unpinLeaveIds.value = new Set([...unpinLeaveIds.value, target.sessionId]);
    scheduleUnpinLeaveFallback(target.sessionId);
  }
  showUiMessage(pinned ? "已取消置顶" : "已置顶", "success");
}

let pinLeaveTimer: ReturnType<typeof setTimeout> | null = null;
let unpinLeaveTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePinLeaveFallback(sessionId: string) {
  if (pinLeaveTimer != null) clearTimeout(pinLeaveTimer);
  pinLeaveTimer = setTimeout(() => {
    pinLeaveTimer = null;
    completePinLeave(sessionId);
  }, 360);
}

function scheduleUnpinLeaveFallback(sessionId: string) {
  if (unpinLeaveTimer != null) clearTimeout(unpinLeaveTimer);
  unpinLeaveTimer = setTimeout(() => {
    unpinLeaveTimer = null;
    completeUnpinLeave(sessionId);
  }, 360);
}

async function confirmDeleteSession() {
  const target = contextMenu.value;
  closeContextMenu();
  if (!target) return;
  if (sessionStore.sessions.find((session) => session.id === target.sessionId)?.isBuiltin) return;
  const ok = await requestUiDeleteConfirm({
    title: "删除会话",
    message: "确定删除该会话？子会话也会一并删除。",
  });
  if (!ok) return;
  try {
    // Drop any pin-leave hold for this session so workspace groups don't keep a blank slot.
    if (pinLeaveIds.value.has(target.sessionId)) {
      const next = new Set(pinLeaveIds.value);
      next.delete(target.sessionId);
      pinLeaveIds.value = next;
    }
    if (unpinLeaveIds.value.has(target.sessionId)) {
      const next = new Set(unpinLeaveIds.value);
      next.delete(target.sessionId);
      unpinLeaveIds.value = next;
    }
    // Advanced → dust then delete. Basic → delete and let TransitionGroup slide left.
    const row = queryDustTarget(`[data-session-id="${CSS.escape(target.sessionId)}"]`);
    await withDustRemove(row, () => sessionStore.deleteSession(target.sessionId));
    emit("delete", target.sessionId);
    showUiMessage("会话已删除", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "删除失败", "error");
  }
}

async function achieveSession() {
  const target = contextMenu.value;
  closeContextMenu();
  if (!target) return;
  const session = sessionStore.sessions.find((item) => item.id === target.sessionId);
  if (session?.isBuiltin) return;
  const prompt =
    session?.creationMethod === "spawn_agent"
      ? "完成该子代理会话？完成后会从会话列表隐藏，不会提交或合并代码。"
      : "完成并归档该会话？系统会提交剩余修改并合并到项目默认分支。";
  const ok = await requestUiConfirm({
    title: "完成会话",
    message: prompt,
    confirmText: "完成",
  });
  if (!ok) return;
  try {
    await sessionStore.completeSession(target.sessionId);
    showUiMessage("会话已归档", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "归档失败", "error");
  }
}

async function syncSession() {
  const target = contextMenu.value;
  closeContextMenu();
  if (!target) return;
  const ok = await requestUiConfirm({
    title: "同步项目修改",
    message: "将合并项目最新修改，并重新安装依赖和启动服务。当前会话需要先提交已有修改。",
    confirmText: "同步",
  });
  if (!ok) return;
  try {
    await withUiBusy("正在同步项目修改…", () => sessionStore.syncSession(target.sessionId));
    showUiMessage("同步完成，服务已重新启动", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "同步失败", "error");
  }
}

async function forkSessionFromMenu() {
  const target = contextMenu.value;
  closeContextMenu();
  if (!target) return;
  const source = sessionStore.sessions.find((session) => session.id === target.sessionId);
  if (!source) return;
  try {
    const forked = source.leafId
      ? await sessionStore.forkSession(target.sessionId, {
          entryId: source.leafId,
          label: `${source.title || "会话"} · Fork`,
        })
      : await sessionStore.cloneSession(target.sessionId);
    emit("select", forked.id);
    showUiMessage("已 Fork 新会话", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "Fork 失败", "error");
  }
}

async function onAgentPicked(agentId: string) {
  const projectId = agentPickerWorkspaceId.value;
  closeAgentPicker();
  if (!projectId) {
    showUiMessage("请先在项目下添加会话", "error");
    return;
  }
  const project = sessionStore.projects.find((item) => item.id === projectId);
  if (!project) {
    showUiMessage("项目不存在", "error");
    return;
  }
  rememberCwd(project.cwd);

  const agent = agentStore.getAgentById(agentId);
  const session = await sessionStore.createSession({
    projectId: project.id,
    agentId,
    cwd: project.cwd,
    meta: { name: agent?.name ?? agentId },
  });

  setProjectCollapsed(project.id, false);

  emit("select", session.id);
}
</script>

<style scoped>
.chat-list-error-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 8px 12px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-danger, #ef4444) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-danger, #ef4444) 28%, transparent);
  color: var(--app-text-primary);
  font-size: var(--app-font-caption, 0.75rem);
  line-height: 1.4;
}

.chat-list-error-banner__text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.chat-list-error-banner__retry {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--app-accent);
  font-size: var(--app-font-caption, 0.75rem);
  font-weight: var(--app-font-weight-medium, 500);
  cursor: pointer;
  padding: 0;
}

.chat-list-error-banner__retry:hover {
  text-decoration: underline;
}

.chat-search-state,
.chat-list-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 16px;
  color: var(--app-text-muted);
  font-size: var(--app-font-control, 0.8125rem);
  text-align: center;
}

.chat-list-scroll:has(> .chat-list-state) {
  display: flex;
  flex-direction: column;
}

.chat-list-state {
  flex: 1;
  width: 100%;
  min-height: 100%;
  box-sizing: border-box;
}

.chat-list-state__spin,
.chat-search-state :deep(.chat-list-state__spin) {
  width: 22px;
  height: 22px;
  animation: chat-list-spin 0.8s linear infinite;
}

.chat-list-project-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 16px 32px;
  color: var(--app-text-muted);
  text-align: center;
}

.chat-list-project-empty__icon {
  width: 28px;
  height: 28px;
  opacity: 0.55;
}

.chat-list-project-empty p {
  font-size: var(--app-font-caption, 0.75rem);
}

@keyframes chat-list-spin {
  to {
    transform: rotate(360deg);
  }
}

.chat-search-state {
  padding: 40px 16px;
  color: var(--app-text-muted);
  font-size: 13px;
  text-align: center;
}
.chat-search-result {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 11px;
  padding: 11px 14px;
  text-align: left;
  transition: background-color 0.15s;
}
.chat-search-result:hover,
.chat-search-result--active {
  background: var(--app-list-active-bg);
}
.chat-search-result__avatar {
  display: grid;
  width: 42px;
  height: 42px;
  flex: none;
  place-items: center;
  border-radius: 7px;
  color: white;
  font-size: 17px;
}
.chat-search-result__body {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.chat-search-result__body strong,
.chat-search-result__body small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-search-result__body strong {
  color: var(--app-text-primary);
  font-size: 14px;
  font-weight: 500;
}
.chat-search-result__body small {
  color: var(--app-text-secondary);
  font-size: 12px;
}

.chat-search-highlight {
  color: var(--app-accent);
  font-weight: 600;
}

.chat-list-import-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-right: -8px;
  flex: none;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
  line-height: 0;
  transition:
    color 0.18s ease,
    background-color 0.18s ease;
}

.chat-list-search-icon {
  display: none;
}

.chat-list-add-icon,
.chat-list-add-menu,
.chat-list-add-backdrop {
  display: none;
}

.chat-list-import-icon svg {
  display: block;
}

.chat-list-import-icon:hover,
.chat-list-import-icon:focus-visible,
.chat-list-import-icon--active {
  color: var(--app-accent);
  background: var(--app-hover);
  outline: none;
}

.workspace-collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.workspace-collapse--open {
  grid-template-rows: 1fr;
}
.workspace-collapse__inner {
  min-height: 0;
  overflow: hidden;
  opacity: 0;
  transform: translateY(-6px);
  pointer-events: none;
  transition:
    opacity 0.24s ease,
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.workspace-collapse--open .workspace-collapse__inner {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
/* Let slide-left show during imperative delete + TransitionGroup leave. */
.workspace-collapse__inner:has(.session-list-leave-active),
.workspace-collapse__inner:has([data-dust-leave-done="1"]) {
  overflow: visible;
}
/* Pin leave only: keep the source workspace open while the item animates out. */
.workspace-collapse__inner--hold-leave {
  overflow: visible;
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.workspace-collapse:has(.workspace-collapse__inner--hold-leave) {
  grid-template-rows: 1fr;
}

.workspace-empty {
  padding: 14px 16px 16px 40px;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.list-search-input {
  background: var(--app-list-search-bg);
  color: var(--app-text-primary);
}

.list-search-input:focus {
  background: var(--app-list-search-focus-bg);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-accent) 50%, transparent);
}

.list-section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 16px 6px 12px;
  background: color-mix(in srgb, var(--app-list-section-bg) 95%, transparent);
  transition:
    box-shadow 180ms ease,
    background-color 180ms ease;
}

.list-section-header--linked {
  background: color-mix(in srgb, var(--app-accent) 7%, var(--app-list-section-bg));
  box-shadow:
    inset 3px 0 0 var(--app-accent),
    0 -8px 22px color-mix(in srgb, var(--app-accent) 14%, transparent),
    0 8px 22px color-mix(in srgb, var(--app-accent) 11%, transparent);
}

.list-section-header--linked .list-section-title {
  color: var(--app-accent);
  text-shadow: 0 0 9px color-mix(in srgb, var(--app-accent) 38%, transparent);
}

.project-scroll-beacon {
  position: absolute;
  z-index: 25;
  right: 0;
  bottom: 0;
  left: 0;
  height: 72px;
  overflow: hidden;
  pointer-events: none;
}

.project-scroll-beacon__glow {
  position: absolute;
  right: 8%;
  bottom: -42px;
  left: 8%;
  height: 78px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-accent) 38%, transparent);
  filter: blur(18px);
  animation: project-beacon-breathe 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.project-scroll-beacon__label {
  position: absolute;
  right: 12px;
  bottom: 9px;
  left: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: var(--app-accent);
  font-size: 10px;
  font-weight: 600;
  text-shadow: 0 1px 8px color-mix(in srgb, var(--app-list-bg) 75%, transparent);
  animation: project-beacon-float 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.project-scroll-beacon__label svg {
  width: 13px;
  height: 13px;
}

.project-beacon-enter-active,
.project-beacon-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}

.project-beacon-enter-from,
.project-beacon-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@keyframes project-beacon-breathe {
  0%,
  100% {
    opacity: 0.48;
    transform: scaleX(0.88);
  }
  50% {
    opacity: 0.82;
    transform: scaleX(1.04);
  }
}

@keyframes project-beacon-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(3px);
  }
}

:global(html[data-theme="light"] .list-section-header--linked) {
  background: color-mix(in srgb, var(--app-accent) 4%, var(--app-list-section-bg));
  box-shadow:
    inset 2px 0 0 color-mix(in srgb, var(--app-accent) 70%, transparent),
    0 7px 18px color-mix(in srgb, var(--app-accent) 7%, transparent);
}

:global(html[data-theme="light"] .list-section-header--linked .list-section-title) {
  text-shadow: 0 0 7px color-mix(in srgb, var(--app-accent) 18%, transparent);
}

:global(html[data-theme="light"] .project-scroll-beacon__glow) {
  background: color-mix(in srgb, var(--app-accent) 20%, transparent);
  filter: blur(22px);
}

@media (prefers-reduced-motion: reduce) {
  .project-scroll-beacon__glow,
  .project-scroll-beacon__label {
    animation: none;
  }
}

.list-section-title {
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text-secondary);
}

.section-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  color: var(--app-text-muted);
  cursor: pointer;
  transition:
    color 0.15s,
    background-color 0.15s;
}

.section-action-btn:hover {
  color: var(--app-text-secondary);
  background: var(--app-hover);
  cursor: pointer;
}

.section-action-btn:not(.section-action-btn--chevron) svg {
  width: 18px;
  height: 18px;
  stroke-width: 2.25;
}

.section-action-btn--chevron:hover,
.section-action-btn--chevron:active,
.section-action-btn--chevron:focus-visible {
  background: transparent;
}

.section-action-btn--chevron {
  width: 16px;
  min-width: 16px;
  justify-content: flex-start;
  padding: 0;
  flex-shrink: 0;
}

.section-chevron {
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  transform: rotate(0deg);
}

.section-chevron--open {
  transform: rotate(90deg);
}

@media (max-width: 767px) {
  .relative.h-full {
    overflow-x: hidden;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  .relative.h-full input,
  .relative.h-full textarea {
    user-select: text;
    -webkit-user-select: text;
  }

  .chat-list-header {
    position: relative;
    height: 52px;
    min-height: 52px;
    padding-inline: 10px;
    border-bottom-color: var(--app-header-divider, var(--app-border-subtle));
  }

  .chat-list-header h1 {
    position: absolute;
    left: 50%;
    color: var(--app-text-primary);
    font-size: var(--m-font-page-title, 17px);
    font-weight: 500;
    transform: translateX(-50%);
  }

  .chat-list-header .chat-list-import-icon--desktop {
    display: none;
  }

  .chat-list-search-icon {
    display: grid;
    width: 42px;
    height: 42px;
    margin-left: auto;
    place-items: center;
    color: var(--app-text-primary);
  }

  .chat-list-search-icon svg {
    width: 24px;
    height: 24px;
    stroke-width: 1.8;
  }

  .chat-list-add-icon {
    display: grid;
    width: 36px;
    height: 36px;
    flex: none;
    place-items: center;
    border: none;
    border-radius: 6px;
    color: var(--m-icon, var(--app-text-primary));
  }

  .chat-list-add-icon:active,
  .chat-list-add-icon--active {
    background: var(--m-pressed, var(--app-hover));
  }

  .chat-list-add-icon svg {
    width: 24px;
    height: 24px;
    stroke-width: 1.8;
  }

  .chat-list-add-backdrop {
    position: fixed;
    z-index: 79;
    inset: 0;
    display: block;
    background: transparent;
  }

  .chat-list-add-menu {
    position: absolute;
    z-index: 80;
    top: 48px;
    right: 8px;
    display: block;
    min-width: 180px;
    overflow: hidden;
    border: 1px solid var(--m-border, rgb(255 255 255 / 8%));
    border-radius: var(--m-card-radius, 8px);
    background: var(--m-surface, #2b2b2b);
    box-shadow: 0 8px 28px rgb(0 0 0 / 28%);
  }

  .chat-list-add-menu button {
    display: flex;
    width: 100%;
    min-height: 52px;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    color: var(--m-text-primary, #fff);
    font-size: 14px;
    text-align: left;
  }

  .chat-list-add-menu button:active {
    background: var(--m-pressed, rgb(255 255 255 / 10%));
  }

  .chat-list-add-menu svg {
    width: 21px;
    height: 21px;
  }

  .chat-list-search {
    display: none;
  }

  .chat-list-search .list-search-input {
    height: 36px;
    padding-top: 0;
    padding-bottom: 0;
    font-size: 14px;
  }

  .chat-list-search .relative > svg {
    top: 10px;
  }

  .chat-list-scroll {
    padding-inline: 0;
    overflow-x: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .chat-list-scroll::-webkit-scrollbar {
    display: none;
  }

  .list-section-header {
    min-height: 34px;
    padding: 2px 16px;
  }

  .list-section-header--pinned {
    width: 100%;
    margin-inline: 0;
    padding-inline: 16px;
  }

  .list-section-title {
    font-size: 12px;
  }

  .chat-list-roots,
  .chat-list-projects {
    display: grid;
    gap: 0;
  }

  .chat-list-root,
  .workspace-group {
    padding-inline: 0;
  }

  .workspace-group .list-section-header {
    width: 100%;
    margin-inline: 0;
    padding-inline: 16px;
  }

  .section-action-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
  }

  .section-action-btn--chevron {
    width: 16px;
    min-width: 16px;
  }

  .section-action-btn:not(.section-action-btn--chevron) svg {
    width: 19px;
    height: 19px;
    stroke-width: 2.4;
  }

  .section-action-btn--chevron:hover,
  .section-action-btn--chevron:active,
  .section-action-btn--chevron:focus-visible {
    background: transparent;
    color: var(--app-text-muted);
  }
}
</style>
