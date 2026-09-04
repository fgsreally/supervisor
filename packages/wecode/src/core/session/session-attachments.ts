import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { getSessionDir } from "./session-files.js";

export interface SessionAttachment {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
}

const SAFE_ATTACHMENT_NAME = /^[a-zA-Z0-9._-]+$/;

export function isSafeSessionAttachmentPath(path: string): boolean {
  return /^@\/attachments\/[a-zA-Z0-9._-]+$/.test(path);
}

export async function writeSessionAttachment(
  projectId: string | number,
  sessionId: string | number,
  input: { name?: string; mimeType?: string; data: Buffer | Uint8Array },
): Promise<SessionAttachment> {
  const originalName = basename(input.name || "attachment");
  const safeName = SAFE_ATTACHMENT_NAME.test(originalName)
    ? originalName
    : originalName.replace(/[^a-zA-Z0-9._-]+/g, "_") || "attachment";
  const filename = `attachment-${randomUUID()}-${safeName}`;
  const dir = join(getSessionDir(projectId, sessionId), "attachments");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), input.data);
  return {
    id: randomUUID(),
    name: originalName,
    path: `@/attachments/${filename}`,
    mimeType: input.mimeType || "application/octet-stream",
    size: input.data.byteLength,
  };
}
