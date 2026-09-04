import { describe, expect, it } from "vitest";
import { ExternalTurnBuffer } from "../src/core/session/external/external-turn-buffer.js";

describe("ExternalTurnBuffer", () => {
  it("persists plain text turns without tools", async () => {
    const buffer = new ExternalTurnBuffer();
    buffer.appendText("hello");
    const appended: unknown[] = [];
    const storage = {
      appendEntry: async (entry: unknown) => {
        appended.push(entry);
      },
    };
    await buffer.persist(storage as never, "user-1");
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      parentId: "user-1",
      type: "message",
      message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
    });
  });

  it("persists tool calls and results in native order", async () => {
    const buffer = new ExternalTurnBuffer();
    buffer.appendText("checking");
    buffer.recordToolStart("call-1", "ls", { path: "." });
    buffer.recordToolEnd("call-1", "ls", "README.md", false);
    buffer.appendText("done");

    const appended: Array<Record<string, unknown>> = [];
    const storage = {
      appendEntry: async (entry: Record<string, unknown>) => {
        appended.push(entry);
      },
    };
    await buffer.persist(storage as never, "user-1");

    expect(appended).toHaveLength(3);
    expect(appended[0]).toMatchObject({
      parentId: "user-1",
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "checking" },
          { type: "toolCall", id: "call-1", name: "ls", arguments: { path: "." } },
        ],
      },
    });
    expect(appended[1]).toMatchObject({
      parentId: appended[0]?.id,
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "ls",
      },
    });
    expect(appended[2]).toMatchObject({
      parentId: appended[1]?.id,
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "done" }],
      },
    });
  });
});
