import { describe, expect, it } from "vitest";
import type { ChatEntry } from "@/types/chat-entry";
import { buildDisplayGroups } from "../flatten-messages";
import {
  applyAgentEventToChatEntries,
  sessionTreeEntryToChatEntry,
  sessionTreeToChatEntries,
} from "../session-entries";

describe("sessionTreeEntryToChatEntry", () => {
  it("normalizes message.role toolResult into toolResult entry", () => {
    const entry = sessionTreeEntryToChatEntry({
      id: "tr1",
      parentId: "a1",
      type: "message",
      isOld: false,
      meta: {},
      createdAt: 1,
      message: {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "# readme" }],
        isError: false,
      },
    } as import("@/api").SessionTreeEntry);

    expect(entry).toMatchObject({
      type: "toolResult",
      toolCallId: "call_1",
      toolName: "read",
      content: [{ type: "text", text: "# readme" }],
      isError: false,
    });
  });
});

describe("buildDisplayGroups with API-shaped entries", () => {
  it("keeps persisted eval calls visible and attaches their result", () => {
    const entries = sessionTreeToChatEntries([
      {
        id: "a-eval",
        parentId: null,
        type: "message",
        isOld: false,
        meta: {},
        createdAt: 1,
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "call_eval",
              name: "eval",
              arguments: { code: "return sessions.length" },
            },
          ],
        },
      },
      {
        id: "tr-eval",
        parentId: "a-eval",
        type: "message",
        isOld: false,
        meta: {},
        createdAt: 2,
        message: {
          role: "toolResult",
          toolCallId: "call_eval",
          toolName: "eval",
          content: [{ type: "text", text: "17" }],
          isError: false,
        },
      },
    ] as import("@/api").SessionTreeEntry[]);

    const groups = buildDisplayGroups(entries);
    const assistant = groups.find((group) => group.type === "grouped_assistant");
    expect(assistant && "pieces" in assistant ? assistant.pieces : []).toEqual([
      {
        kind: "toolStep",
        callId: "call_eval",
        toolName: "eval",
        callArgs: { code: "return sessions.length" },
        result: {
          id: "tr-eval",
          type: "toolResult",
          toolCallId: "call_eval",
          toolName: "eval",
          content: [{ type: "text", text: "17" }],
          isError: false,
          createdAt: 2,
        },
      },
    ]);
  });

  it("keeps read output on tool row instead of markdown bubble text", () => {
    const entries = sessionTreeToChatEntries([
      {
        id: "u1",
        parentId: null,
        type: "message",
        isOld: false,
        meta: {},
        createdAt: 1,
        message: { role: "user", content: [{ type: "text", text: "fix readme" }] },
      },
      {
        id: "a1",
        parentId: "u1",
        type: "message",
        isOld: false,
        meta: {},
        createdAt: 2,
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "read first" },
            { type: "toolCall", id: "call_1", name: "read", arguments: { path: "readme.md" } },
          ],
        },
      },
      {
        id: "tr1",
        parentId: "a1",
        type: "message",
        isOld: false,
        meta: {},
        createdAt: 3,
        message: {
          role: "toolResult",
          toolCallId: "call_1",
          toolName: "read",
          content: [{ type: "text", text: "# old readme" }],
          isError: false,
        },
      },
      {
        id: "a2",
        parentId: "tr1",
        type: "message",
        isOld: false,
        meta: {},
        createdAt: 4,
        message: {
          role: "assistant",
          content: [{ type: "text", text: "好的，我来改" }],
        },
      },
    ] as import("@/api").SessionTreeEntry[]);

    const groups = buildDisplayGroups(entries);
    const assistant = groups.find((g) => g.type === "grouped_assistant");
    expect(assistant && "pieces" in assistant ? assistant.pieces : []).toEqual([
      { kind: "thinking", text: "read first" },
      {
        kind: "toolStep",
        callId: "call_1",
        toolName: "read",
        callArgs: { path: "readme.md" },
        result: {
          id: "tr1",
          type: "toolResult",
          toolCallId: "call_1",
          toolName: "read",
          content: [{ type: "text", text: "# old readme" }],
          isError: false,
          createdAt: 3,
        },
      },
      { kind: "text", text: "好的，我来改" },
    ]);
  });
});

describe("applyAgentEventToChatEntries", () => {
  it("stores ask tool results as human text, not raw JSON", () => {
    const entries: ChatEntry[] = [
      {
        id: "stream-1",
        type: "message",
        createdAt: 1,
        message: { role: "assistant", content: [] },
      },
    ];

    applyAgentEventToChatEntries(entries, "stream-1", {
      type: "tool_execution_end",
      toolCallId: "call_ask",
      toolName: "ask",
      isError: false,
      result: {
        content: [{ type: "text", text: "正式专业" }],
        details: {
          answers: [{ id: "doc-style", value: "formal", label: "正式专业" }],
          cancelled: false,
        },
      },
    } as import("@earendil-works/pi-agent-core").AgentEvent);

    const toolResult = entries.find((e) => e.type === "toolResult");
    expect(toolResult?.type).toBe("toolResult");
    if (toolResult?.type !== "toolResult") return;
    expect(toolResult.content).toEqual([{ type: "text", text: "正式专业" }]);
    expect(toolResult.content[0]?.text).not.toContain("{");
  });
});
