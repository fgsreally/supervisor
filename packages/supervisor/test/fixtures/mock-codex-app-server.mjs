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
