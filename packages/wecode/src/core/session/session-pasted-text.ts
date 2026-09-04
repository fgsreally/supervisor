import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { isSafeSessionAttachmentPath, type SessionAttachment } from "./session-attachments.js";
import { getSessionDir } from "./session-files.js";

export const PASTED_TEXT_INLINE_LIMIT = 200;
export const PASTED_TEXT_TOKEN_RE = /\uE000paste:([a-zA-Z0-9_-]+)\uE001/g;

export interface SessionPastedTextInput {
  id: string;
  text: string;
}

export type SessionPromptAttachment = Pick<
  SessionAttachment,
  "id" | "name" | "path" | "mimeType" | "size"
>;

export interface SessionPastedTextPart {
  id: string;
  chars: number;
  mode: "inline" | "attachment";
  text?: string;
  path?: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function writeSessionTextAttachment(
  projectId: number,
  sessionId: number,
  text: string,
): Promise<string> {
  const dir = join(getSessionDir(projectId, sessionId), "attachments");
  await mkdir(dir, { recursive: true });
  const name = `paste-${randomUUID()}.txt`;
  await writeFile(join(dir, name), text, "utf8");
  return `@/attachments/${name}`;
}

export async function buildSessionUserPrompt(
  projectId: number | null,
  sessionId: number,
  text: string,
  pastedTexts: SessionPastedTextInput[] = [],
  attachments: SessionPromptAttachment[] = [],
): Promise<{ message: string; parts: SessionPastedTextPart[] }> {
  if (!pastedTexts.length && !attachments.length) return { message: text, parts: [] };

  const byId = new Map(pastedTexts.map((item) => [item.id, item.text]));
  const attachmentsById = new Map(attachments.map((item) => [item.id, item]));
  const parts: SessionPastedTextPart[] = [];
  const xml: string[] = ["<user_prompt>"];
  let cursor = 0;
  PASTED_TEXT_TOKEN_RE.lastIndex = 0;
  const tokenRe = /\uE000(?:paste|attachment):([a-zA-Z0-9_-]+)\uE001/g;
  for (const match of text.matchAll(tokenRe)) {
    const index = match.index ?? 0;
    const id = match[1]!;
    if (index > cursor) xml.push(escapeXml(text.slice(cursor, index)));
    if (match[0].startsWith("\uE000paste:")) {
      const pasted = byId.get(id);
      if (pasted === undefined) {
        xml.push(escapeXml(match[0]));
      } else {
        const chars = Array.from(pasted).length;
        if (chars > PASTED_TEXT_INLINE_LIMIT) {
          if (projectId == null) throw new Error("session has no project for pasted attachment");
          const path = await writeSessionTextAttachment(projectId, sessionId, pasted);
          parts.push({ id, chars, mode: "attachment", path });
          xml.push(
            `<pasted_text id="${escapeXml(id)}" chars="${chars}" mode="attachment" path="${escapeXml(path)}" />`,
          );
        } else {
          parts.push({ id, chars, mode: "inline", text: pasted });
          xml.push(
            `<pasted_text id="${escapeXml(id)}" chars="${chars}" mode="inline">${escapeXml(pasted)}</pasted_text>`,
          );
        }
      }
    } else {
      const attachment = attachmentsById.get(id);
      if (!attachment || !isSafeSessionAttachmentPath(attachment.path)) {
        xml.push(escapeXml(match[0]));
      } else {
        xml.push(
          `<attachment id="${escapeXml(attachment.id)}" name="${escapeXml(attachment.name)}" mimeType="${escapeXml(attachment.mimeType)}" size="${attachment.size}" path="${escapeXml(attachment.path)}" />`,
        );
      }
    }
    cursor = index + match[0].length;
  }
  if (cursor < text.length) xml.push(escapeXml(text.slice(cursor)));
  xml.push("</user_prompt>");
  return { message: xml.join(""), parts };
}
