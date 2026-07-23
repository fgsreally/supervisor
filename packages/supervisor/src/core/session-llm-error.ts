import { randomUUID } from "node:crypto";
import type { AgentHarnessEvent, AgentMessage, SessionTreeEntry } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import { isContextOverflow } from "@earendil-works/pi-ai";
import type { SQLiteSessionStorage } from "./session-storage.js";
import { overflowRecoveryAttempted } from "./compaction/rolling.js";

/** Timeline card for LLM failures — not sent to the model. */
export const LLM_ERROR_CUSTOM_TYPE = "llm_error";

export function findLastAssistantMessage(
  messages: AgentMessage[] | undefined,
): AssistantMessage | undefined {
  if (!messages?.length) return undefined;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role === "assistant") return message as AssistantMessage;
  }
  return undefined;
}

export function extractAgentEndLlmError(
  event: AgentHarnessEvent,
): AssistantMessage | undefined {
  if (event.type !== "agent_end") return undefined;
  const assistant = findLastAssistantMessage(event.messages);
  if (!assistant || assistant.stopReason !== "error") return undefined;
  return assistant;
}

/** True when rolling compaction will try an automatic overflow recovery on this turn. */
export function willAttemptOverflowRecovery(
  sessionId: string | number,
  assistant: AssistantMessage,
  model: Model | undefined,
): boolean {
  const contextWindow = model?.contextWindow ?? 0;
  if (!contextWindow) return false;
  if (!isContextOverflow(assistant, contextWindow)) return false;
  return !overflowRecoveryAttempted.has(String(sessionId));
}

export function formatLlmErrorMessage(assistant: AssistantMessage): string {
  const raw = assistant.errorMessage?.trim();
  if (raw) return raw.slice(0, 2000);
  return "模型调用失败，请重试";
}

export function assistantHasVisibleContent(message: {
  content?: unknown;
}): boolean {
  const content = message.content;
  if (typeof content === "string") return content.trim().length > 0;
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    if (!part || typeof part !== "object") return false;
    if ((part as { type?: string }).type === "text") {
      return typeof (part as { text?: string }).text === "string" &&
        (part as { text: string }).text.trim().length > 0;
    }
    if ((part as { type?: string }).type === "thinking") {
      return typeof (part as { thinking?: string }).thinking === "string" &&
        (part as { thinking: string }).thinking.trim().length > 0;
    }
    return (part as { type?: string }).type === "toolCall";
  });
}

export async function appendLlmErrorMessage(
  storage: Pick<SQLiteSessionStorage, "appendEntry" | "getLeafId" | "createEntryId">,
  content: string,
): Promise<string> {
  const text = content.trim() || "模型调用失败，请重试";
  const id = await storage.createEntryId().catch(() => randomUUID());
  const parentId = await storage.getLeafId();
  const entry = {
    id,
    parentId,
    timestamp: new Date().toISOString(),
    type: "custom",
    customType: LLM_ERROR_CUSTOM_TYPE,
    data: { text },
  } as SessionTreeEntry;
  await storage.appendEntry(entry);
  return id;
}
