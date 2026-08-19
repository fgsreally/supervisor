import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupervisorDb } from "../src/db.js";
import { AcpSessionRuntime } from "../src/core/session/external/acp-session-runtime.js";
import type { Session } from "../src/types.js";

let db: SupervisorDb;
let root: string;

beforeEach(() => {
  root = join(tmpdir(), `acp-runtime-test-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  db = new SupervisorDb(join(root, "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});

describe("AcpSessionRuntime", () => {
  it("streams ACP output and persists Supervisor messages", async () => {
    const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "mock-acp-agent.mjs");
    const agent = db.insertAgent({
      name: "Mock ACP",
      backend_type: "acp",
      provider_id: null,
      meta: {
        external: {
          command: process.execPath,
          args: [fixture],
          permissionPolicy: "reject_once",
        },
      },
    });
    const project = db.insertProject({ cwd: root, name: "ACP test" });
    const row = db.insert({
      project_id: project.id,
      parent_id: null,
      session_id: null,
      pid: null,
      status: "idle",
      cwd: root,
      agent_id: agent.id,
      meta: "{}",
    });
    const session: Session = {
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
    };

    const runtime = await AcpSessionRuntime.create({ db, session, agent });
    const events: any[] = [];
    runtime.subscribe((event) => events.push(event));
    try {
      const turn = runtime.prompt("hello");
      const approval = await vi.waitFor(() => {
        const event = events.find(
          (candidate) =>
            candidate.type === "tool_execution_start" &&
            candidate.toolName === "external_interaction",
        );
        expect(event).toBeTruthy();
        return event;
      });
      expect(runtime.resolveExternalInteraction(approval.toolCallId, { action: "approve" })).toBe(
        true,
      );
      await turn;
      const messages = await runtime.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ type: "message", message: { role: "user" } });
      expect(messages[1]).toMatchObject({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "mock reply" }],
        },
      });
      expect(events.some((event) => event.type === "message_update")).toBe(true);
      expect(events.at(-1)?.type).toBe("agent_end");
      expect(db.get(row.id)?.external_session_id).toBe("mock-session");
    } finally {
      await runtime.clear();
    }
  });

  it("bridges Cursor ACP extension ask_question through external_interaction", async () => {
    const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "mock-acp-agent.mjs");
    const agent = db.insertAgent({
      name: "Cursor Mock",
      backend_type: "cursor",
      provider_id: null,
      external_config: JSON.stringify({
        command: process.execPath,
        args: [fixture],
      }),
    });
    const project = db.insertProject({ cwd: root, name: "Cursor ACP test" });
    const row = db.insert({
      project_id: project.id,
      parent_id: null,
      session_id: null,
      pid: null,
      status: "idle",
      cwd: root,
      agent_id: agent.id,
      meta: "{}",
    });
    const session: Session = {
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
    };

    const runtime = await AcpSessionRuntime.create({ db, session, agent });
    const events: any[] = [];
    runtime.subscribe((event) => events.push(event));
    try {
      const turn = runtime.prompt("please use cursor-ext");
      const ask = await vi.waitFor(() => {
        const event = events.find(
          (candidate) =>
            candidate.type === "tool_execution_start" &&
            candidate.toolName === "external_interaction" &&
            candidate.args?.kind === "question",
        );
        expect(event).toBeTruthy();
        return event;
      });
      expect(
        runtime.resolveExternalInteraction(ask.toolCallId, {
          action: "answer",
          answers: { q1: ["Agent"] },
        }),
      ).toBe(true);
      await turn;
      const messages = await runtime.getMessages();
      expect(messages[1]).toMatchObject({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "cursor ext reply" }],
        },
      });
    } finally {
      await runtime.clear();
    }
  });
});
