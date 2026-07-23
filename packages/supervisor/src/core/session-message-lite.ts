import type { SessionMessageResponse } from "../types.js";

/** Soft caps for list payloads; full content stays in DB / detail endpoint. */
export const LITE_TEXT_CHARS = 4_000;
export const LITE_TOOL_RESULT_CHARS = 1_500;
export const LITE_ARG_STRING_CHARS = 500;

type ContentPart = { type: string; text?: string; thinking?: string; data?: unknown; arguments?: unknown; [key: string]: unknown };

function truncateText(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}\n…`, truncated: true };
}

function truncateArgValue(value: unknown): unknown {
  if (typeof value === "string") {
    const { text, truncated } = truncateText(value, LITE_ARG_STRING_CHARS);
    return truncated ? text : value;
  }
  if (Array.isArray(value)) return value.map(truncateArgValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = truncateArgValue(child);
    }
    return out;
  }
  return value;
}

function liteContentParts(parts: ContentPart[], textMax: number): {
  parts: ContentPart[];
  truncated: boolean;
} {
  let truncated = false;
  const next = parts.map((part) => {
    if (part.type === "image") {
      truncated = truncated || typeof part.data === "string" && part.data.length > 0;
      const { data: _data, ...rest } = part;
      return { ...rest, data: "", truncated: true };
    }
    if (part.type === "thinking" && typeof part.thinking === "string") {
      const { text, truncated: cut } = truncateText(part.thinking, textMax);
      truncated = truncated || cut;
      return { ...part, thinking: text, ...(cut ? { truncated: true } : {}) };
    }
    if (typeof part.text === "string") {
      const { text, truncated: cut } = truncateText(part.text, textMax);
      truncated = truncated || cut;
      return { ...part, text, ...(cut ? { truncated: true } : {}) };
    }
    if (part.type === "toolCall" && part.arguments && typeof part.arguments === "object") {
      return {
        ...part,
        arguments: truncateArgValue(part.arguments),
      };
    }
    return part;
  });
  return { parts: next, truncated };
}

/**
 * Shrink a session message for chat list transfer.
 * Marks `meta.liteTruncated` when content was cut; clients may fetch detail by entry id.
 */
export function toLiteSessionMessage(message: SessionMessageResponse): SessionMessageResponse {
  const meta = { ...(message.meta ?? {}) };
  let truncated = false;

  if (message.type === "message" && message.message) {
    const content = message.message.content;
    if (typeof content === "string") {
      const { text, truncated: cut } = truncateText(content, LITE_TEXT_CHARS);
      truncated = cut;
      return {
        ...message,
        message: { ...message.message, content: text },
        meta: truncated ? { ...meta, liteTruncated: true } : meta,
      };
    }
    if (Array.isArray(content)) {
      const { parts, truncated: cut } = liteContentParts(content as ContentPart[], LITE_TEXT_CHARS);
      truncated = cut;
      return {
        ...message,
        message: {
          ...message.message,
          content: parts as typeof content,
        },
        meta: truncated ? { ...meta, liteTruncated: true } : meta,
      };
    }
  }

  if (message.type === "toolResult") {
    const raw = message as SessionMessageResponse & {
      content?: ContentPart[];
      details?: unknown;
    };
    const content = Array.isArray(raw.content) ? raw.content : [];
    const { parts, truncated: cut } = liteContentParts(content, LITE_TOOL_RESULT_CHARS);
    truncated = cut || raw.details !== undefined;
    const { details: _details, ...rest } = raw;
    return {
      ...rest,
      content: parts,
      meta: truncated ? { ...meta, liteTruncated: true } : meta,
    } as SessionMessageResponse;
  }

  if (message.type === "compaction" && typeof message.summary === "string") {
    const { text, truncated: cut } = truncateText(message.summary, LITE_TEXT_CHARS);
    truncated = cut;
    return {
      ...message,
      summary: text,
      meta: truncated ? { ...meta, liteTruncated: true } : meta,
    };
  }

  return message;
}
