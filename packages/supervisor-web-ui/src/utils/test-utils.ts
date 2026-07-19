/**
 * Test Utilities for Supervisor Web UI
 *
 * Provides helpers for testing components and stores
 */

import { vi } from "vitest";
import type { Mock } from "vitest";
import type { Agent, Provider, ResourceLayer, Session } from "@/api";

// ============ Mock Data Factories ============

export function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: `session-${Date.now()}`,
    projectId: null,
    parentId: null,
    sessionId: null,
    pid: null,
    status: "idle",
    cwd: "/test",
    leafId: null,
    agentId: null,
    branchType: null,
    showInSessionList: true,
    contextLeafId: null,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    meta: { name: "Test Session" },
    currentTask: null,
    lastMessagePreview: "",
    ...overrides,
  };
}

export function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: `agent-${Date.now()}`,
    name: "Test Agent",
    description: null,
    icon: null,
    providerId: "test-provider",
    backendType: "native",
    modelId: null,
    toolsPreset: "coding",
    homeDir: null,
    meta: { category: "general" },
    available: true,
    executablePath: null,
    unavailableReason: null,
    detectedVersion: null,
    compatibility: "compatible",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: `provider-${Date.now()}`,
    slug: null,
    name: "Test Provider",
    icon: null,
    apiType: "anthropic-messages",
    baseUrl: null,
    apiKey: null,
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockResourceLayer(overrides: Partial<ResourceLayer> = {}): ResourceLayer {
  return {
    skills: [],
    prompts: [],
    extensions: [],
    mcp: [],
    ...overrides,
  };
}

// ============ API Mock Helpers ============

export function createApiMock(): Record<string, Mock> {
  return {
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
    healthCheck: vi.fn(),
  };
}

// ============ Component Test Helpers ============

import { type ComponentMountingOptions, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";

export function setupPinia() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return pinia;
}

export async function mountWithPinia(
  component: any,
  options: ComponentMountingOptions<any> = {},
): Promise<{ wrapper: ReturnType<typeof mount>; pinia: ReturnType<typeof createPinia> }> {
  const pinia = setupPinia();

  const wrapper = mount(component, {
    global: {
      plugins: [pinia],
    },
    ...options,
  });

  await nextTick();

  return { wrapper, pinia };
}

// ============ Async Test Helpers ============

export async function waitForMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => T | Promise<T>,
  { attempts = 3, delay = 100 }: { attempts?: number; delay?: number } = {},
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (attempts <= 1) throw error;
    await waitForMs(delay);
    return retry(fn, { attempts: attempts - 1, delay });
  }
}

// ============ Mock Server Helper ============

/**
 * Creates a mock fetch implementation for testing
 */
export function createMockFetch(handlers: Record<string, () => Promise<Response>>) {
  return async (url: string, _options?: RequestInit): Promise<Response> => {
    const handler = handlers[url];
    if (handler) {
      return handler();
    }
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  };
}
