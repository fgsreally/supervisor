import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "./mock-agent-harness.js";
import { SupervisorDb } from "../src/db.js";
import { SESSION_INPUT_INTERRUPT_LEVEL } from "../src/core/session-input-queue.js";
import { SessionManager } from "../src/session-manager.js";
import { MockAgentHarness } from "./mock-agent-harness.js";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SPAWN_OPTS = { cwd: "/proj" };

async function flushLifecycle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200));
}

let db: SupervisorDb;
let manager: SessionManager;
let tmpDir: string;

beforeEach(() => {
  MockAgentHarness.instances = [];
  tmpDir = join(tmpdir(), `supervisor-input-queue-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new SupervisorDb(join(tmpDir, "test.db"));
  manager = new SessionManager(db);
});

afterEach(async () => {
  await manager.dispose();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("session input queue", () => {
  it("queues while busy and drains on agent_end", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    const harness = MockAgentHarness.instances[0]!;
    harness.agent.emit({ type: "agent_start" } as AgentEvent);

    const disposition = await manager.submitSessionInput(inst.id, {
      message: "queued note",
      level: 40,
    });
    expect(disposition).toBe("queued");
    expect(manager.peekSessionInput(inst.id)?.message).toBe("queued note");
    expect(harness.agent.prompt).not.toHaveBeenCalled();

    harness.agent.emit({ type: "agent_end", messages: [] } as AgentEvent);
    await flushLifecycle();

    expect(harness.agent.prompt).toHaveBeenCalledWith("queued note");
    expect(manager.peekSessionInput(inst.id)).toBeUndefined();
  });

  it("interrupts an active turn for high-priority input", async () => {
    const inst = await manager.spawn(SPAWN_OPTS);
    const harness = MockAgentHarness.instances[0]!;
    harness.agent.emit({ type: "agent_start" } as AgentEvent);

    const disposition = await manager.submitSessionInput(inst.id, {
      message: "urgent stop",
      level: SESSION_INPUT_INTERRUPT_LEVEL,
    });
    expect(disposition).toBe("interrupt");
    expect(harness.abort).toHaveBeenCalled();
    expect(harness.agent.prompt).toHaveBeenCalledWith("urgent stop");
  });
});
