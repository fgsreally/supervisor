import type { SessionTreeEntry } from "@earendil-works/pi-agent-core";

export interface MessageSearchFields {
  messageRole: string | null;
  searchText: string | null;
}

/** Plain text extracted from message / compaction entries for FTS indexing. */
export function extractMessageSearchFields(entry: SessionTreeEntry): MessageSearchFields {
  switch (entry.type) {
    case "message": {
      const role = entry.message.role;
      const content = "content" in entry.message ? entry.message.content : "";
      const searchText = extractAgentMessageText(content);
      return {
        messageRole: role,
        searchText: searchText.length > 0 ? searchText : null,
      };
    }
    case "compaction":
      return { messageRole: null, searchText: entry.summary.trim() || null };
    case "custom_message":
      if (!entry.display) return { messageRole: null, searchText: null };
      return {
        messageRole: "custom",
        searchText: extractAgentMessageText(entry.content) || null,
      };
    default:
      return { messageRole: null, searchText: null };
  }
}

function extractAgentMessageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const part of content) {
    if (part && typeof part === "object" && "type" in part) {
      if (part.type === "text" && "text" in part && typeof part.text === "string") {
        const text = part.text.trim();
        if (text) parts.push(text);
      }
    }
  }
  return parts.join("\n").trim();
}
