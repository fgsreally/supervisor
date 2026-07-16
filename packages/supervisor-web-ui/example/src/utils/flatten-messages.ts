import type { MockEntry } from "../mock/types";
import { isOldEntry } from "./session-branch";

export type ToolResultEntry = Extract<MockEntry, { type: "toolResult" }>;

export type RenderPiece =
  | { kind: "text"; text: string }
  | {
      kind: "toolStep";
      callId: string;
      toolName: string;
      callArgs?: Record<string, unknown>;
      result?: ToolResultEntry;
    }
  | {
      kind: "bash";
      callId: string;
      command: string;
      intent?: string;
      result?: ToolResultEntry;
    };

export type DisplayGroup =
  | MockEntry
  | {
      id: string;
      type: "grouped_assistant";
      role: "assistant";
      pieces: RenderPiece[];
      /** True when message was copied from parent session (is_old). */
      inherited?: boolean;
    };

function attachResult(pieces: RenderPiece[], result: ToolResultEntry) {
  const bash = pieces.find(
    (p): p is Extract<RenderPiece, { kind: "bash" }> =>
      p.kind === "bash" && p.callId === result.toolCallId,
  );
  if (bash) {
    bash.result = result;
    return;
  }
  const step = pieces.find(
    (p): p is Extract<RenderPiece, { kind: "toolStep" }> =>
      p.kind === "toolStep" && p.callId === result.toolCallId,
  );
  if (step) {
    step.result = result;
    return;
  }
  pieces.push({
    kind: "toolStep",
    callId: result.toolCallId,
    toolName: result.toolName,
    result,
  });
}

function appendMessagePieces(
  pieces: RenderPiece[],
  entry: Extract<MockEntry, { type: "message" }>,
) {
  const content = entry.message.content;
  if (typeof content === "string") {
    pieces.push({ kind: "text", text: content });
    return;
  }
  if (!Array.isArray(content)) return;

  for (const part of content) {
    if (part.type === "text") {
      pieces.push({ kind: "text", text: part.text });
    } else if (part.type === "toolCall" && part.name === "bash") {
      const command = typeof part.arguments.command === "string" ? part.arguments.command : "";
      const intent = typeof part.arguments.intent === "string" ? part.arguments.intent : undefined;
      pieces.push({ kind: "bash", callId: part.id, command, intent });
    } else if (part.type === "toolCall") {
      pieces.push({
        kind: "toolStep",
        callId: part.id,
        toolName: part.name,
        callArgs: part.arguments,
      });
    }
  }
}

/** One assistant bubble per user turn; tool results inline with calls. */
export function buildDisplayGroups(entries: MockEntry[]): DisplayGroup[] {
  const groups: DisplayGroup[] = [];
  let current: Extract<DisplayGroup, { type: "grouped_assistant" }> | null = null;

  const flushAssistant = () => {
    if (current && current.pieces.length > 0) groups.push(current);
    current = null;
  };

  for (const entry of entries) {
    if (entry.type === "compaction") {
      flushAssistant();
      groups.push(entry);
      continue;
    }

    if (entry.type === "system") {
      flushAssistant();
      groups.push(entry);
      continue;
    }

    if (entry.type === "message" && entry.message.role === "user") {
      flushAssistant();
      groups.push(entry);
      continue;
    }

    if (entry.type === "toolResult") {
      if (!current) {
        current = { id: entry.id, type: "grouped_assistant", role: "assistant", pieces: [] };
      }
      if (isOldEntry(entry)) current.inherited = true;
      attachResult(current.pieces, entry);
      continue;
    }

    if (entry.type === "message") {
      if (!current) {
        current = { id: entry.id, type: "grouped_assistant", role: "assistant", pieces: [] };
      }
      if (isOldEntry(entry)) current.inherited = true;
      appendMessagePieces(current.pieces, entry);
    }
  }

  flushAssistant();
  return groups;
}

export function isGroupedAssistantGroup(
  group: DisplayGroup,
): group is Extract<DisplayGroup, { type: "grouped_assistant" }> {
  return group.type === "grouped_assistant" && "pieces" in group;
}

export function isDisplayGroupInherited(group: DisplayGroup): boolean {
  if (isGroupedAssistantGroup(group)) return !!group.inherited;
  return isOldEntry(group);
}

export function spawnChildSessionId(pieces: RenderPiece[], toolCallId: string): string | undefined {
  const step = pieces.find((p) => p.kind === "toolStep" && p.callId === toolCallId);
  if (!step || step.kind !== "toolStep") return undefined;

  // Prefer sessionId from tool result JSON (real API format)
  if (step.result?.content) {
    for (const part of step.result.content) {
      if (part.type === "text" && part.text) {
        try {
          const parsed = JSON.parse(part.text);
          if (typeof parsed?.sessionId === "string") return parsed.sessionId;
        } catch {
          // not JSON, continue
        }
      }
    }
  }

  // Fallback: childSessionId in callArgs (mock format)
  const id = step.callArgs?.childSessionId;
  return typeof id === "string" ? id : undefined;
}
