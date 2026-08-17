/**
 * Supervisor Web UI - Store
 *
 * 基于 mock/store.ts 结构，使用真实 API
 * 从 example/src/mock/store.ts 复制并修改
 */

import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
import type {
  Agent,
  ExtensionResourceInfo,
  McpResourceInfo,
  Model,
  Project,
  PromptTemplateInfo,
  Provider,
  ResourceKind,
  ResourceLayer,
  Session,
  SessionTreeEntry,
  SkillInfo,
} from "@/api";
import * as api from "@/api";
import type { UIResourceItem } from "@/types/ui";
import { layerFromApi } from "@/utils/resources-ui";
import {
  saveViewPreferences,
  setSessionViewFlag,
  sortByProjectPreference,
  viewPreferences,
} from "@/utils/view-preferences";
import { createMessageStorage } from "@/utils/message-storage";
import { loadClientResource, invalidateClientResource } from "@/utils/client-data";
import { cacheKey, writeClientCache } from "@/utils/client-cache";
import { translate as t } from "@/i18n";
import {
  loadSessionListCache,
  projectFromListCache,
  saveSessionListCache,
  sessionFromListCache,
} from "@/utils/session-list-cache";

// ============ Types ============

export interface Workspace {
  id: string;
  name: string;
}

// 资源项联合类型
export type ResourceItem =
  | { kind: "skills"; info: SkillInfo }
  | { kind: "prompts"; info: PromptTemplateInfo }
  | { kind: "extensions"; info: ExtensionResourceInfo }
  | { kind: "mcp"; info: McpResourceInfo };

// ============ Root Store ============

export const useRootStore = defineStore("root", () => {
  // Loading states
  const loading = reactive({
    sessions: false,
    agents: false,
    providers: false,
    resources: false,
    messages: false,
  });

  const error = ref<string | null>(null);

  function setError(err: string | null) {
    error.value = err;
  }

  function clearError() {
    error.value = null;
  }

  return {
    loading,
    error,
    setError,
    clearError,
  };
});

// ============ Session Store ============

