import { createInterface } from "node:readline";

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    send({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: 1 } });
    return;
  }
  if (request.method === "session/new") {
    send({ jsonrpc: "2.0", id: request.id, result: { sessionId: "mock-session" } });
    return;
  }
  if (request.method === "session/load") {
    send({ jsonrpc: "2.0", id: request.id, result: {} });
    return;
  }
  if (request.method === "session/prompt") {
    const promptText = request.params?.prompt?.[0]?.text ?? "";
    if (promptText.includes("cursor-ext")) {
      send({
        jsonrpc: "2.0",
        id: 701,
        method: "cursor/ask_question",
        params: {
          toolCallId: "ask-1",
          title: "Need input",
          questions: [
            {
              id: "q1",
              prompt: "Which mode?",
              options: [
                { id: "agent", label: "Agent" },
                { id: "plan", label: "Plan" },
              ],
            },
          ],
        },
      });
      globalThis.pendingPrompt = request;
      globalThis.pendingExt = "ask";
      return;
    }
    send({
      jsonrpc: "2.0",
      id: 700,
      method: "session/request_permission",
      params: {
        sessionId: request.params.sessionId,
        toolCall: {
          title: "Execute command",
          kind: "execute",
          status: "pending",
          toolCallId: "tool-approval",
          content: [],
        },
        options: [
          { kind: "allow_once", name: "Allow", optionId: "allow" },
          { kind: "reject_once", name: "Reject", optionId: "reject" },
        ],
      },
    });
    globalThis.pendingPrompt = request;
    globalThis.pendingExt = "permission";
    return;
  }
  if (request.id === 700 || request.id === 701) {
    const prompt = globalThis.pendingPrompt;
    if (request.id === 701) {
      globalThis.lastAskResult = request.result;
    }
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: prompt.params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: request.id === 701 ? "cursor ext reply" : "mock reply",
          },
        },
      },
    });
    send({ jsonrpc: "2.0", id: prompt.id, result: { stopReason: "end_turn" } });
  }
});
