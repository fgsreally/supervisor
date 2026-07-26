import { randomUUID } from "node:crypto";
import type { AgentMessage, SessionTreeEntry } from "@earendil-works/pi-agent-core";
import type { SQLiteSessionStorage } from "../session-storage.js";

type AssistantContentPart =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> };

type BufferedPart =
  | { kind: "text"; text: string }
  | { kind: "thinking"; thinking: string }
  | { kind: "toolCall"; id: string; name: string; args: Record<string, unknown> }
  | { kind: "toolResult"; toolCallId: string; name: string; result: unknown; isError: boolean };

function normalizeToolResult(result: unknown): {
  content: Array<{ type: string; text: string }>;
  details?: unknown;
} {
  if (typeof result === "string") {
    return { content: [{ type: "text", text: result }] };
  }
  if (result && typeof result === "object" && "content" in result) {
    const record = result as { content: unknown; details?: unknown };
    const content = Array.isArray(record.content)
      ? (record.content as Array<{ type: string; text: string }>)
      : [{ type: "text", text: JSON.stringify(result, null, 2) }];
    return {
      content,
      ...(record.details !== undefined ? { details: record.details } : {}),
    };
  }
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

/** Buffers an external-agent turn and persists tool calls/results like native agents. */
export class ExternalTurnBuffer {
  private parts: BufferedPart[] = [];

  reset(): void {
    this.parts = [];
  }

  appendText(delta: string): void {
    if (!delta) return;
    const last = this.parts[this.parts.length - 1];
    if (last?.kind === "text") {
      last.text += delta;
    } else {
      this.parts.push({ kind: "text", text: delta });
    }
  }

  appendThinking(delta: string): void {
    if (!delta) return;
    const last = this.parts[this.parts.length - 1];
    if (last?.kind === "thinking") {
      last.thinking += delta;
    } else {
      this.parts.push({ kind: "thinking", thinking: delta });
    }
  }

  recordToolStart(id: string, name: string, args: unknown): void {
    this.parts.push({
      kind: "toolCall",
      id,
      name,
      args: (args && typeof args === "object" ? args : {}) as Record<string, unknown>,
    });
  }

  recordToolEnd(id: string, name: string, result: unknown, isError: boolean): void {
    this.parts.push({ kind: "toolResult", toolCallId: id, name, result, isError });
  }

  get plainText(): string {
    return this.parts
      .filter((part): part is Extract<BufferedPart, { kind: "text" }> => part.kind === "text")
      .map((part) => part.text)
      .join("");
  }

  hasTools(): boolean {
    return this.parts.some((part) => part.kind === "toolCall" || part.kind === "toolResult");
  }

  async persist(storage: SQLiteSessionStorage, userId: string): Promise<void> {
    if (this.parts.length === 0) return;

    if (!this.hasTools()) {
      const text = this.plainText.trim();
      if (!text) return;
      await storage.appendEntry({
        id: randomUUID(),
        parentId: userId,
        timestamp: new Date().toISOString(),
        type: "message",
        message: { role: "assistant", content: text, timestamp: Date.now() } as AgentMessage,
      } as SessionTreeEntry);
      return;
    }

    let parentId = userId;
    let assistantBuffer: AssistantContentPart[] = [];

    const flushAssistant = async (): Promise<void> => {
      if (assistantBuffer.length === 0) return;
      const id = randomUUID();
      await storage.appendEntry({
        id,
        parentId,
        timestamp: new Date().toISOString(),
        type: "message",
        message: {
          role: "assistant",
          content: assistantBuffer,
          timestamp: Date.now(),
        } as AgentMessage,
      } as SessionTreeEntry);
      parentId = id;
      assistantBuffer = [];
    };

    for (const part of this.parts) {
      if (part.kind === "toolResult") {
        await flushAssistant();
        const normalized = normalizeToolResult(part.result);
        const id = randomUUID();
        await storage.appendEntry({
          id,
          parentId,
          timestamp: new Date().toISOString(),
          type: "message",
          message: {
            role: "toolResult",
            toolCallId: part.toolCallId,
            toolName: part.name,
            content: normalized.content,
            isError: part.isError,
            timestamp: Date.now(),
            ...(normalized.details !== undefined ? { details: normalized.details } : {}),
          } as AgentMessage,
        } as SessionTreeEntry);
        parentId = id;
        continue;
      }
      if (part.kind === "text") {
        assistantBuffer.push({ type: "text", text: part.text });
      } else if (part.kind === "thinking") {
        assistantBuffer.push({ type: "thinking", thinking: part.thinking });
      } else if (part.kind === "toolCall") {
        assistantBuffer.push({
          type: "toolCall",
          id: part.id,
          name: part.name,
          arguments: part.args,
        });
      }
    }
    await flushAssistant();
  }
}