export const useSessionStore = defineStore("session", () => {
  const root = useRootStore();

  // Hydrate list paint fields from local cache so the sidebar is instant (no meta).
  const listCache = loadSessionListCache();

  // State
  const sessions = ref<Session[]>(listCache?.sessions.map(sessionFromListCache) ?? []);
  const projects = ref<Project[]>(listCache?.projects.map(projectFromListCache) ?? []);
  const currentSessionId = ref<string | null>(null);
  const messages = ref<Record<string, SessionTreeEntry[]>>({});
  const messageCursors = ref<Record<string, { oldestRowId: number | null; newestRowId: number | null; hasMore: boolean }>>({});
  /** Session list fetch error only — not shared with import / agent detect / chat ops. */
  const sessionsListError = ref<string | null>(null);

  function persistSessionListCache() {
    saveSessionListCache(sessions.value, projects.value);
  }

  // Getters
  const getSessionById = computed(() => (id: string) => {
    return sessions.value.find((s) => s.id === id);
  });

  const getSessionsByAgentId = computed(() => (agentId: string) => {
    return sessions.value.filter((s) => s.agentId === agentId && s.showInSessionList);
  });

  const currentSession = computed(() => {
    return currentSessionId.value ? getSessionById.value(currentSessionId.value) : null;
  });

  const currentMessages = computed(() => {
    return currentSessionId.value ? (messages.value[currentSessionId.value] ?? []) : [];
  });

  // Actions
  async function fetchProjects() {
    root.clearError();
    try {
      await loadClientResource<Project[]>({
        key: "projects",
        read: api.listProjects,
        apply: (value) => {
          projects.value = sortByProjectPreference(value);
          persistSessionListCache();
        },
        loading: (value) => { root.loading.sessions = value; },
      });
      persistSessionListCache();
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch projects");
      throw err;
    }
  }

  async function createProject(options: api.CreateProjectRequest) {
    root.clearError();
    try {
      const project = await api.createProject(options);
      const index = projects.value.findIndex((p) => p.id === project.id);
      if (index >= 0) projects.value[index] = project;
      else projects.value.unshift(project);
      invalidateClientResource("projects");
      persistSessionListCache();
      return project;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to create project");
      throw err;
    }
  }

  async function updateProject(id: string, options: api.UpdateProjectRequest) {
    root.clearError();
    try {
      const project = await api.updateProject(id, options);
      const index = projects.value.findIndex((p) => p.id === id);
      if (index >= 0) projects.value[index] = project;
      else projects.value.unshift(project);
      invalidateClientResource("projects");
      persistSessionListCache();
      return project;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to update project");
      throw err;
    }
  }

  async function fetchSessions(params?: {
    status?: api.SessionStatus;
    parentId?: string | null;
    projectId?: string;
    /** Refresh without list loading UI (e.g. tab visibility regain). */
    silent?: boolean;
  }) {
    const { silent, ...query } = params ?? {};
    const hasQuery = Object.keys(query).length > 0;
    // Cached list already painted → refresh quietly (no "加载会话..." flash).
    const quiet = !!silent || (!hasQuery && sessions.value.length > 0);
    if (!quiet) {
      root.loading.sessions = true;
      sessionsListError.value = null;
    }
    try {
      await loadClientResource<Session[]>({
        key: "sessions",
        queryKey: hasQuery ? JSON.stringify(query) : undefined,
        read: () => api.listSessions(hasQuery ? query : undefined),
        apply: (value) => {
          sessions.value = value;
          if (!hasQuery) persistSessionListCache();
        },
        loading: (value) => { if (!quiet) root.loading.sessions = value; },
      });
      sessionsListError.value = null;
      // Full list only: prune local message caches + persist slim list cache.
      if (!hasQuery) {
        persistSessionListCache();
        void createMessageStorage()
          .then((storage) => storage.pruneDeletedSessions(sessions.value.map((s) => s.id)))
          .catch((error) => {
            console.warn("[MessageStorage] pruneDeletedSessions failed", error);
          });
      }
    } catch (err) {
      // A quiet refresh must not flash loading UI, but its failure still needs
      // to be observable so callers and the sidebar can explain stale data.
      sessionsListError.value = err instanceof Error ? err.message : "Failed to fetch sessions";
      throw err;
    } finally {
      if (!quiet) {
        root.loading.sessions = false;
      }
    }
  }

  async function fetchSession(id: string) {
    root.clearError();
    try {
      const session = await loadClientResource<Session>({
        key: "session",
        queryKey: id,
        read: () => api.getSession(id),
        apply: (value) => {
          const index = sessions.value.findIndex((s) => s.id === id);
          if (index >= 0) sessions.value[index] = value;
          else sessions.value.push(value);
        },
      });
      return session;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch session");
      throw err;
    }
  }

  async function createSession(options: api.CreateSessionRequest) {
    root.clearError();
    try {
      const session = await api.createSession(options);
      sessions.value.unshift(session);
      invalidateClientResource("sessions");
      persistSessionListCache();
      return session;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to create session");
      throw err;
    }
  }

  async function importExternalSession(options: {
    backend: "codex" | "claude";
    externalSessionId: string;
    replace?: boolean;
  }) {
    root.clearError();
    try {
      const session = await api.importExternalSession(options);
      await Promise.all([fetchSessions(), fetchProjects()]);
      return getSessionById.value(session.id) ?? session;
    } catch (err) {
      await fetchSessions({ silent: true }).catch(() => undefined);
      throw err;
    }
  }

  async function deleteSession(id: string) {
    root.clearError();
    const previousSessions = sessions.value;
    const removedIds = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const session of sessions.value) {
        if (
          session.parentId &&
          removedIds.has(session.parentId) &&
          (session.spawnType === "subagent" || session.spawnType === "btw") &&
          !removedIds.has(session.id)
        ) {
          removedIds.add(session.id);
          changed = true;
        }
      }
    }
    const previousMessages = new Map(
      [...removedIds]
        .filter((removedId) => removedId in messages.value)
        .map((removedId) => [removedId, messages.value[removedId]]),
    );
    const previousCursors = new Map(
      [...removedIds]
        .filter((removedId) => removedId in messageCursors.value)
        .map((removedId) => [removedId, messageCursors.value[removedId]]),
    );
    sessions.value = sessions.value
      .filter((session) => !removedIds.has(session.id))
      .map((session) =>
        session.parentId && removedIds.has(session.parentId)
          ? { ...session, parentId: null }
          : session,
      );
    for (const removedId of removedIds) {
      delete messages.value[removedId];
      delete messageCursors.value[removedId];
    }
    persistSessionListCache();

    try {
      await api.deleteSession(id);
      invalidateClientResource("sessions");
      invalidateClientResource("session", id);
      invalidateClientResource("messages", id);
      void createMessageStorage()
        .then(async (storage) => {
          for (const removedId of removedIds) {
            await storage.deleteSession(removedId);
          }
        })
        .catch((error) => {
          console.warn("[MessageStorage] deleteSession cache cleanup failed", error);
        });
    } catch (err) {
      const currentById = new Map(sessions.value.map((session) => [session.id, session]));
      const previousIds = new Set(previousSessions.map((session) => session.id));
      sessions.value = [
        ...previousSessions.map((session) => currentById.get(session.id) ?? session),
        ...sessions.value.filter((session) => !previousIds.has(session.id)),
      ];
      for (const [removedId, value] of previousMessages) messages.value[removedId] = value;
      for (const [removedId, value] of previousCursors) messageCursors.value[removedId] = value;
      persistSessionListCache();
      root.setError(err instanceof Error ? err.message : "Failed to delete session");
      throw err;
    }
  }

  async function updateSessionMeta(id: string, meta: Record<string, unknown>) {
    if (typeof meta.pinned === "boolean") setSessionViewFlag("pinnedSessionIds", id, meta.pinned);
    if (typeof meta.muted === "boolean") setSessionViewFlag("mutedSessionIds", id, meta.muted);
    const serverMeta = Object.fromEntries(
      Object.entries(meta).filter(([key]) => !["pinned", "muted", "unread"].includes(key)),
    );
    if (Object.keys(serverMeta).length === 0) return getSessionById.value(id);
    root.clearError();
    try {
      const updated = await api.updateSessionMeta(id, serverMeta);
      const session = getSessionById.value(id);
      if (session) Object.assign(session, updated);
      invalidateClientResource("sessions");
      invalidateClientResource("session", id);
      return updated;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to update session meta");
      throw err;
    }
  }

  async function markSessionRead(id: string) {
    delete viewPreferences.unreadBySession[id];
    saveViewPreferences();
    return getSessionById.value(id);
  }

  async function fetchSessionMessages(id: string) {
    root.clearError();
    try {
      const page = await loadClientResource<api.SessionMessagesPage>({
        key: "messages",
        queryKey: id,
        read: () => api.getSessionMessagesPage(id, { limit: 80, view: "lite" }),
        apply: (value) => {
          const previous = messages.value[id] ?? [];
          const seen = new Set(previous.map((entry) => entry.id));
          messages.value[id] = previous.length
            ? [...previous, ...value.messages.filter((entry) => !seen.has(entry.id))]
            : value.messages;
          const previousCursor = messageCursors.value[id];
          messageCursors.value[id] = {
            oldestRowId:
              previousCursor?.oldestRowId == null
                ? value.oldestRowId
                : value.oldestRowId == null
                  ? previousCursor.oldestRowId
                  : Math.min(previousCursor.oldestRowId, value.oldestRowId),
            newestRowId: value.newestRowId ?? previousCursor?.newestRowId ?? null,
            hasMore: previousCursor ? previousCursor.hasMore && value.hasMore : value.hasMore,
          };
        },
        loading: (value) => { root.loading.messages = value; },
      });
      return page.messages;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch messages");
      throw err;
    }
  }

  async function fetchOlderSessionMessages(id: string) {
    root.clearError();
    const cursor = messageCursors.value[id];
    if (!cursor?.hasMore || cursor.oldestRowId == null) {
      return { messages: [] as api.SessionTreeEntry[], hasMore: false };
    }
    try {
      const page = await api.getSessionMessagesPage(id, {
        limit: 80,
        beforeId: cursor.oldestRowId,
        view: "lite",
      });
      const existing = messages.value[id] ?? [];
      const seen = new Set(existing.map((entry) => entry.id));
      const older = page.messages.filter((entry) => !seen.has(entry.id));
      messages.value[id] = [...older, ...existing];
      messageCursors.value[id] = {
        oldestRowId: page.oldestRowId,
        newestRowId: page.newestRowId,
        hasMore: page.hasMore,
      };
      void writeClientCache(cacheKey("messages", id), {
        messages: messages.value[id] ?? [],
        oldestRowId: page.oldestRowId,
        newestRowId: page.newestRowId,
        hasMore: page.hasMore,
      });
      return page;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch older messages");
      throw err;
    }
  }

  async function sendPrompt(id: string, message: string) {
    root.clearError();
    return api.promptSession(
      id,
      message,
      (event) => {
        // Handle streaming events
        console.log("Agent event:", event);
      },
      (err) => {
        root.setError(err.message);
      },
      () => {
        // Complete - refresh messages
        void fetchSessionMessages(id);
      },
    );
  }

  async function forkSession(id: string, options?: api.ForkSessionRequest) {
    root.clearError();
    try {
      const session = await api.forkSession(id, options);
      sessions.value.unshift(session);
      persistSessionListCache();
      return session;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fork session");
      throw err;
    }
  }

  async function createBtwSession(id: string) {
    root.clearError();
    try {
      const session = await api.createBtwSession(id);
      sessions.value.unshift(session);
      persistSessionListCache();
      return session;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to create BTW session");
      throw err;
    }
  }

  async function killSession(id: string) {
    root.clearError();
    try {
      await api.killSession(id);
      await fetchSession(id);
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to kill session");
      throw err;
    }
  }

  async function completeSession(id: string) {
    root.clearError();
    try {
      const session = await api.completeSession(id);
      const index = sessions.value.findIndex((s) => s.id === id);
      if (index >= 0) {
        sessions.value[index] = session;
      }
      persistSessionListCache();
      return session;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to complete session");
      throw err;
    }
  }

  async function syncSession(id: string) {
    root.clearError();
    try {
      const session = await api.syncSession(id);
      const index = sessions.value.findIndex((item) => item.id === id);
      if (index >= 0) sessions.value[index] = session;
      return session;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to sync session");
      throw err;
    }
  }

  async function createCheckpoint(id: string, label?: string) {
    root.clearError();
    return api.createCheckpoint(id, label ? { label } : undefined);
  }

  async function rewindSession(id: string, checkpointId: string) {
    root.clearError();
    try {
      const session = await api.rewindSession(id, checkpointId);
      const index = sessions.value.findIndex((s) => s.id === id);
      if (index >= 0) {
        sessions.value[index] = session;
      }
      await fetchSessionMessages(id);
      return session;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to rewind session");
      throw err;
    }
  }

  async function commitSession(id: string, message?: string) {
    root.clearError();
    return api.commitSession(id, message ? { message } : undefined);
  }

  async function listCheckpoints(id: string) {
    return api.listCheckpoints(id);
  }

  function setCurrentSession(id: string | null) {
    currentSessionId.value = id;
    if (id) {
      void fetchSessionMessages(id);
    }
  }

  // Group sessions by workspace (using cwd as workspace identifier)
  const groupedSessions = computed(() => {
    const groups: Record<string, Session[]> = {};
    sessions.value.forEach((s) => {
      // Use cwd or parent directory as workspace identifier
      const workspaceId = s.cwd || "unknown";
      if (!groups[workspaceId]) groups[workspaceId] = [];
      groups[workspaceId].push(s);
    });
    return groups;
  });

  return {
    sessions,
    projects,
    sessionsListError,
    currentSessionId,
    currentSession,
    currentMessages,
    messages,
    getSessionById,
    getSessionsByAgentId,
    groupedSessions,
    fetchProjects,
    fetchSessions,
    createProject,
    updateProject,
    fetchSession,
    createSession,
    importExternalSession,
    deleteSession,
    updateSessionMeta,
    markSessionRead,
    fetchSessionMessages,
    fetchOlderSessionMessages,
    messageCursors,
    sendPrompt,
    forkSession,
    createBtwSession,
    killSession,
    completeSession,
    syncSession,
    createCheckpoint,
    rewindSession,
    commitSession,
    listCheckpoints,
    setCurrentSession,
  };
});

