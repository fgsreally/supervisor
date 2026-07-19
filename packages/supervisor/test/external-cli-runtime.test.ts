import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeSessionRuntime } from "../src/core/external/claude-session-runtime.js";
import { CodexSessionRuntime } from "../src/core/external/codex-session-runtime.js";
import { SupervisorDb } from "../src/db.js";
import type { Agent, AgentBackendType, Session } from "../src/types.js";

let db: SupervisorDb;
let root: string;

beforeEach(() => {
  root = join(tmpdir(), `external-cli-runtime-test-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  db = new SupervisorDb(join(root, "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});

function createRecords(
  backendType: AgentBackendType,
  fixtureName: string,
): {
  agent: Agent;
  session: Session;
} {
  const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", fixtureName);
  const agent = db.insertAgent({
    name: `Mock ${backendType}`,
    backend_type: backendType,
    provider_id: null,
    meta: { external: { command: process.execPath, args: [fixture] } },
  });
  const project = db.insertProject({ cwd: root, name: `${backendType} test` });
  const row = db.insert({
    project_id: project.id,
    parent_id: null,
    session_id: null,
    pid: null,
    status: "starting",
    cwd: root,
    agent_id: agent.id,
    meta: "{}",
  });
  return {
    agent,
    session: {
      id: row.id,
      projectId: row.project_id,
      parentId: row.parent_id,
      sessionId: row.session_id,
      pid: row.pid,
      status: row.status,
      thinkingLevel: row.thinking_level,
      cwd: row.cwd,
      leafId: row.leaf_id,
      agentId: row.agent_id,
      branchType: null,
      showInSessionList: true,
      contextLeafId: null,
      createdAt: new Date(row.created_at),
      lastActiveAt: new Date(row.last_active_at),
      meta: {},
    },
  };
}

function mockClaudeQuery({ prompt }: { prompt: AsyncIterable<any> }) {
  const iterator = (async function* () {
    yield {
      type: "system",
      subtype: "init",
      session_id: "mock-claude-session",
      slash_commands: ["status", "compact"],
      uuid: "00000000-0000-4000-8000-000000000001",
    };
    for await (const _message of prompt) {
      yield {
        type: "stream_event",
        session_id: "mock-claude-session",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "claude reply" },
        },
      };
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "claude reply",
        session_id: "mock-claude-session",
        uuid: "00000000-0000-4000-8000-000000000002",
      };
    }
  })();
  return Object.assign(iterator, {
    interrupt: async () => {},
    close: () => {},
  }) as any;
}

describe("external CLI runtimes", () => {
  it("streams Codex app-server output and saves its thread id", async () => {
    const records = createRecords("codex", "mock-codex-app-server.mjs");
    const runtime = await CodexSessionRuntime.create({ db, ...records });
    try {
      await runtime.prompt("hello");
      const messages = await runtime.getMessages();
      expect(messages).toHaveLength(2);
      expect(
        messages.find((entry) => entry.type === "message" && entry.message.role === "assistant"),
      ).toMatchObject({
        type: "message",
        message: { role: "assistant", content: "codex reply" },
      });
      expect(db.get(runtime.id)?.meta).toMatchObject({
        externalSessionId: "mock-codex-thread",
      });
      expect(runtime.getSlashCommands()).toEqual(
        expect.arrayContaining([
          { name: "model", description: "选择 Codex 模型和推理强度", source: "client" },
          { name: "compact", description: "压缩当前 Codex 上下文", source: "client" },
          { name: "review", description: "Review code", source: "skill" },
        ]),
      );
      await expect(runtime.listModels()).resolves.toEqual([
        expect.objectContaining({ model: "mock-model", displayName: "Mock model" }),
      ]);
      await expect(
        runtime.updateThreadSettings({ model: "mock-model", effort: "medium" }),
      ).resolves.toBeUndefined();
      await expect(runtime.executeClientCommand("compact")).resolves.toEqual({});
      await expect(runtime.executeClientCommand("status")).resolves.toMatchObject({
        thread: { id: "mock-codex-thread" },
      });
      await expect(runtime.executeClientCommand("permissions")).resolves.toMatchObject({
        data: [{ id: "workspace-write", allowed: true }],
      });
      await expect(runtime.executeClientCommand("plan")).resolves.toEqual({
        ok: true,
        mode: "plan",
      });
      await expect(runtime.executeClientCommand("clear")).rejects.toThrow("尚未在 Web UI 中适配");
    } finally {
      await runtime.clear();
    }
  });

  it("forwards Codex approval requests to Supervisor and resumes with the user's decision", async () => {
    const records = createRecords("codex", "mock-codex-app-server.mjs");
    const runtime = await CodexSessionRuntime.create({ db, ...records });
    const events: any[] = [];
    runtime.subscribe((event) => events.push(event));
    try {
      const turn = runtime.prompt("needs approval");
      await expect
        .poll(() => events.find((event) => event.toolName === "external_interaction"))
        .toMatchObject({
          type: "tool_execution_start",
          toolCallId: "codex-900",
          args: { kind: "approval", backend: "codex" },
        });
      expect(runtime.resolveExternalInteraction("codex-900", { action: "approve" })).toBe(true);
      await turn;
      expect(runtime.getLastAssistantText()).toContain("approval:accept");
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "tool_execution_end",
          toolCallId: "codex-900",
          isError: false,
        }),
      );
    } finally {
      await runtime.clear();
    }
  });

  it("uses structured Codex skill, mention, image, and native turn steering inputs", async () => {
    const records = createRecords("codex", "mock-codex-app-server.mjs");
    const runtime = await CodexSessionRuntime.create({ db, ...records });
    try {
      await runtime.prompt("inspect input $review @.", [
        { mimeType: "image/png", data: "aW1hZ2U=" },
      ]);
      expect(runtime.getLastAssistantText()).toContain('"type":"skill"');
      expect(runtime.getLastAssistantText()).toContain('"name":"review"');
      expect(runtime.getLastAssistantText()).toContain('"type":"mention"');
      expect(runtime.getLastAssistantText()).toContain('"type":"image"');

      const turn = runtime.prompt("hold for steer");
      await new Promise((resolve) => setTimeout(resolve, 30));
      await runtime.steer("change direction", [{ mimeType: "image/png", data: "c3RlZXI=" }]);
      await turn;
      expect(runtime.getLastAssistantText()).toContain("steer:");
      expect(runtime.getLastAssistantText()).toContain('"expectedTurnId":"mock-codex-turn"');
      expect(runtime.getLastAssistantText()).toContain("data:image/png;base64,c3RlZXI=");
    } finally {
      await runtime.clear();
    }
  });

  it("forwards Codex MCP form elicitations and returns typed content", async () => {
    const records = createRecords("codex", "mock-codex-app-server.mjs");
    const runtime = await CodexSessionRuntime.create({ db, ...records });
    const events: any[] = [];
    runtime.subscribe((event) => events.push(event));
    try {
      const turn = runtime.prompt("needs elicitation");
      await expect
        .poll(() => events.find((event) => event.toolCallId === "codex-901"))
        .toMatchObject({
          type: "tool_execution_start",
          args: { kind: "question", backend: "codex" },
        });
      expect(
        runtime.resolveExternalInteraction("codex-901", {
          action: "answer",
          answers: { days: ["3"], relaxed: ["true"] },
        }),
      ).toBe(true);
      await turn;
      expect(runtime.getLastAssistantText()).toContain(
        '"action":"accept","content":{"days":3,"relaxed":true}',
      );
    } finally {
      await runtime.clear();
    }
  });

  it("streams Claude Code output and saves its session id", async () => {
    const records = createRecords("claude", "mock-claude-stream.mjs");
    const runtime = await ClaudeSessionRuntime.create({
      db,
      ...records,
      queryFactory: mockClaudeQuery as any,
    });
    try {
      await runtime.prompt("hello");
      const messages = await runtime.getMessages();
      expect(messages).toHaveLength(2);
      expect(
        messages.find((entry) => entry.type === "message" && entry.message.role === "assistant"),
      ).toMatchObject({
        type: "message",
        message: { role: "assistant", content: "claude reply" },
      });
      expect(db.get(runtime.id)?.meta).toMatchObject({
        externalSessionId: "mock-claude-session",
      });
      expect(runtime.getSlashCommands()).toEqual([
        { name: "status", description: "" },
        { name: "compact", description: "" },
      ]);
    } finally {
      await runtime.clear();
    }
  });

  it("holds Claude permission bridge requests until Supervisor responds", async () => {
    const records = createRecords("claude", "mock-claude-stream.mjs");
    const runtime = await ClaudeSessionRuntime.create({
      db,
      ...records,
      queryFactory: mockClaudeQuery as any,
    });
    const events: any[] = [];
    runtime.subscribe((event) => events.push(event));
    try {
      const response = runtime.requestExternalInteraction({
        backend: "claude",
        kind: "approval",
        title: "Claude Code requests permission",
        detail: "Bash",
      });
      await expect
        .poll(() => events.find((event) => event.toolName === "external_interaction"))
        .toBeTruthy();
      const interaction = events.find((event) => event.toolName === "external_interaction");
      expect(runtime.resolveExternalInteraction(interaction.toolCallId, { action: "deny" })).toBe(
        true,
      );
      await expect(response).resolves.toEqual({ action: "deny" });
    } finally {
      await runtime.clear();
    }
  });
});
