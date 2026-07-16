import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentStore, useProviderStore, useRootStore, useSessionStore } from "../index";

// Mock API module
vi.mock("@/api", () => ({
  listSessions: vi.fn(),
  getSession: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  updateSessionMeta: vi.fn(),
  getSessionMessages: vi.fn(),
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
  getAgentResources: vi.fn(),
  getAgentSystemMd: vi.fn(),
  setAgentSystemMd: vi.fn(),
  listProviders: vi.fn(),
  getProvider: vi.fn(),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
  listProviderModels: vi.fn(),
  createProviderModel: vi.fn(),
  updateProviderModel: vi.fn(),
  deleteProviderModel: vi.fn(),
  getGlobalResources: vi.fn(),
}));

import * as api from "@/api";

describe("Session Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
  });

  it("should fetch sessions", async () => {
    const mockSessions = [{ id: "1", status: "idle", cwd: "/test", meta: { name: "Test" } }];
    vi.mocked(api.listSessions).mockResolvedValue(mockSessions as any);

    const rootStore = useRootStore();
    const store = useSessionStore();
    await store.fetchSessions();

    expect(api.listSessions).toHaveBeenCalled();
    expect(store.sessions).toEqual(mockSessions);
    expect(rootStore.loading.sessions).toBe(false);
  });

  it("should handle fetch error", async () => {
    vi.mocked(api.listSessions).mockRejectedValue(new Error("Network error"));

    const rootStore = useRootStore();
    const store = useSessionStore();
    await expect(store.fetchSessions()).rejects.toThrow("Network error");

    expect(rootStore.error).toBe("Network error");
    expect(rootStore.loading.sessions).toBe(false);
  });

  it("should create session", async () => {
    const newSession = { id: "2", status: "idle", cwd: "/new", meta: {} };
    vi.mocked(api.createSession).mockResolvedValue(newSession as any);

    const store = useSessionStore();
    store.sessions = [];

    const result = await store.createSession({ cwd: "/new" });

    expect(api.createSession).toHaveBeenCalledWith({ cwd: "/new" });
    expect(store.sessions).toContainEqual(newSession);
    expect(result).toEqual(newSession);
  });

  it("should delete session", async () => {
    vi.mocked(api.deleteSession).mockResolvedValue({ ok: true });

    const store = useSessionStore();
    store.sessions = [{ id: "1", status: "idle", cwd: "/test" } as any];

    await store.deleteSession("1");

    expect(api.deleteSession).toHaveBeenCalledWith("1");
    expect(store.sessions).toHaveLength(0);
  });

  it("should update session meta", async () => {
    vi.mocked(api.updateSessionMeta).mockResolvedValue({ name: "Updated", pinned: true });

    const store = useSessionStore();
    store.sessions = [{ id: "1", status: "idle", cwd: "/test", meta: { name: "Test" } } as any];

    await store.updateSessionMeta("1", { pinned: true });

    expect(api.updateSessionMeta).toHaveBeenCalledWith("1", { pinned: true });
    expect(store.sessions[0].meta).toEqual({ name: "Updated", pinned: true });
  });
});

describe("Agent Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
  });

  it("should fetch agents", async () => {
    const mockAgents = [{ id: "agent-1", name: "Test Agent", providerId: "p1" }];
    vi.mocked(api.listAgents).mockResolvedValue(mockAgents as any);

    const store = useAgentStore();
    await store.fetchAgents();

    expect(api.listAgents).toHaveBeenCalled();
    expect(store.agents).toEqual(mockAgents);
  });

  it("should fetch agent resources", async () => {
    const mockResources = {
      agentId: "agent-1",
      homeDir: "/home/agent",
      systemMd: "Test",
      layers: { agent: { skills: [], prompts: [], extensions: [] } },
    };
    vi.mocked(api.getAgentResources).mockResolvedValue(mockResources as any);

    const store = useAgentStore();
    await store.fetchAgentResources("agent-1", "/cwd");

    expect(api.getAgentResources).toHaveBeenCalledWith("agent-1", "/cwd");
    expect(store.agentResources["agent-1"]).toEqual(mockResources);
  });

  it("should update agent system prompt", async () => {
    vi.mocked(api.setAgentSystemMd).mockResolvedValue({ content: "New prompt" });

    const store = useAgentStore();
    store.agentResources["agent-1"] = { systemMd: "Old" } as any;

    await store.updateAgentSystemMd("agent-1", "New prompt");

    expect(api.setAgentSystemMd).toHaveBeenCalledWith("agent-1", "New prompt");
    expect(store.agentResources["agent-1"].systemMd).toBe("New prompt");
  });
});

describe("Provider Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
  });

  it("should fetch providers", async () => {
    const mockProviders = [{ id: "p1", name: "Test", apiKey: null }];
    vi.mocked(api.listProviders).mockResolvedValue(mockProviders as any);

    const store = useProviderStore();
    await store.fetchProviders();

    expect(api.listProviders).toHaveBeenCalled();
    expect(store.providers[0].id).toBe("p1");
  });

  it("should create provider", async () => {
    const newProvider = { id: "p2", name: "New", apiKey: null };
    vi.mocked(api.createProvider).mockResolvedValue(newProvider as any);

    const store = useProviderStore();
    store.providers = [];

    await store.createProvider({ id: "p2", name: "New", apiType: "anthropic-messages" } as any);

    expect(api.createProvider).toHaveBeenCalled();
    expect(store.providers).toHaveLength(1);
  });

  it("should delete provider", async () => {
    vi.mocked(api.deleteProvider).mockResolvedValue({ ok: true });

    const store = useProviderStore();
    store.providers = [{ id: "p1", name: "Test" } as any];

    await store.deleteProvider("p1");

    expect(api.deleteProvider).toHaveBeenCalledWith("p1");
    expect(store.providers).toHaveLength(0);
  });

  it("should manage models", async () => {
    const mockModels = [{ modelId: "m1", name: "Model 1" }];
    vi.mocked(api.listProviderModels).mockResolvedValue(mockModels as any);

    const store = useProviderStore();
    store.currentProviderId = "p1"; // Set current provider
    await store.fetchModels("p1");

    expect(api.listProviderModels).toHaveBeenCalledWith("p1");
    expect(store.currentModels).toEqual(mockModels);
  });
});
