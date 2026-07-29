<template>
  <div
    class="relative h-full w-full flex flex-col shrink-0 min-w-0"
    :style="{ ...panelStyle, background: 'var(--app-list-bg)' }"
  >
    <div
      class="h-16 flex items-center px-4 shrink-0 border-b"
      style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)"
    >
      <h1 class="text-[16px] font-medium flex-1" style="color: var(--app-text-primary)">聊天</h1>
      <button
        type="button"
        class="chat-list-import-icon"
        :class="{ 'chat-list-import-icon--active': externalImportOpen }"
        title="从外部引入"
        aria-label="从外部引入"
        @click="openExternalImport"
      >
        <Import class="h-[18px] w-[18px]" />
      </button>
    </div>

    <div
      class="px-3 py-2 shrink-0 border-b"
      style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)"
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
      class="flex-1 overflow-y-auto custom-scrollbar"
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
            <strong>{{ result.session.title }}</strong>
            <small>{{ result.description }}</small>
          </span>
        </button>
        <div v-if="!searching && !searchResults.length" class="chat-search-state">无匹配会话</div>
      </template>
      <template v-else-if="pinnedRoots.length">
        <div class="list-section-header sticky top-0 z-10">
          <span class="list-section-title flex-1 truncate">置顶</span>
        </div>
        <div v-for="root in pinnedRoots" :key="root.id">
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
      </template>

      <template v-if="!query.trim() && workspaceGroups.length">
        <template v-for="group in workspaceGroups" :key="group.workspace.id">
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
              class="section-action-btn"
              :title="isWorkspaceCollapsed(group.workspace.id) ? '展开' : '折叠'"
              @click="toggleWorkspaceCollapse(group.workspace.id)"
            >
              <ChevronRight
                class="w-4 h-4 section-chevron"
                :class="{ 'section-chevron--open': !isWorkspaceCollapsed(group.workspace.id) }"
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
            <div class="workspace-collapse__inner">
              <div v-if="!group.sessions.length" class="workspace-empty">暂无会话</div>
              <div v-for="root in group.sessions" :key="root.id" class="workspace-session-block">
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
            </div>
          </div>
        </template>
      </template>

      <div
        v-if="!query.trim() && !pinnedRoots.length && !workspaceGroups.length"
        class="py-12 text-center text-sm"
        style="color: var(--app-text-muted)"
      >
        暂无项目
      </div>
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
      @delete="confirmDeleteSession"
      @achieve="achieveSession"
      @fork="forkFinishedSession"
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
      :description="projectDescription"
      :description-status="projectDescriptionStatus"
      :description-error="projectDescriptionError"
      :scripts="projectScripts"
      :busy="projectBusy"
      :regenerating="projectDescribing"
      @close="closeProjectSettings"
      @rename="renameProject"
      @regenerate-description="regenerateProjectDescription"
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
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Import,
  Plus,
  Search,
  Settings,
} from "lucide-vue-next";
import { setProjectOrder, setSessionViewFlag, viewPreferences } from "@/utils/view-preferences";
import type { UISession } from "@/types/ui";
import { useAgentStore, useSessionStore } from "@/store";
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
  listProjectScripts,
  regenerateProjectDescription as apiRegenerateProjectDescription,
  searchMessages,
  type ProjectScript,
} from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import { requestUiConfirm } from "@/composables/use-ui-confirm";
import ExternalSessionImportDialog from "./ExternalSessionImportDialog.vue";
import ProjectCreateDialog from "./ProjectCreateDialog.vue";
import ProjectGitMenu from "./ProjectGitMenu.vue";
import ProjectListContextMenu from "./ProjectListContextMenu.vue";
import ProjectSettingsMenu from "./ProjectSettingsMenu.vue";
import SessionAgentPicker from "./SessionAgentPicker.vue";
import SessionListContextMenu from "./SessionListContextMenu.vue";
import SessionListItem from "./SessionListItem.vue";
import SessionListSubtree from "./SessionListSubtree.vue";
import SessionAvatar from "./SessionAvatar.vue";

const props = defineProps<{
  activeId: string;
  width?: number;
}>();

const emit = defineEmits<{
  select: [id: string];
  delete: [id: string];
  settings: [];
}>();

const sessionStore = useSessionStore();
const agentStore = useAgentStore();

const query = ref("");
const draggedProjectId = ref<string | null>(null);
const highlightedProjectId = ref<string | null>(null);
const projectBelowViewport = ref(false);
const sessionScrollPanel = ref<HTMLElement | null>(null);
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
const collapsedWorkspaceIds = ref<Set<string>>(new Set());
const knownWorkspaceIds = new Set<string>();
const agentPickerWorkspaceId = ref<string | null>(null);
const projectCreateOpen = ref(false);
const projectCreating = ref(false);
const projectDescribing = ref(false);
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
const projectDescription = computed(() => {
  return projectSettingsProject.value?.description ?? null;
});
const projectDescriptionStatus = computed(() => {
  return projectDescription.value ? "ready" : null;
});
const projectDescriptionError = computed(() => {
  return null;
});
const projectScripts = ref<ProjectScript[]>([]);

