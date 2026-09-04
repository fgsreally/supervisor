import { describe, expect, it } from "vitest";
import type { SessionTreeEntry } from "@/api";
import type { ChatEntry } from "@/types/chat-entry";
import {
  buildDisplayGroups,
  isGroupedAssistantGroup,
  type RenderPiece,
} from "@/utils/flatten-messages";
import { sessionTreeToChatEntries } from "@/utils/session-entries";

function message(id: string, role: string, content: unknown, meta: Record<string, unknown> = {}) {
  return {
    id,
    parentId: null,
    type: "message",
    isOld: false,
    meta,
    createdAt: Number(id.replace(/\D/g, "")) || 1,
    message: { role, content },
  } as SessionTreeEntry;
}

describe("subagent chat rendering", () => {
  it("renders an injected user-role message as agent-attributed input", () => {
    const [entry] = sessionTreeToChatEntries([
      message("m1", "user", "继续检查", { inputSource: "spawn_agent:parent:12" }),
    ]);
    expect(entry).toMatchObject({ injectedSource: "spawn_agent:parent:12" });
    expect(entry?.type === "message" && entry.message.role).toBe("user");
  });

  it("only expands the newest interaction for the same child session", () => {
    const entries: ChatEntry[] = [
      {
        id: "a1",
        type: "message",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "call-1",
              name: "spawn_agent",
              arguments: { agentName: "Coding" },
            },
          ],
        },
      },
      {
        id: "r1",
        type: "toolResult",
        toolCallId: "call-1",
        toolName: "spawn_agent",
        content: [{ type: "text", text: '{"sessionId":42}' }],
      },
      { id: "u2", type: "message", message: { role: "user", content: "next" } },
      {
        id: "a2",
        type: "message",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "call-2",
              name: "spawn_agent",
              arguments: { sessionId: 42, prompt: "继续" },
            },
          ],
        },
      },
      {
        id: "r2",
        type: "toolResult",
        toolCallId: "call-2",
        toolName: "spawn_agent",
        content: [{ type: "text", text: '{"sessionId":42,"resumed":true}' }],
      },
    ];
    const pieces = buildDisplayGroups(entries)
      .filter(isGroupedAssistantGroup)
      .flatMap((group) => group.pieces)
      .filter(
        (piece): piece is Extract<RenderPiece, { kind: "toolStep" }> =>
          piece.kind === "toolStep" && piece.toolName === "spawn_agent",
      );
    expect(pieces.map((piece) => piece.latestSubagentInteraction)).toEqual([false, true]);
  });
});
