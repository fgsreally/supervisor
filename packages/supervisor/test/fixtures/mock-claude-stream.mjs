import { createInterface } from "node:readline";

const lines = createInterface({ input: process.stdin });
let prompt = "";

lines.on("line", (line) => {
  prompt += line;
});

lines.on("close", () => {
  process.stdout.write(
    `${JSON.stringify({ type: "system", subtype: "init", session_id: "mock-claude-session" })}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({
      type: "stream_event",
      session_id: "mock-claude-session",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: prompt ? "claude reply" : "missing prompt" },
      },
    })}\n`,
  );
});