// ============ Agent Store ============

export const useAgentStore = defineStore("agent", () => {
  const root = useRootStore();

  // State
  const agents = ref<Agent[]>([]);
  const currentAgentId = ref<string | null>(null);
  const agentResources = ref<Record<string, api.AgentResources>>({});
  const uiMenus = ref<Record<string, api.UiMenuItem[]>>({});

  function applyAgentUiMenus(agentId: string, menus: api.UiMenuItem[]) {
    uiMenus.value = { ...uiMenus.value, [agentId]: menus };
  }

  function applyAllAgentUiMenus(entries: Array<{ agentId: string; menus: api.UiMenuItem[] }>) {
    const next: Record<string, api.UiMenuItem[]> = {};
    for (const entry of entries) next[entry.agentId] = entry.menus;
    uiMenus.value = next;
  }

  function ingestAgentUiMenus(agent: Agent) {
    if (agent.uiMenus) applyAgentUiMenus(agent.id, agent.uiMenus);
  }

  function hasUiMenu(agentId: string | null | undefined, menuId: string): boolean {
    if (!agentId) return false;
    return (uiMenus.value[agentId] ?? []).some((menu) => menu.id === menuId);
  }

  // Getters
  const getAgentById = computed(() => (id: string) => {
    return agents.value.find((a) => a.id === id);
  });

  const currentAgent = computed(() => {
    return currentAgentId.value ? getAgentById.value(currentAgentId.value) : null;
  });

  const getAgentsByCategory = computed(() => {
    const groups: Array<{ label: string; agents: typeof agents.value }> = [
      {
        label: t("agent.category.builtin"),
        agents: agents.value.filter(
          (a) =>
            a.isBuiltin &&
            a.backendType === "native" &&
            (a.name === "Pi 助手" || a.name === "Coding"),
        ),
      },
      {
        label: t("agent.category.external"),
        agents: agents.value.filter((a) => a.backendType !== "native"),
      },
      {
        label: t("agent.category.custom"),
        agents: agents.value.filter((a) => !a.isBuiltin && a.backendType === "native"),
      },
    ];
    return groups.filter((g) => g.agents.length > 0);
  });

  // Actions
  async function fetchAgents() {
    root.clearError();
    try {
      await loadClientResource<Agent[]>({
        key: "agents",
        read: api.listAgents,
        apply: (value) => {
          agents.value = value;
          for (const agent of value) ingestAgentUiMenus(agent);
        },
        loading: (value) => { root.loading.agents = value; },
      });
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch agents");
      throw err;
    } finally {
      root.loading.agents = false;
    }
  }

  async function detectExternalAgents() {
    root.loading.agents = true;
    root.clearError();
    try {
      agents.value = await api.detectExternalAgents();
      for (const agent of agents.value) ingestAgentUiMenus(agent);
      invalidateClientResource("agents");
      return agents.value;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to detect external agents");
      throw err;
    } finally {
      root.loading.agents = false;
    }
  }

  async function installExternalAgent(id: string) {
    root.clearError();
    try {
      const agent = await api.installExternalAgent(id);
      const index = agents.value.findIndex((a) => a.id === id);
      if (index >= 0) {
        agents.value[index] = agent;
      } else {
        agents.value.push(agent);
      }
      ingestAgentUiMenus(agent);
      return agent;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to install external agent");
      throw err;
    }
  }

  async function repairExternalAgent(id: string) {
    root.clearError();
    try {
      const result = await api.repairExternalAgent(id);
      const index = agents.value.findIndex((a) => a.id === id);
      if (index >= 0) {
        agents.value[index] = result.agent;
      } else {
        agents.value.push(result.agent);
      }
      ingestAgentUiMenus(result.agent);
      return result;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to repair external agent");
      throw err;
    }
  }

  async function fetchAgent(id: string) {
    root.clearError();
    try {
      const agent = await api.getAgent(id);
      const index = agents.value.findIndex((a) => a.id === id);
      if (index >= 0) {
        agents.value[index] = agent;
      } else {
        agents.value.push(agent);
      }
      ingestAgentUiMenus(agent);
      return agent;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch agent");
      throw err;
    }
  }

  async function createAgent(options: api.CreateAgentRequest) {
    root.clearError();
    try {
      const agent = await api.createAgent(options);
      agents.value.push(agent);
      ingestAgentUiMenus(agent);
      invalidateClientResource("agents");
      return agent;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to create agent");
      throw err;
    }
  }

  async function updateAgent(id: string, patch: api.UpdateAgentRequest) {
    root.clearError();
    try {
      const agent = await api.updateAgent(id, patch);
      const index = agents.value.findIndex((a) => a.id === id);
      if (index >= 0) {
        agents.value[index] = agent;
      }
      ingestAgentUiMenus(agent);
      invalidateClientResource("agents");
      return agent;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to update agent");
      throw err;
    }
  }

  async function deleteAgent(id: string) {
    root.clearError();
    try {
      await api.deleteAgent(id);
      agents.value = agents.value.filter((a) => a.id !== id);
      delete agentResources.value[id];
      const nextMenus = { ...uiMenus.value };
      delete nextMenus[id];
      uiMenus.value = nextMenus;
      invalidateClientResource("agents");
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to delete agent");
      throw err;
    }
  }

  async function fetchAgentResources(id: string, cwd?: string) {
    root.clearError();
    try {
      return await loadClientResource<api.AgentResources>({
        key: "agent-resources",
        queryKey: `${id}:${cwd ?? ""}`,
        read: () => api.getAgentResources(id, cwd),
        apply: (value) => { agentResources.value[id] = value; },
        loading: (value) => { root.loading.resources = value; },
      });
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch agent resources");
      throw err;
    } finally {
      root.loading.resources = false;
    }
  }

  async function fetchAgentSystemMd(id: string) {
    root.clearError();
    try {
      const { content } = await api.getAgentSystemMd(id);
      return content;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch system prompt");
      throw err;
    }
  }

  async function updateAgentSystemMd(id: string, content: string) {
    root.clearError();
    try {
      const result = await api.setAgentSystemMd(id, content);
      // Update local agent resources if exists
      if (agentResources.value[id]) {
        agentResources.value[id].systemMd = content;
      }
      return result;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to update system prompt");
      throw err;
    }
  }

  async function bindAgentResource(id: string, kind: api.CatalogResourceKind, sourcePath: string) {
    root.clearError();
    try {
      return await api.bindAgentResourceBySourcePath(id, kind, sourcePath);
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to bind resource");
      throw err;
    }
  }

  async function unbindAgentResource(id: string, resourceId: number) {
    root.clearError();
    try {
      return await api.unbindCatalogResourceFromAgent(id, resourceId);
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to unbind resource");
      throw err;
    }
  }

  async function fetchAgentExtensions(id: string) {
    root.clearError();
    try {
      return await api.listAgentExtensions(id);
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch extensions");
      throw err;
    }
  }

  async function setAgentExtensionEnabled(id: string, resourceId: number, enabled: boolean) {
    root.clearError();
    try {
      return await api.setAgentExtensionEnabled(id, resourceId, enabled);
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to update extension");
      throw err;
    }
  }

  function setCurrentAgent(id: string | null) {
    currentAgentId.value = id;
  }

  return {
    agents,
    currentAgentId,
    currentAgent,
    agentResources,
    uiMenus,
    hasUiMenu,
    applyAgentUiMenus,
    applyAllAgentUiMenus,
    getAgentById,
    getAgentsByCategory,
    fetchAgents,
    detectExternalAgents,
    installExternalAgent,
    repairExternalAgent,
    fetchAgent,
    createAgent,
    updateAgent,
    deleteAgent,
    fetchAgentResources,
    fetchAgentSystemMd,
    updateAgentSystemMd,
    bindAgentResource,
    unbindAgentResource,
    fetchAgentExtensions,
    setAgentExtensionEnabled,
    setCurrentAgent,
  };
});

