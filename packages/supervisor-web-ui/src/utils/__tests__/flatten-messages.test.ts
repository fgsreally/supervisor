import { describe, expect, it } from "vitest";
import { buildDisplayGroups, compactAssistantPieces } from "../flatten-messages";

describe("compactAssistantPieces", () => {
  it("coalesces adjacent text pieces from split assistant messages", () => {
    const pieces = compactAssistantPieces([
      { kind: "text", text: "第一段" },
      { kind: "text", text: "第二段" },
    ]);
    expect(pieces).toEqual([{ kind: "text", text: "第一段\n\n第二段" }]);
  });

  it("removes skill markdown echoed as assistant text after read", () => {
    const skillBody = `---\nname: neko-doc-writer\ndescription: test\n---\n\n# Skill`;
    const pieces = compactAssistantPieces([
      {
        kind: "toolStep",
        callId: "1",
        toolName: "read",
        callArgs: { path: "/a/skills/neko-doc-writer/SKILL.md" },
        result: {
          id: "r1",
          type: "toolResult",
          toolCallId: "1",
          toolName: "read",
          content: [{ type: "text", text: skillBody }],
        },
      },
      { kind: "text", text: skillBody },
    ]);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.kind).toBe("toolStep");
  });

  it("removes read file content echoed as assistant text", () => {
    const fileBody = "# readme\n\nhello";
    const pieces = compactAssistantPieces([
      {
        kind: "toolStep",
        callId: "1",
        toolName: "read",
        callArgs: { path: "readme.md" },
        result: {
          id: "r1",
          type: "toolResult",
          toolCallId: "1",
          toolName: "read",
          content: [{ type: "text", text: fileBody }],
        },
      },
      { kind: "text", text: fileBody },
    ]);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.kind).toBe("toolStep");
  });

  it("removes bash output echoed as assistant text", () => {
    const bashOut = "wsl: Unknown key\nCommand exited with code 1";
    const pieces = compactAssistantPieces([
      {
        kind: "bash",
        callId: "1",
        command: "ls",
        intent: "查看目录",
        result: {
          id: "r1",
          type: "toolResult",
          toolCallId: "1",
          toolName: "bash",
          content: [{ type: "text", text: bashOut }],
        },
      },
      { kind: "text", text: bashOut },
    ]);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.kind).toBe("bash");
  });
});

describe("buildDisplayGroups", () => {
  it("renders thinking blocks in assistant messages", () => {
    const groups = buildDisplayGroups([
      {
        id: "u1",
        type: "message",
        message: { role: "user", content: "hi" },
      },
      {
        id: "a1",
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "internal reasoning" },
            { type: "text", text: "你好" },
          ],
        },
      } as import("@/types/chat-entry").ChatEntry,
    ]);
    const assistant = groups.find((g) => g.type === "grouped_assistant");
    expect(assistant && "pieces" in assistant ? assistant.pieces : []).toEqual([
      { kind: "thinking", text: "internal reasoning" },
      { kind: "text", text: "你好" },
    ]);
  });

  it("merges consecutive assistant messages into one bubble by default", () => {
    const groups = buildDisplayGroups([
      {
        id: "u1",
        type: "message",
        message: { role: "user", content: "hi" },
      },
      {
        id: "a1",
        type: "message",
        message: { role: "assistant", content: "第一段" },
      },
      {
        id: "a2",
        type: "message",
        message: { role: "assistant", content: "第二段" },
      },
    ] as import("@/types/chat-entry").ChatEntry[]);
    const assistantGroups = groups.filter((g) => g.type === "grouped_assistant");
    expect(assistantGroups).toHaveLength(1);
    expect(assistantGroups[0] && "pieces" in assistantGroups[0] ? assistantGroups[0].pieces : []).toEqual([
      { kind: "text", text: "第一段\n\n第二段" },
    ]);
  });

  it("splits consecutive assistant messages when splitAssistantMessages is enabled", () => {
    const groups = buildDisplayGroups(
      [
        {
          id: "u1",
          type: "message",
          message: { role: "user", content: "hi" },
        },
        {
          id: "a1",
          type: "message",
          message: { role: "assistant", content: "第一段" },
        },
        {
          id: "r1",
          type: "toolResult",
          toolCallId: "t1",
          toolName: "read",
          content: [{ type: "text", text: "file body" }],
        },
        {
          id: "a2",
          type: "message",
          message: { role: "assistant", content: "第二段" },
        },
      ] as import("@/types/chat-entry").ChatEntry[],
      { splitAssistantMessages: true },
    );
    const assistantGroups = groups.filter((g) => g.type === "grouped_assistant");
    expect(assistantGroups).toHaveLength(2);
    expect(assistantGroups[0]?.type === "grouped_assistant" && assistantGroups[0].id).toBe("a1");
    expect(assistantGroups[1]?.type === "grouped_assistant" && assistantGroups[1].id).toBe("a2");
    expect(
      assistantGroups[0]?.type === "grouped_assistant" ? assistantGroups[0].pieces : [],
    ).toEqual([
      { kind: "text", text: "第一段" },
      {
        kind: "toolStep",
        callId: "t1",
        toolName: "read",
        result: expect.objectContaining({ id: "r1" }),
      },
    ]);
    expect(
      assistantGroups[1]?.type === "grouped_assistant" ? assistantGroups[1].pieces : [],
    ).toEqual([{ kind: "text", text: "第二段" }]);
  });
});
