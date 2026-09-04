import type { RenderPiece } from "./flatten-messages";

type ApprovalTarget = {
  toolName: string;
  input?: Record<string, unknown>;
};

function isExternalApprovalPiece(
  piece: RenderPiece,
): piece is Extract<RenderPiece, { kind: "toolStep" }> {
  if (piece.kind !== "toolStep") return false;
  if (piece.toolName !== "external_interaction" && piece.callArgs?.externalInteraction !== true) {
    return false;
  }
  return piece.callArgs?.kind !== "question";
}

export function approvalTargetFromArgs(callArgs?: Record<string, unknown>): ApprovalTarget | null {
  const request = callArgs?.request;
  if (!request || typeof request !== "object") return null;
  const toolName = (request as { toolName?: unknown }).toolName;
  if (typeof toolName !== "string" || !toolName.trim()) return null;
  const input = (request as { input?: unknown }).input;
  return {
    toolName: toolName.trim(),
    input: input && typeof input === "object" ? (input as Record<string, unknown>) : undefined,
  };
}

function bashCommandFromInput(input?: Record<string, unknown>): string | null {
  const command = input?.command;
  return typeof command === "string" && command.trim() ? command.trim() : null;
}

function toolPieceMatchesTarget(piece: RenderPiece, target: ApprovalTarget): boolean {
  const targetName = target.toolName.toLowerCase();
  if (targetName === "bash") {
    if (piece.kind === "bash") {
      const expected = bashCommandFromInput(target.input);
      if (expected && piece.command.trim() && piece.command.trim() !== expected) return false;
      return true;
    }
    if (piece.kind === "toolStep" && piece.toolName.toLowerCase() === "bash") {
      const expected = bashCommandFromInput(target.input);
      const command =
        typeof piece.callArgs?.command === "string" ? piece.callArgs.command.trim() : "";
      if (expected && command && command !== expected) return false;
      return true;
    }
    return false;
  }
  if (piece.kind !== "toolStep") return false;
  if (piece.toolName.toLowerCase() !== targetName) return false;
  return true;
}

function findMatchingToolIndex(
  pieces: RenderPiece[],
  approvalIndex: number,
  target: ApprovalTarget,
): number {
  for (let index = approvalIndex - 1; index >= 0; index -= 1) {
    const piece = pieces[index];
    if (!piece || piece.kind === "text" || piece.kind === "thinking") continue;
    if (toolPieceMatchesTarget(piece, target)) return index;
    if (piece.kind === "bash" || piece.kind === "toolStep") return -1;
  }
  return -1;
}

/** Pending approval hides the paired tool row; resolved approval drops only when that tool row exists. */
export function dedupeApprovalToolPieces(pieces: RenderPiece[]): RenderPiece[] {
  const hidden = new Set<number>();
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    if (!piece || !isExternalApprovalPiece(piece)) continue;
    const pending = !piece.result;
    const target = approvalTargetFromArgs(piece.callArgs);
    if (pending && target) {
      const matchIndex = findMatchingToolIndex(pieces, index, target);
      if (matchIndex >= 0) hidden.add(matchIndex);
      continue;
    }
    if (!pending && target) {
      const matchIndex = findMatchingToolIndex(pieces, index, target);
      if (matchIndex >= 0) hidden.add(index);
    }
  }
  return pieces.filter((_, index) => !hidden.has(index));
}

export function externalInteractionSummary(callArgs?: Record<string, unknown>): string {
  const target = approvalTargetFromArgs(callArgs);
  const command = bashCommandFromInput(target?.input);
  if (command) return command;
  const detail = typeof callArgs?.detail === "string" ? callArgs.detail.trim() : "";
  if (detail) return detail.split("\n").find(Boolean) ?? detail;
  const title = typeof callArgs?.title === "string" ? callArgs.title.trim() : "";
  return title || t("chat.external.viewRequestDetails");
}
import { translate as t } from "@/i18n";