async function refreshProjectScripts(projectId: string | null) {
  if (!projectId) {
    projectScripts.value = [];
    return;
  }
  try {
    projectScripts.value = await listProjectScripts(projectId);
  } catch {
    projectScripts.value = [];
  }
}

watch(projectSettingsId, (projectId) => {
  if (projectId) void refreshProjectScripts(projectId);
});

watch(
  () => sessionStore.projects.map((project) => project.id),
  (projectIds) => {
    const next = new Set(collapsedWorkspaceIds.value);
    for (const projectId of projectIds) {
      if (knownWorkspaceIds.has(projectId)) continue;
      knownWorkspaceIds.add(projectId);
      next.add(projectId);
    }
    collapsedWorkspaceIds.value = next;
  },
  { immediate: true },
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

const pinnedRoots = computed(() =>
  rootsToShow.value.filter(isPinnedRoot).sort((left, right) => {
    if (!!left.isBuiltin !== !!right.isBuiltin) return left.isBuiltin ? -1 : 1;
    return sortByRecentActivity(left, right);
  }),
);
const regularRoots = computed(() => rootsToShow.value.filter((s) => !isPinnedRoot(s)));

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

function toggleWorkspaceCollapse(workspaceId: string) {
  const next = new Set(collapsedWorkspaceIds.value);
  if (next.has(workspaceId)) next.delete(workspaceId);
  else next.add(workspaceId);
  collapsedWorkspaceIds.value = next;
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
  const ok = await requestUiConfirm({
    title: "删除项目",
    message: `这会删除项目下的所有会话和对应目录。请输入项目名“${project.name}”确认。`,
    confirmText: "删除项目",
    danger: true,
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
    const next = new Set(collapsedWorkspaceIds.value);
    next.delete(project.id);
    collapsedWorkspaceIds.value = next;
    showUiMessage("项目已创建，正在生成描述", "success");
    projectSettingsId.value = project.id;
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "创建项目失败", "error");
  } finally {
    projectCreating.value = false;
  }
}

async function regenerateProjectDescription() {
  const projectId = projectSettingsId.value;
  if (!projectId || projectDescribing.value) return;
  projectDescribing.value = true;
  try {
    const result = await apiRegenerateProjectDescription(projectId);
    const index = sessionStore.projects.findIndex((project) => project.id === result.project.id);
    if (index >= 0) sessionStore.projects[index] = result.project;
    else sessionStore.projects.unshift(result.project);
    projectScripts.value = result.scripts ?? [];
    if (result.status === "ready") showUiMessage("华生已完成项目解析", "success");
    else if (result.status === "skipped") {
      showUiMessage(result.error || "未配置「项目描述」功能模型", "error");
    } else {
      showUiMessage(result.error || "生成失败", "error");
    }
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "重新生成描述失败", "error");
    await sessionStore.fetchProjects().catch(() => undefined);
  } finally {
    projectDescribing.value = false;
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

function togglePinnedSession() {
  const target = contextMenu.value;
  closeContextMenu();
  if (!target) return;
  if (sessionStore.sessions.find((session) => session.id === target.sessionId)?.isBuiltin) return;
  const pinned = viewPreferences.pinnedSessionIds.includes(target.sessionId);
  setSessionViewFlag("pinnedSessionIds", target.sessionId, !pinned);
  showUiMessage(pinned ? "已取消置顶" : "已置顶", "success");
}

async function confirmDeleteSession() {
  const target = contextMenu.value;
  closeContextMenu();
  if (!target) return;
  if (sessionStore.sessions.find((session) => session.id === target.sessionId)?.isBuiltin) return;
  const ok = await requestUiConfirm({
    title: "删除会话",
    message: "确定删除该会话？子会话也会一并删除。",
    confirmText: "删除",
    danger: true,
  });
  if (!ok) return;
  try {
    await sessionStore.deleteSession(target.sessionId);
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

async function forkFinishedSession() {
  const target = contextMenu.value;
  closeContextMenu();
  if (!target) return;
  const source = sessionStore.sessions.find((session) => session.id === target.sessionId);
  if (!source?.leafId) return;
  try {
    const forked = await sessionStore.forkSession(target.sessionId, {
      entryId: source.leafId,
      label: `${source.title || "会话"} · 继续`,
    });
    emit("select", forked.id);
    showUiMessage("已创建继续会话", "success");
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

  const next = new Set(collapsedWorkspaceIds.value);
  next.delete(project.id);
  collapsedWorkspaceIds.value = next;

  emit("select", session.id);
}
</script>

<style scoped>
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

.chat-list-import-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-right: -7px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
  line-height: 0;
  transition:
    color 0.18s ease,
    background-color 0.18s ease;
}

.chat-list-import-icon svg {
  transform: translateY(2px);
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
  padding: 6px 12px 6px 8px;
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

.section-chevron {
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  transform: rotate(0deg);
}

.section-chevron--open {
  transform: rotate(90deg);
}
</style>
