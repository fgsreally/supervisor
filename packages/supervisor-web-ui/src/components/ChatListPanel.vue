<template>
  <div
    class="h-full w-full flex flex-col shrink-0 min-w-0"
    :style="{ ...panelStyle, background: 'var(--app-list-bg)' }"
  >
    <div
      class="h-16 flex items-center px-4 shrink-0 border-b"
      style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)"
    >
      <h1 class="text-[16px] font-medium flex-1" style="color: var(--app-text-primary)">聊天</h1>
      <button
        type="button"
        class="chat-home-settings"
        title="创建聊天"
        @click="openAgentPicker('')"
      >
        <Plus class="h-[19px] w-[19px]" />
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

    <div class="flex-1 overflow-y-auto custom-scrollbar">
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
            :name="result.session.meta.name"
            :agent-id="result.session.agentId"
            :avatar="result.session.meta.avatar"
            :agent-icon="
              result.session.agentId
                ? agentStore.getAgentById(result.session.agentId)?.icon
                : null
            "
            :size="42"
          />
          <span class="chat-search-result__body">
            <strong>{{ result.session.meta.name }}</strong>
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
          />
        </div>
      </template>

      <template v-if="!query.trim() && regularRoots.length">
        <template v-for="group in workspaceGroups" :key="group.workspace.id">
          <div class="list-section-header sticky top-0 z-10">
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
            <span class="list-section-title flex-1 truncate">{{ group.workspace.name }}</span>
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
              title="添加 Agent"
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
        v-if="!query.trim() && !pinnedRoots.length && !regularRoots.length"
        class="py-12 text-center text-sm"
        style="color: var(--app-text-muted)"
      >
        无匹配会话
      </div>
    </div>

    <SessionAgentPicker
      :open="agentPickerWorkspaceId != null"
      @close="closeAgentPicker"
      @select="onAgentPicked"
      @external-import="openExternalImport"
    />

    <ExternalSessionImportDialog
      :open="externalImportOpen"
      :importing="externalImporting"
      @close="externalImportOpen = false"
      @select="onExternalSessionPicked"
    />

    <SessionListContextMenu
      :open="contextMenu != null"
      :x="contextMenu?.x ?? 0"
      :y="contextMenu?.y ?? 0"
      :status="contextSession?.status"
      @close="closeContextMenu"
      @delete="confirmDeleteSession"
      @achieve="achieveSession"
      @fork="forkFinishedSession"
    />

    <ProjectSettingsMenu
      :open="projectSettingsId != null"
      :name="projectSettingsProject?.name"
      :cwd="projectSettingsProject?.cwd"
      :busy="projectBusy"
      @close="closeProjectSettings"
      @rename="renameProject"
    />

    <ProjectGitMenu
      :open="projectGit != null"
      :x="projectGit?.x ?? 0"
      :y="projectGit?.y ?? 0"
      :busy="projectBusy"
      @close="closeProjectGit"
      @pull="runProjectGit('pull')"
      @push="runProjectGit('push')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronRight, GitBranch, Plus, Search, Settings } from "lucide-vue-next";
import type { UISession } from "@/types/ui";
import { useAgentStore, useSessionStore } from "@/store";
import { groupSessionsByWorkspace, toUISession } from "@/utils/ui-session";
import { getDefaultWorkspaceCwd, rememberCwd } from "@/config/workspace";
import {
  pullProjectGit,
  pushProjectGit,
  searchMessages,
  type ExternalSessionCandidate,
} from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import ExternalSessionImportDialog from "./ExternalSessionImportDialog.vue";
import ProjectGitMenu from "./ProjectGitMenu.vue";
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
const searching = ref(false);
const messageMatches = ref<Map<string, string>>(new Map());
let searchGeneration = 0;
const collapsedWorkspaceIds = ref<Set<string>>(new Set());
const agentPickerWorkspaceId = ref<string | null>(null);
const externalImportOpen = ref(false);
const externalImporting = ref(false);
const contextMenu = ref<{ sessionId: string; x: number; y: number } | null>(null);
const contextSession = computed(() =>
  contextMenu.value
    ? sessionStore.sessions.find((session) => session.id === contextMenu.value?.sessionId)
    : undefined,
);
const projectSettingsId = ref<string | null>(null);
const projectGit = ref<{ projectId: string; x: number; y: number } | null>(null);
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
      s.meta.name.toLowerCase().includes(q) ||
      s.lastMessagePreview.toLowerCase().includes(q) ||
      s.meta.description?.toLowerCase().includes(q),
  );
}

const uiSessions = computed(() => sessionStore.sessions.map(toUISession));
const searchResults = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  return uiSessions.value
    .filter((session) => session.showInSessionList)
    .map((session) => {
      const titleMatch = session.meta.name.toLowerCase().includes(q);
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
    .sort(
      (left, right) =>
        new Date(right.session.lastActiveAt).getTime() -
        new Date(left.session.lastActiveAt).getTime(),
    );
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
    .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());
});

function isPinnedRoot(session: UISession): boolean {
  return !!session.pinned || session.meta.builtin === true;
}

