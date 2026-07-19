import { createInterface } from "node:readline";

const lines = createInterface({ input: process.stdin });

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({ id: message.id, result: {} });
    return;
  }
  if (message.method === "thread/start" || message.method === "thread/resume") {
    send({ id: message.id, result: { thread: { id: "mock-codex-thread" } } });
    return;
  }
  if (message.method === "skills/list") {
    send({
      id: message.id,
      result: {
        data: [
          {
            cwd: process.cwd(),
            skills: [
              {
                name: "review",
                description: "Review code",
                enabled: true,
                path: `${process.cwd()}/skills/review/SKILL.md`,
              },
            ],
            errors: [],
          },
        ],
      },
    });
    return;
  }
  if (message.method === "model/list") {
    send({
      id: message.id,
      result: {
        data: [
          {
            id: "mock-model",
            model: "mock-model",
            displayName: "Mock model",
            description: "Test model",
            isDefault: true,
            defaultReasoningEffort: "medium",
            supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Balanced" }],
          },
        ],
        nextCursor: null,
      },
    });
    return;
  }
  if (message.method === "thread/settings/update") {
    send({ id: message.id, result: {} });
    return;
  }
  if (message.method === "thread/read") {
    send({
      id: message.id,
      result: {
        thread: {
          id: "mock-codex-thread",
          status: { type: "idle" },
          settings: { model: "mock-model", effort: "medium" },
        },
      },
    });
    return;
  }
  if (message.method === "thread/compact/start") {
    send({ id: message.id, result: {} });
    return;
  }
  if (message.method === "permissionProfile/list") {
    send({
      id: message.id,
      result: { data: [{ id: "workspace-write", description: "Workspace", allowed: true }] },
    });
    return;
  }
  if (message.method === "turn/start") {
    send({ id: message.id, result: { turn: { id: "mock-codex-turn" } } });
    if (message.params?.input?.some((item) => item.text === "needs approval")) {
      send({
        id: 900,
        method: "item/commandExecution/requestApproval",
        params: {
          itemId: "command-1",
          threadId: "mock-codex-thread",
          turnId: "mock-codex-turn",
          command: "pnpm test",
          reason: "run tests",
          startedAtMs: Date.now(),
        },
      });
      return;
    }
    if (message.params?.input?.some((item) => item.text === "needs elicitation")) {
      send({
        id: 901,
        method: "mcpServer/elicitation/request",
        params: {
          threadId: "mock-codex-thread",
          turnId: "mock-codex-turn",
          serverName: "travel",
          mode: "form",
          message: "Trip preferences",
          requestedSchema: {
            type: "object",
            properties: {
              days: { type: "integer", title: "Days" },
              relaxed: { type: "boolean", title: "Relaxed" },
            },
            required: ["days"],
          },
          _meta: null,
        },
      });
      return;
    }
    if (message.params?.input?.some((item) => item.text === "hold for steer")) return;
    if (message.params?.input?.some((item) => item.text?.startsWith("inspect input"))) {
      send({
        method: "item/agentMessage/delta",
        params: {
          threadId: "mock-codex-thread",
          turnId: "mock-codex-turn",
          itemId: "message-input",
          delta: JSON.stringify(message.params.input),
        },
      });
    }
    completeTurn();
    return;
  }
  if (message.id === 900) {
    send({
      method: "item/agentMessage/delta",
      params: {
        threadId: "mock-codex-thread",
        turnId: "mock-codex-turn",
        itemId: "message-approval",
        delta: `approval:${message.result?.decision}`,
      },
    });
    completeTurn();
    return;
  }
  if (message.id === 901) {
    send({
      method: "item/agentMessage/delta",
      params: {
        threadId: "mock-codex-thread",
        turnId: "mock-codex-turn",
        itemId: "message-elicitation",
        delta: `elicitation:${JSON.stringify(message.result)}`,
      },
    });
    completeTurn();
    return;
  }
  if (message.method === "turn/steer") {
    send({ id: message.id, result: {} });
    send({
      method: "item/agentMessage/delta",
      params: {
        threadId: "mock-codex-thread",
        turnId: "mock-codex-turn",
        itemId: "message-steer",
        delta: `steer:${JSON.stringify(message.params)}`,
      },
    });
    completeTurn();
    return;
  }
  if (message.method === "turn/interrupt") send({ id: message.id, result: {} });
});

function completeTurn() {
  send({
    method: "item/agentMessage/delta",
    params: {
      threadId: "mock-codex-thread",
      turnId: "mock-codex-turn",
      itemId: "message-1",
      delta: "codex reply",
    },
  });
  send({
    method: "turn/completed",
    params: {
      threadId: "mock-codex-thread",
      turn: { id: "mock-codex-turn", items: [], status: "completed" },
    },
  });
}