// ============ Provider Store ============

export const useProviderStore = defineStore("provider", () => {
  const root = useRootStore();

  // State
  const providers = ref<Provider[]>([]);
  const currentProviderId = ref<string | null>(null);
  const models = ref<Record<string, Model[]>>({});

  // Getters
  const getProviderById = computed(() => (id: string) => {
    return providers.value.find((p) => p.id === id);
  });

  const currentProvider = computed(() => {
    return currentProviderId.value ? getProviderById.value(currentProviderId.value) : null;
  });

  const currentModels = computed(() => {
    return currentProviderId.value ? (models.value[currentProviderId.value] ?? []) : [];
  });

  // Actions
  async function fetchProviders() {
    root.clearError();
    try {
      await loadClientResource<Provider[]>({
        key: "providers",
        read: api.listProviders,
        apply: (value) => { providers.value = value; },
        loading: (value) => { root.loading.providers = value; },
      });
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch providers");
      throw err;
    } finally {
      root.loading.providers = false;
    }
  }

  async function fetchProvider(id: string) {
    root.clearError();
    try {
      const provider = await api.getProvider(id);
      const index = providers.value.findIndex((p) => p.id === id);
      if (index >= 0) {
        providers.value[index] = provider;
      } else {
        providers.value.push(provider);
      }
      invalidateClientResource("providers");
      return provider;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch provider");
      throw err;
    }
  }

  async function createProvider(options: api.CreateProviderRequest) {
    root.clearError();
    try {
      const provider = await api.createProvider(options);
      providers.value.push(provider);
      invalidateClientResource("providers");
      return provider;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to create provider");
      throw err;
    }
  }

  async function updateProvider(id: string, patch: api.UpdateProviderRequest) {
    root.clearError();
    try {
      const provider = await api.updateProvider(id, patch);
      const index = providers.value.findIndex((p) => p.id === id);
      if (index >= 0) {
        providers.value[index] = provider;
      }
      invalidateClientResource("providers");
      return provider;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to update provider");
      throw err;
    }
  }

  async function deleteProvider(id: string) {
    root.clearError();
    try {
      await api.deleteProvider(id);
      providers.value = providers.value.filter((p) => p.id !== id);
      delete models.value[id];
      invalidateClientResource("providers");
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to delete provider");
      throw err;
    }
  }

  async function fetchModels(providerId: string) {
    root.clearError();
    try {
      return await loadClientResource<Model[]>({
        key: "providers:models",
        queryKey: providerId,
        read: () => api.listProviderModels(providerId),
        apply: (value) => { models.value[providerId] = value; },
      });
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch models");
      throw err;
    }
  }

  async function createModel(providerId: string, options: api.CreateModelRequest) {
    root.clearError();
    try {
      const model = await api.createProviderModel(providerId, options);
      if (!models.value[providerId]) models.value[providerId] = [];
      models.value[providerId].push(model);
      return model;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to create model");
      throw err;
    }
  }

  async function updateModel(providerId: string, modelId: string, patch: api.UpdateModelRequest) {
    root.clearError();
    try {
      const model = await api.updateProviderModel(providerId, modelId, patch);
      const list = models.value[providerId] ?? [];
      const index = list.findIndex((m) => m.modelId === modelId);
      if (index >= 0) {
        list[index] = model;
      }
      return model;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to update model");
      throw err;
    }
  }

  async function deleteModel(providerId: string, modelId: string) {
    root.clearError();
    try {
      await api.deleteProviderModel(providerId, modelId);
      const list = models.value[providerId];
      if (list) {
        models.value[providerId] = list.filter((m) => m.modelId !== modelId);
      }
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to delete model");
      throw err;
    }
  }

  function setCurrentProvider(id: string | null) {
    currentProviderId.value = id;
    if (id) {
      void fetchModels(id);
    }
  }

  return {
    providers,
    models,
    currentProviderId,
    currentProvider,
    currentModels,
    getProviderById,
    fetchProviders,
    fetchProvider,
    createProvider,
    updateProvider,
    deleteProvider,
    fetchModels,
    createModel,
    updateModel,
    deleteModel,
    setCurrentProvider,
  };
});

