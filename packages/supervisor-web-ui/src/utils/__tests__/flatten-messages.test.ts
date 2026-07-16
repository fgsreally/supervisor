import { describe, expect, it } from "vitest";
import { buildDisplayGroups, compactAssistantPieces } from "../flatten-messages";

describe("compactAssistantPieces", () => {
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
});
