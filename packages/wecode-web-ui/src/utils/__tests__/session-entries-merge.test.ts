import { describe, expect, it } from "vitest";
import { buildDisplayGroups } from "../flatten-messages";
import {
  mergeStreamingToolsIntoPersistedEntries,
  sessionTreeToChatEntries,
} from "../session-entries";

describe("mergeStreamingToolsIntoPersistedEntries", () => {
  it("keeps an optimistic user turn when a streaming reload is stale", () => {
    const serverEntries = sessionTreeToChatEntries([
      {
        id: "old-user",
        parentId: null,
        type: "message",
        isOld: false,
        meta: {},
        createdAt: 1,
        message: { role: "user", content: "hi" },
      },
      {
        id: "old-assistant",
        parentId: "old-user",
        type: "message",
        isOld: false,
        meta: {},
        createdAt: 2,
        message: { role: "assistant", content: "hello" },
      },
    ] as import("@/api").SessionTreeEntry[]);
    const localEntries = [
      ...serverEntries,
      {
        id: "optimistic-user",
        type: "message" as const,
        message: { role: "user" as const, content: "support shadow" },
      },
      {
        id: "stream-2",
        type: "message" as const,
        message: { role: "assistant" as const, content: [{ type: "text" as const, text: "" }] },
      },
    ];

    const merged = mergeStreamingToolsIntoPersistedEntries(serverEntries, localEntries);
    expect(merged.slice(-2).map((entry) => entry.id)).toEqual(["optimistic-user", "stream-2"]);
    expect(buildDisplayGroups(merged).map((group) => group.type)).toEqual([
      "message",
      "grouped_assistant",
      "message",
    ]);
  });

  it("keeps streaming tool rows when server only persisted assistant text", () => {
    const serverEntries = sessionTreeToChatEntries([
      {
        id: "u1",
        parentId: null,
        type: "message",
        isOld: false,
        meta: {},
        createdAt: 1,
        message: { role: "user", content: [{ type: "text", text: "列目录" }] },
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
          content: "当前文件夹有两个文件",
        },
      },
    ] as import("@/api").SessionTreeEntry[]);

    const localEntries = [
      {
        id: "stream-1",
        type: "message" as const,
        createdAt: 2,
        message: {
          role: "assistant" as const,
          content: [
            { type: "text" as const, text: "当前文件夹有两个文件" },
            {
              type: "toolCall" as const,
              id: "call_ls",
              name: "ls",
              arguments: { path: "." },
            },
          ],
        },
      },
      {
        id: "tool-result-call_ls",
        type: "toolResult" as const,
        toolCallId: "call_ls",
        toolName: "ls",
        content: [{ type: "text", text: "README.md" }],
      },
    ];

    const merged = mergeStreamingToolsIntoPersistedEntries(serverEntries, localEntries);
    const groups = buildDisplayGroups(merged);
    const assistant = groups.find((group) => group.type === "grouped_assistant");
    expect(assistant && "pieces" in assistant ? assistant.pieces : []).toEqual([
      { kind: "text", text: "当前文件夹有两个文件" },
      {
        kind: "toolStep",
        callId: "call_ls",
        toolName: "ls",
        callArgs: { path: "." },
        result: {
          id: "merged-tool-result-call_ls",
          type: "toolResult",
          toolCallId: "call_ls",
          toolName: "ls",
          content: [{ type: "text", text: "README.md" }],
        },
      },
    ]);
  });
});
