import type { ChatEntry } from "@/types/chat-entry";
import type { TurnIndex } from "@/utils/message-storage";
import { translate as t } from "@/i18n";

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
    if (hasImage) return t("sessionTurns.image");
    const file = content.find(
      (part) => !!part && typeof part === "object" && (part as { type?: string }).type === "file",
    ) as { name?: string } | undefined;
    if (file?.name) return `${t("sessionTurns.filePrefix")} ${file.name}`.slice(0, SUMMARY_MAX);
  }
  if (content && typeof content === "object" && "type" in content) {
    const part = content as { type?: string; name?: string };
    if (part.type === "file" && part.name) return `${t("sessionTurns.filePrefix")} ${part.name}`.slice(0, SUMMARY_MAX);
  }
  return t("sessionTurns.empty");
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
      summary: summarizeUserContent(entry.message.content) || t("sessionTurns.empty"),
      createdAt: entry.createdAt ?? 0,
      roleHint: "user",
    });
  }
  return turns;
}
