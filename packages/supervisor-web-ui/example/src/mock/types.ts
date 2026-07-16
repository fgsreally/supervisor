/** Copied from parent session via fork/clone. */
export type MockEntryBase = { isOld?: boolean };

export interface MockToolPart {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface MockTextPart {
  type: "text";
  text: string;
}

export interface MockUserFileAttachment {
  type: "file";
  name: string;
  size: string;
  ext?: "docx" | "pdf" | "xlsx" | "generic";
}

export type MockUserMessageContent = string | MockUserFileAttachment;

/** Matches pi `CompactionEntry` / supervisor SessionTreeEntry compaction. */
export type MockCompactionEntry = MockEntryBase & {
  id: string;
  type: "compaction";
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  reason?: "threshold" | "manual" | "overflow";
  details?: { readFiles?: string[]; modifiedFiles?: string[] };
};

export type MockEntry =
  | (MockEntryBase & { id: string; type: "system"; content: string })
  | (MockEntryBase & {
      id: string;
      type: "message";
      message:
        | { role: "user"; content: MockUserMessageContent }
        | { role: "assistant"; content: string | Array<MockTextPart | MockToolPart> }
        | { role: string; content: string | Array<MockTextPart | MockToolPart> };
    })
  | (MockEntryBase & {
      id: string;
      type: "toolResult";
      toolCallId: string;
      toolName: string;
      content: Array<{ type: string; text: string }>;
    })
  | MockCompactionEntry;
