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

describe("external CLI runtimes", () => {
  it("streams Codex app-server output and saves its thread id", async () => {
    const records = createRecords("codex", "mock-codex-app-server.mjs");
    const runtime = await CodexSessionRuntime.create({ db, ...records });
    try {
      await runtime.prompt("hello");
      const messages = await runtime.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({
        type: "message",
        message: { role: "assistant", content: "codex reply" },
      });
      expect(db.get(runtime.id)?.meta).toMatchObject({
        externalSessionId: "mock-codex-thread",
      });
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

  it("streams Claude Code output and saves its session id", async () => {
    const records = createRecords("claude", "mock-claude-stream.mjs");
    const runtime = await ClaudeSessionRuntime.create({ db, ...records });
    try {
      await runtime.prompt("hello");
      const messages = await runtime.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({
        type: "message",
        message: { role: "assistant", content: "claude reply" },
      });
      expect(db.get(runtime.id)?.meta).toMatchObject({
        externalSessionId: "mock-claude-session",
      });
    } finally {
      await runtime.clear();
    }
  });

  it("holds Claude permission bridge requests until Supervisor responds", async () => {
    const records = createRecords("claude", "mock-claude-stream.mjs");
    const runtime = await ClaudeSessionRuntime.create({ db, ...records });
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
