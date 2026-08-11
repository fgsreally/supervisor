import type { ChatEntry } from "@/types/chat-entry";
import type { TurnIndex } from "@/utils/message-storage";

const SUMMARY_MAX = 120;

function summarizeUserContent(content: unknown): string {
  if (typeof content === "string") {
    return content.replace(/\s+/g, " ").trim().slice(0, SUMMARY_MAX);
  }
  if (Array.isArray(content)) {
    const texts = content
      .filter(
        (part): part is { type: "text"; text: string } =>
          !!part &&
          typeof part === "object" &&
          (part as { type?: string }).type === "text" &&
          typeof (part as { text?: unknown }).text === "string",
      )
      .map((part) => part.text);
    const joined = texts.join(" ").replace(/\s+/g, " ").trim();
    if (joined) return joined.slice(0, SUMMARY_MAX);
    const hasImage = content.some(
      (part) => !!part && typeof part === "object" && (part as { type?: string }).type === "image",
    );
    if (hasImage) return "[图片]";
    const file = content.find(
      (part) => !!part && typeof part === "object" && (part as { type?: string }).type === "file",
    ) as { name?: string } | undefined;
    if (file?.name) return `[文件] ${file.name}`.slice(0, SUMMARY_MAX);
  }
  if (content && typeof content === "object" && "type" in content) {
    const part = content as { type?: string; name?: string };
    if (part.type === "file" && part.name) return `[文件] ${part.name}`.slice(0, SUMMARY_MAX);
  }
  return "(空消息)";
}

/**
 * Build minimap turn index from chat entries.
 * One tick = one user message (pairs with the following assistant group in the UI).
 */
export function chatEntriesToTurns(sessionId: string, entries: ChatEntry[]): TurnIndex[] {
  const turns: TurnIndex[] = [];
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message.role !== "user") continue;
    if (entry.injectedSource) continue;
    turns.push({
      sessionId,
      turnId: entry.id,
      userEntryId: entry.id,
      summary: summarizeUserContent(entry.message.content) || "(空消息)",
      createdAt: entry.createdAt ?? 0,
      roleHint: "user",
    });
  }
  return turns;
}