const pinnedRoots = computed(() => rootsToShow.value.filter(isPinnedRoot));
const regularRoots = computed(() => rootsToShow.value.filter((s) => !isPinnedRoot(s)));

const workspaceGroups = computed(() => {
  const groups = groupSessionsByWorkspace(regularRoots.value, sessionStore.projects);
  return groups.map((g) => ({
    ...g,
    sessions: g.sessions.sort(
      (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
    ),
  }));
});

function childrenOf(parentId: string): UISession[] {
  return listVisible.value
    .filter((s) => s.parentId === parentId)
    .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());
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

function closeProjectSettings() {
  if (projectBusy.value) return;
  projectSettingsId.value = null;
}

function openProjectGit(projectId: string, event: MouseEvent) {
  closeProjectSettings();
  const target = event.currentTarget as HTMLElement | null;
  const rect = target?.getBoundingClientRect();
  const width = 180;
  const left = rect ? rect.right - width : event.clientX;
  projectGit.value = {
    projectId,
    x: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
    y: rect ? Math.min(rect.bottom + 4, window.innerHeight - 120) : event.clientY,
  };
}

function closeProjectGit() {
  if (projectBusy.value) return;
  projectGit.value = null;
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
    showUiMessage(
      detail || (action === "pull" ? "Git Pull 完成" : "Git Push 完成"),
      "success",
    );
    projectGit.value = null;
  } catch (error) {
    showUiMessage(formatProjectGitError(error, action), "error");
  } finally {
    projectBusy.value = false;
  }
}

function formatProjectGitError(error: unknown, action: "pull" | "push"): string {
  const fallback = action === "pull" ? "Git Pull 失败" : "Git Push 失败";
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

async function onExternalSessionPicked(candidate: ExternalSessionCandidate) {
  if (externalImporting.value) return;
  externalImporting.value = true;
  try {
    const session = await sessionStore.importExternalSession({
      backend: candidate.backend,
      externalSessionId: candidate.externalSessionId,
    });
    externalImportOpen.value = false;
    emit("select", session.id);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "引入外部对话失败");
  } finally {
    externalImporting.value = false;
  }
}

function openContextMenu(sessionId: string, pos: { x: number; y: number }) {
  const menuWidth = 120;
  const menuHeight = 80;
  const x = Math.min(pos.x, window.innerWidth - menuWidth - 8);
  const y = Math.min(pos.y, window.innerHeight - menuHeight - 8);
  contextMenu.value = { sessionId, x: Math.max(8, x), y: Math.max(8, y) };
}

function closeContextMenu() {
  contextMenu.value = null;
}

async function confirmDeleteSession() {
  const target = contextMenu.value;
  closeContextMenu();
  if (!target) return;
  if (!window.confirm("确定删除该会话？子会话也会一并删除。")) return;
  await sessionStore.deleteSession(target.sessionId);
  emit("delete", target.sessionId);
}

async function achieveSession() {
  const target = contextMenu.value;
  closeContextMenu();
  if (!target) return;
  const session = sessionStore.sessions.find((item) => item.id === target.sessionId);
  const prompt =
    session?.creationMethod === "spawn_agent"
      ? "完成该子代理会话？完成后会从会话列表隐藏，不会提交或合并代码。"
      : "完成并归档该会话？系统会提交剩余修改并合并到项目默认分支。";
  if (!window.confirm(prompt)) return;
  try {
    await sessionStore.completeSession(target.sessionId);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "归档失败");
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
      label: `${typeof source.meta.name === "string" ? source.meta.name : "会话"} · 继续`,
    });
    emit("select", forked.id);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Fork 失败");
  }
}

async function onAgentPicked(agentId: string) {
  const workspaceId = agentPickerWorkspaceId.value;
  closeAgentPicker();

  let cwd: string;
  let projectId: string | null = null;
  const existingProject = workspaceId
    ? sessionStore.projects.find((p) => p.id === workspaceId)
    : undefined;
  if (existingProject) {
    projectId = existingProject.id;
    cwd = existingProject.cwd;
  } else {
    const dir = window.prompt("工作目录路径（留空使用默认）:", getDefaultWorkspaceCwd());
    if (dir === null) return;
    cwd = dir.trim() || getDefaultWorkspaceCwd();
    const project = await sessionStore.createProject({ cwd });
    projectId = project.id;
  }
  rememberCwd(cwd);

  const agent = agentStore.getAgentById(agentId);
  const session = await sessionStore.createSession({
    projectId,
    agentId,
    cwd,
    meta: { name: agent?.name ?? agentId },
  });

  const next = new Set(collapsedWorkspaceIds.value);
  if (projectId) next.delete(projectId);
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
.chat-home-settings {
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 7px;
  color: var(--app-text-secondary);
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease,
    transform 0.1s ease;
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

.chat-home-settings:hover,
.chat-home-settings:focus-visible {
  color: #07a65a;
  background: var(--app-hover);
  outline: none;
}

.chat-home-settings:active {
  transform: scale(0.93);
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
