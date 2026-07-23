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

  // State
  const sessions = ref<Session[]>([]);
  const projects = ref<Project[]>([]);
  const currentSessionId = ref<string | null>(null);
  const messages = ref<Record<string, SessionTreeEntry[]>>({});

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
      projects.value = await api.listProjects();
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
      return project;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to create project");
      throw err;
    }
  }

  async function fetchSessions(params?: {
    status?: api.SessionStatus;
    parentId?: string | null;
    projectId?: string;
  }) {
    root.loading.sessions = true;
    root.clearError();
    try {
      sessions.value = await api.listSessions(params);
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch sessions");
      throw err;
    } finally {
      root.loading.sessions = false;
    }
  }

  async function fetchSession(id: string) {
    root.clearError();
    try {
      const session = await api.getSession(id);
      const index = sessions.value.findIndex((s) => s.id === id);
      if (index >= 0) {
        sessions.value[index] = session;
      } else {
        sessions.value.push(session);
      }
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
      return session;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to create session");
      throw err;
    }
  }

  async function importExternalSession(options: {
    backend: "codex" | "claude";
    externalSessionId: string;
  }) {
    root.clearError();
    try {
      const session = await api.importExternalSession(options);
      sessions.value.unshift(session);
      await fetchProjects();
      return session;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to import external session");
      throw err;
    }
  }

  async function deleteSession(id: string) {
    root.clearError();
    try {
      await api.deleteSession(id);
      const removedIds = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const session of sessions.value) {
          if (
            session.parentId &&
            removedIds.has(session.parentId) &&
            (session.branchType === "subagent" || session.branchType === "btw") &&
            !removedIds.has(session.id)
          ) {
            removedIds.add(session.id);
            changed = true;
          }
        }
      }
      sessions.value = sessions.value
        .filter((session) => !removedIds.has(session.id))
        .map((session) =>
          session.parentId && removedIds.has(session.parentId)
            ? { ...session, parentId: null }
            : session,
        );
      for (const removedId of removedIds) delete messages.value[removedId];
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to delete session");
      throw err;
    }
  }

  async function updateSessionMeta(id: string, meta: Record<string, unknown>) {
    root.clearError();
    try {
      const updated = await api.updateSessionMeta(id, meta);
      const session = getSessionById.value(id);
      if (session) {
        session.meta = updated;
      }
      return updated;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to update session meta");
      throw err;
    }
  }

  async function fetchSessionMessages(id: string) {
    root.loading.messages = true;
    root.clearError();
    try {
      const entries = await api.getSessionMessages(id);
      messages.value[id] = entries;
      return entries;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fetch messages");
      throw err;
    } finally {
      root.loading.messages = false;
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
      return session;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to fork session");
      throw err;
    }
  }

  async function cloneSession(id: string) {
    root.clearError();
    try {
      const session = await api.cloneSession(id);
      sessions.value.unshift(session);
      return session;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to clone session");
      throw err;
    }
  }

  async function createBtwSession(id: string) {
    root.clearError();
    try {
      const session = await api.createBtwSession(id);
      sessions.value.unshift(session);
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
      return session;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to complete session");
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
    fetchSession,
    createSession,
    importExternalSession,
    deleteSession,
    updateSessionMeta,
    fetchSessionMessages,
    sendPrompt,
    forkSession,
    cloneSession,
    createBtwSession,
    killSession,
    completeSession,
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

  // Getters
  const getAgentById = computed(() => (id: string) => {
    return agents.value.find((a) => a.id === id);
  });

  const currentAgent = computed(() => {
    return currentAgentId.value ? getAgentById.value(currentAgentId.value) : null;
  });

  const getAgentsByCategory = computed(() => {
    const categories: Record<string, string> = {
      frontend: "前端",
      backend: "后端",
      qa: "测试",
      general: "通用",
    };
    const order = ["frontend", "backend", "qa", "general"];
    return order
      .map((cat) => ({
        label: categories[cat] ?? cat,
        agents: agents.value.filter((a) => {
          const category = a.meta?.category as string | undefined;
          if (cat === "general") return !category || category === "general";
          return category === cat;
        }),
      }))
      .filter((g) => g.agents.length > 0);
  });

  // Actions
  async function fetchAgents() {
    root.loading.agents = true;
    root.clearError();
    try {
      agents.value = await api.listAgents();
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
      return agents.value;
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to detect external agents");
      throw err;
    } finally {
      root.loading.agents = false;
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
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to delete agent");
      throw err;
    }
  }

  async function fetchAgentResources(id: string, cwd?: string) {
    root.loading.resources = true;
    root.clearError();
    try {
      const resources = await api.getAgentResources(id, cwd);
      agentResources.value[id] = resources;
      return resources;
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

  function setCurrentAgent(id: string | null) {
    currentAgentId.value = id;
  }

  return {
    agents,
    currentAgentId,
    currentAgent,
    agentResources,
    getAgentById,
    getAgentsByCategory,
    fetchAgents,
    detectExternalAgents,
    fetchAgent,
    createAgent,
    updateAgent,
    deleteAgent,
    fetchAgentResources,
    fetchAgentSystemMd,
    updateAgentSystemMd,
    bindAgentResource,
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
    root.loading.providers = true;
    root.clearError();
    try {
      const list = await api.listProviders();
      providers.value = list;
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
    } catch (err) {
      root.setError(err instanceof Error ? err.message : "Failed to delete provider");
      throw err;
    }
  }

  async function fetchModels(providerId: string) {
    root.clearError();
    try {
      const list = await api.listProviderModels(providerId);
      models.value[providerId] = list;
      return list;
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
    root.loading.resources = true;
    root.clearError();
    try {
      const resources = await api.getGlobalResources();
      globalResources.value = resources;
      resourceItems.value = layerFromApi(resources);
      return resources;
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
