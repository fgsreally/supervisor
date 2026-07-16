import type { MessageEntry } from "@earendil-works/pi-supervisor";
import type { HindsightMessage } from "./content.js";

export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
      ) {
        return (block as { text: string }).text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function entriesToHindsightMessages(entries: MessageEntry[]): HindsightMessage[] {
  return entries
    .filter(
      (entry) => entry.type === "message" && (entry.role === "user" || entry.role === "assistant"),
    )
    .map((entry) => ({
      role: entry.role!,
      content: entry.content ?? "",
    }));
}

export function harnessMessagesToHindsight(messages: unknown[]): HindsightMessage[] {
  const result: HindsightMessage[] = [];
  for (const message of messages) {
    const item = message as { role?: unknown; content?: unknown };
    if (item.role !== "user" && item.role !== "assistant") continue;
    const content = extractTextContent(item.content);
    if (!content.trim()) continue;
    result.push({ role: String(item.role), content });
  }
  return result;
}