// ============ Resource Store ============

export const useResourceStore = defineStore("resource", () => {
  const root = useRootStore();

  // State
  const globalResources = ref<ResourceLayer | null>(null);
  const currentCwd = ref<string>("");
  const resourceItems = ref<UIResourceItem[]>([]);

  // Getters
  const allResources = computed(() => {
    if (!globalResources.value) return [];
    return [
      ...globalResources.value.skills.map((s) => ({ kind: "skills" as const, info: s })),
      ...globalResources.value.prompts.map((p) => ({ kind: "prompts" as const, info: p })),
      ...globalResources.value.extensions.map((e) => ({ kind: "extensions" as const, info: e })),
      ...globalResources.value.mcp.map((m) => ({ kind: "mcp" as const, info: m })),
    ];
  });

  const getResourcesByKind = computed(() => (kind: ResourceKind) => {
    if (!globalResources.value) return [];
    switch (kind) {
      case "skills":
        return globalResources.value.skills;
      case "prompts":
        return globalResources.value.prompts;
      case "extensions":
        return globalResources.value.extensions;
      case "mcp":
        return globalResources.value.mcp;
      default:
        return [];
    }
  });

  // Actions
  async function fetchGlobalResources() {
    root.clearError();
    try {
      return await loadClientResource<ResourceLayer>({
        key: "resources:global",
        read: api.getGlobalResources,
        apply: (value) => {
          globalResources.value = value;
          resourceItems.value = layerFromApi(value);
        },
        loading: (value) => { root.loading.resources = value; },
      });
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch resources");
      throw err;
    } finally {
      root.loading.resources = false;
    }
  }

  function setCwd(cwd: string) {
    currentCwd.value = cwd;
  }

  return {
    globalResources,
    currentCwd,
    allResources,
    resourceItems,
    getResourcesByKind,
    fetchGlobalResources,
    setCwd,
  };
});
