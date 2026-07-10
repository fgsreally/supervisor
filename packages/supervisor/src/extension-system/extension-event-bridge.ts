import type { AgentHarnessEvent, AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import type { ExtensionEvent, MessageContent, ToolInfo, ToolDefinition } from "./types.js";
import type { TSchema } from "typebox";

export function agentToolToToolInfo(tool: AgentTool): ToolInfo {
  return {
    name: tool.name,
    description: tool.description ?? tool.name,
    parameters: tool.parameters as TSchema,
    source: "builtin",
    definition: tool as unknown as ToolDefinition<TSchema, unknown>,
  };
}

export function mergeSessionToolInfos(
  builtinTools: AgentTool[],
  extensionTools: ToolInfo[],
): ToolInfo[] {
  const merged = new Map<string, ToolInfo>();
  for (const tool of builtinTools) {
    merged.set(tool.name, agentToolToToolInfo(tool));
  }
  for (const tool of extensionTools) {
    merged.set(tool.name, tool);
  }
  return [...merged.values()];
}

function messageText(content: AgentMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function toMessageContent(content: AgentMessage["content"]): MessageContent[] {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : [];
  }
  return content
    .filter((part) => part.type === "text" || part.type === "thinking")
    .map((part) =>
      part.type === "text"
        ? { type: "text" as const, text: part.text }
        : { type: "thinking" as const, text: part.text },
    );
}

export function mapHarnessEventToExtensionEvents(
  event: AgentHarnessEvent,
  sessionId: number,
  options?: { previousMessageCount?: number },
): ExtensionEvent[] {
  const now = Date.now();
  const events: ExtensionEvent[] = [];

  switch (event.type) {
    case "tool_execution_start":
      events.push({
        type: "message.tool_call",
        toolCallId: event.toolCallId,
        name: event.toolName,
        args: event.args,
        entryId: "",
        timestamp: now,
      });
      break;

    case "tool_execution_end":
      events.push({
        type: "message.tool_result",
        toolCallId: event.toolCallId,
        result: event.result,
        isError: Boolean(event.isError),
        entryId: "",
        timestamp: now,
      });
      break;

    case "agent_end": {
      const messages = event.messages ?? [];
      const start = options?.previousMessageCount ?? 0;
      for (let i = start; i < messages.length; i++) {
        const message = messages[i] as AgentMessage;
        const entryId = `agent-${i}`;
        const messageId = entryId;
        if (message.role === "user") {
          events.push({
            type: "message.user",
            text: messageText(message.content),
            messageId,
            entryId,
            timestamp: now,
          });
        } else if (message.role === "assistant") {
          events.push({
            type: "message.assistant",
            messageId,
            entryId,
            content: toMessageContent(message.content),
            stopReason: event.stopReason,
            timestamp: now,
          });
        }
      }
      break;
    }

    default:
      break;
  }

  void sessionId;
  return events;
}
