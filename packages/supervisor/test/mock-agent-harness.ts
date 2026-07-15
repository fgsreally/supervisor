import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockAgent {
    _listeners: Array<(event: AgentEvent) => void> = [];
    prompt = vi.fn(async (_message: string) => {});
    abort = vi.fn();
    waitForIdle = vi.fn(async () => {});
    state: {
      model: { provider: string; id: string };
      thinkingLevel: string;
      messages: unknown[];
    };

    constructor() {
      this.state = {
        model: { provider: "anthropic", id: "claude-sonnet-4-6" },
        thinkingLevel: "off",
        messages: [],
      };
    }

    subscribe(listener: (event: AgentEvent) => void): () => void {
      this._listeners.push(listener);
      return () => {
        this._listeners = this._listeners.filter((l) => l !== listener);
      };
    }

    emit(event: AgentEvent): void {
      for (const fn of this._listeners) fn(event);
    }
  }

  class MockAgentHarness {
    static instances: MockAgentHarness[] = [];
    _listeners: Array<(event: AgentEvent) => void> = [];
    agent: MockAgent;
    prompt = vi.fn(async (message: string) => {
      await this.agent.prompt(message);
    });
    steer = vi.fn();
    followUp = vi.fn();
    abort = vi.fn(async () => {
      this.agent.abort();
    });
    compact = vi.fn(async () => ({
      summary: "summary",
      firstKeptEntryId: "entry-1",
      tokensBefore: 123,
    }));
    setModel = vi.fn(async (model: { provider: string; id: string }) => {
      this.agent.state.model = model;
    });
    setThinkingLevel = vi.fn(async (level: string) => {
      this.agent.state.thinkingLevel = level;
    });
    setActiveTools = vi.fn(async () => {});
    setTools = vi.fn(async () => {});

    constructor(options: { model?: { provider: string; id: string } }) {
      this.agent = new MockAgent();
      if (options.model) this.agent.state.model = options.model;
      this.agent.subscribe((event) => {
        for (const listener of this._listeners) listener(event);
      });
      MockAgentHarness.instances.push(this);
    }

    subscribe(listener: (event: AgentEvent) => void): () => void {
      this._listeners.push(listener);
      return () => {
        this._listeners = this._listeners.filter((l) => l !== listener);
      };
    }

    on(_type: string, _handler: (...args: unknown[]) => unknown): () => void {
      return () => {};
    }

    waitForIdle = vi.fn(async () => {});
  }

  return { MockAgent, MockAgentHarness };
});

vi.mock("@earendil-works/pi-agent-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-agent-core")>();
  return {
    ...actual,
    AgentHarness: mocks.MockAgentHarness,
    NodeExecutionEnv: class MockNodeExecutionEnv {
      cwd: string;
      constructor(opts: { cwd: string }) {
        this.cwd = opts.cwd;
      }
    },
  };
});

export const MockAgentHarness = mocks.MockAgentHarness;
