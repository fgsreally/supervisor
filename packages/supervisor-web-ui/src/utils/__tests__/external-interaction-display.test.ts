import { describe, expect, it } from "vitest";
import type { RenderPiece } from "../flatten-messages";
import { dedupeApprovalToolPieces } from "../external-interaction-display";

describe("dedupeApprovalToolPieces", () => {
  it("hides bash while approval is pending", () => {
    const pieces: RenderPiece[] = [
      {
        kind: "toolStep",
        callId: "bash-1",
        toolName: "Bash",
        callArgs: { command: "mkdir -p demo" },
      },
      {
        kind: "toolStep",
        callId: "approval-1",
        toolName: "external_interaction",
        callArgs: {
          kind: "approval",
          request: { toolName: "Bash", input: { command: "mkdir -p demo" } },
        },
      },
    ];
    expect(dedupeApprovalToolPieces(pieces)).toEqual([pieces[1]]);
  });

  it("drops resolved approval and keeps bash result", () => {
    const bashResult = {
      id: "tr-bash",
      type: "toolResult" as const,
      toolCallId: "bash-1",
      toolName: "bash",
      content: [{ type: "text", text: "ok" }],
    };
    const pieces: RenderPiece[] = [
      {
        kind: "toolStep",
        callId: "bash-1",
        toolName: "Bash",
        callArgs: { command: "mkdir -p demo" },
        result: bashResult,
      },
      {
        kind: "toolStep",
        callId: "approval-1",
        toolName: "external_interaction",
        callArgs: {
          kind: "approval",
          request: { toolName: "Bash", input: { command: "mkdir -p demo" } },
        },
        result: bashResult,
      },
    ];
    expect(dedupeApprovalToolPieces(pieces)).toEqual([pieces[0]]);
  });

  it("keeps resolved approval when the paired tool row is missing", () => {
    const approvalResult = {
      id: "tr-approval",
      type: "toolResult" as const,
      toolCallId: "approval-1",
      toolName: "external_interaction",
      content: [{ type: "text", text: '{"action":"approve"}' }],
    };
    const pieces: RenderPiece[] = [
      {
        kind: "toolStep",
        callId: "approval-1",
        toolName: "external_interaction",
        callArgs: {
          kind: "approval",
          request: { toolName: "Bash", input: { command: "mkdir -p demo" } },
        },
        result: approvalResult,
      },
      { kind: "text", text: "目录已创建" },
    ];
    expect(dedupeApprovalToolPieces(pieces)).toEqual(pieces);
  });
});
