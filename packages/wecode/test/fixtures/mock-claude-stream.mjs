import { createInterface } from "node:readline";

const sessionId = "mock-claude-session";
let initialized = false;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.type === "control_request") {
    send({
      type: "control_response",
      subtype: "success",
      request_id: message.request_id,
      response: {},
    });
    if (message.request?.subtype === "initialize" && !initialized) {
      initialized = true;
      send({
        type: "system",
        subtype: "init",
        session_id: sessionId,
        apiKeySource: "user",
        claude_code_version: "test",
        cwd: process.cwd(),
        tools: [],
        mcp_servers: [],
        model: "test",
        permissionMode: "default",
        slash_commands: ["status", "compact"],
        output_style: "default",
        skills: [],
        plugins: [],
        uuid: "00000000-0000-4000-8000-000000000001",
      });
    }
    return;
  }
  if (message.type !== "user") return;
  send({
    type: "stream_event",
    session_id: sessionId,
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text: "claude reply" },
    },
  });
  send({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "claude reply",
    session_id: sessionId,
    uuid: "00000000-0000-4000-8000-000000000002",
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    stop_reason: null,
    total_cost_usd: 0,
    usage: {},
    modelUsage: {},
    permission_denials: [],
  });
});
