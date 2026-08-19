import type { ChatAttachmentPart, ChatPastedTextPart } from "@/types/chat-entry";

export type UserPromptPart =
  | { type: "text"; text: string }
  | ChatPastedTextPart
  | ChatAttachmentPart;

const USER_PROMPT_RE = /^<user_prompt>([\s\S]*)<\/user_prompt>$/;
const PART_RE =
  /<text>([\s\S]*?)<\/text>|<pasted_text\b([^>]*)\/>|<pasted_text\b([^>]*)>([\s\S]*?)<\/pasted_text>|<attachment\b([^>]*)\/>/g;

function decodeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function attr(attrs: string, name: string): string | undefined {
  const match = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return match?.[1] ? decodeXml(match[1]) : undefined;
}

export function parseUserPrompt(content: unknown): UserPromptPart[] {
  if (typeof content !== "string") return [];
  const wrapped = USER_PROMPT_RE.exec(content);
  if (!wrapped) return [{ type: "text", text: content }];

  const parts: UserPromptPart[] = [];
  const body = wrapped[1];
  let cursor = 0;
  PART_RE.lastIndex = 0;
  for (const match of body.matchAll(PART_RE)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push({ type: "text", text: decodeXml(body.slice(cursor, index)) });
    }
    if (match[1] !== undefined) {
      if (match[1]) parts.push({ type: "text", text: decodeXml(match[1]) });
      cursor = index + match[0].length;
      continue;
    }
    if (match[5] !== undefined) {
      const attrs = match[5];
      const id = attr(attrs, "id");
      const name = attr(attrs, "name");
      const path = attr(attrs, "path");
      const mimeType = attr(attrs, "mimeType");
      const size = Number(attr(attrs, "size"));
      if (id && name && path && mimeType && Number.isFinite(size)) {
        parts.push({ type: "attachment", id, name, path, mimeType, size });
      }
      cursor = index + match[0].length;
      continue;
    }
    const attrs = match[2] ?? match[3] ?? "";
    const id = attr(attrs, "id");
    const mode = attr(attrs, "mode");
    const chars = Number(attr(attrs, "chars"));
    if (!id || (mode !== "inline" && mode !== "attachment") || !Number.isFinite(chars)) continue;
    const text = match[4] === undefined ? undefined : decodeXml(match[4]);
    parts.push({
      type: "pasted_text",
      id,
      chars,
      mode,
      ...(text === undefined ? {} : { text }),
      ...(attr(attrs, "path") ? { path: attr(attrs, "path") } : {}),
    });
    cursor = index + match[0].length;
  }
  if (cursor < body.length) {
    parts.push({ type: "text", text: decodeXml(body.slice(cursor)) });
  }
  return parts.length ? parts : [{ type: "text", text: content }];
}

export function ordinaryUserPromptText(content: unknown): string {
  return parseUserPrompt(content)
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function pastedUserPromptParts(content: unknown): ChatPastedTextPart[] {
  return parseUserPrompt(content).filter(
    (part): part is ChatPastedTextPart => part.type === "pasted_text",
  );
}

export function attachmentUserPromptParts(content: unknown): ChatAttachmentPart[] {
  return parseUserPrompt(content).filter(
    (part): part is ChatAttachmentPart => part.type === "attachment",
  );
}

export function makePastedTextToken(id: string): string {
  return `\uE000paste:${id}\uE001`;
}

export function makeAttachmentToken(id: string): string {
  return `\uE000attachment:${id}\uE001`;
}

export function buildOptimisticUserParts(
  text: string,
  pastedTexts: Array<{ id: string; text: string; chars: number }>,
  attachments: Array<{
    id: string;
    name: string;
    path: string;
    mimeType: string;
    size: number;
  }> = [],
): Array<{ type: "text"; text: string } | ChatPastedTextPart | ChatAttachmentPart> {
  const byId = new Map(pastedTexts.map((item) => [item.id, item]));
  const attachmentsById = new Map(attachments.map((item) => [item.id, item]));
  const tokenRe = /\uE000(?:paste|attachment):([a-zA-Z0-9_-]+)\uE001/g;
  const parts: Array<{ type: "text"; text: string } | ChatPastedTextPart | ChatAttachmentPart> = [];
  let cursor = 0;
  for (const match of text.matchAll(tokenRe)) {
    if (match.index! > cursor) parts.push({ type: "text", text: text.slice(cursor, match.index) });
    const item = byId.get(match[1]!);
    const attachment = attachmentsById.get(match[1]!);
    if (match[0].startsWith("\uE000paste:") && item)
      parts.push({
        type: "pasted_text",
        id: item.id,
        chars: item.chars,
        mode: "inline",
        text: item.text,
      });
    else if (match[0].startsWith("\uE000attachment:") && attachment)
      parts.push({
        type: "attachment",
        id: attachment.id,
        name: attachment.name,
        path: attachment.path,
        mimeType: attachment.mimeType,
        size: attachment.size,
      });
    else parts.push({ type: "text", text: match[0] });
    cursor = match.index! + match[0].length;
  }
  if (cursor < text.length) parts.push({ type: "text", text: text.slice(cursor) });
  return parts.length ? parts : [{ type: "text", text }];
}
