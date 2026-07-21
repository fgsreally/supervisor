/** Chat message tree entries used by the UI rendering pipeline. */

export type AssetScope = "project" | "agent" | "session";

export interface MessageAsset {
  scope: AssetScope;
  path: string;
  name?: string;
  mediaType?: string;
}

export type ChatEntryBase = {
  isOld?: boolean;
  createdAt?: number;
  assets?: MessageAsset[];
  deliveryState?: "queued" | "failed";
  slashSource?: "skill" | "prompt" | "custom" | "mcp";
  shadowSource?: string;
};

export interface ChatToolPart {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatThinkingPart {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
}

export interface ChatTextPart {
  type: "text";
  text: string;
}

export interface ChatUserFileAttachment {
  type: "file";
  name: string;
  size: string;
  ext?: "docx" | "pdf" | "xlsx" | "generic";
}

export type ChatUserMessageContent = string | ChatUserFileAttachment;

export type ChatCompactionEntry = ChatEntryBase & {
  id: string;
  type: "compaction";
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  reason?: "threshold" | "manual" | "overflow";
  details?: { readFiles?: string[]; modifiedFiles?: string[] };
};

export type ChatEntry =
  | (ChatEntryBase & { id: string; type: "system"; content: string })
  | (ChatEntryBase & {
      id: string;
      type: "slash";
      direction: "input" | "output";
      content: string;
      isError?: boolean;
    })
  | (ChatEntryBase & {
      id: string;
      type: "message";
      message:
        | { role: "user"; content: ChatUserMessageContent }
        | {
            role: "assistant";
            content: string | Array<ChatTextPart | ChatThinkingPart | ChatToolPart>;
          }
        | { role: string; content: string | Array<ChatTextPart | ChatThinkingPart | ChatToolPart> };
    })
  | (ChatEntryBase & {
      id: string;
      type: "toolResult";
      toolCallId: string;
      toolName: string;
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
      details?: unknown;
    })
  | ChatCompactionEntry;
