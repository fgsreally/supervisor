import { createWriteStream, existsSync, rmSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { ImageContent } from "@earendil-works/pi-ai";

const MEDIA_ROOT = join(homedir(), ".pi", "supervisor", "media");

export interface SessionPromptImage {
  mediaId: string;
  mimeType: string;
  name?: string;
}

export function getSupervisorMediaRoot(): string {
  return MEDIA_ROOT;
}

export function getSessionMediaDir(sessionId: string | number): string {
  return join(MEDIA_ROOT, String(sessionId));
}

export async function ensureSessionMediaDir(sessionId: string | number): Promise<string> {
  const dir = getSessionMediaDir(sessionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function removeSessionMediaDir(sessionId: string | number): Promise<void> {
  await rm(getSessionMediaDir(sessionId), { recursive: true, force: true });
}

export function removeSessionMediaDirSync(sessionId: string | number): void {
  rmSync(getSessionMediaDir(sessionId), { recursive: true, force: true });
}

const SAFE_MEDIA_ID = /^[a-zA-Z0-9._-]+$/;

export function isSafeMediaId(mediaId: string): boolean {
  return SAFE_MEDIA_ID.test(mediaId) && !mediaId.includes("..") && !mediaId.includes(sep);
}

export function resolveSessionMediaPath(sessionId: string | number, mediaId: string): string | null {
  if (!isSafeMediaId(mediaId)) return null;
  const root = resolve(getSessionMediaDir(sessionId));
  const full = resolve(root, mediaId);
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

export function mimeTypeFromFilename(filename: string): string {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".png":
    default:
      return "image/png";
  }
}

export function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    case "image/png":
    default:
      return ".png";
  }
}

function nextMediaId(mimeType: string, preferredName?: string): string {
  const fromName = preferredName ? extname(preferredName).toLowerCase() : "";
  const ext =
    fromName && fromName.length <= 8 ? fromName : extensionForMimeType(mimeType || "image/png");
  return `${randomUUID()}${ext.startsWith(".") ? ext : `.${ext}`}`;
}

export async function writeSessionMediaFile(
  sessionId: string | number,
  options: {
    mimeType: string;
    data: Buffer | Uint8Array;
    name?: string;
    mediaId?: string;
  },
): Promise<SessionPromptImage> {
  const dir = await ensureSessionMediaDir(sessionId);
  const mediaId = options.mediaId ?? nextMediaId(options.mimeType, options.name);
  if (!isSafeMediaId(mediaId)) throw new Error("invalid mediaId");
  const full = join(dir, mediaId);
  await writeFile(full, options.data);
  return {
    mediaId,
    mimeType: options.mimeType || mimeTypeFromFilename(mediaId),
    name: options.name,
  };
}

export async function writeSessionMediaFromStream(
  sessionId: string | number,
  options: {
    mimeType: string;
    stream: Readable;
    name?: string;
  },
): Promise<SessionPromptImage> {
  const dir = await ensureSessionMediaDir(sessionId);
  const mediaId = nextMediaId(options.mimeType, options.name);
  const full = join(dir, mediaId);
  await pipeline(options.stream, createWriteStream(full));
  return {
    mediaId,
    mimeType: options.mimeType || mimeTypeFromFilename(mediaId),
    name: options.name,
  };
}

export async function copyPathIntoSessionMedia(
  sessionId: string | number,
  sourcePath: string,
  options?: { name?: string; mimeType?: string },
): Promise<SessionPromptImage | null> {
  if (!existsSync(sourcePath)) return null;
  const mimeType = options?.mimeType ?? mimeTypeFromFilename(sourcePath);
  const mediaId = nextMediaId(mimeType, options?.name ?? basename(sourcePath));
  const dir = await ensureSessionMediaDir(sessionId);
  await copyFile(sourcePath, join(dir, mediaId));
  return {
    mediaId,
    mimeType,
    name: options?.name ?? basename(sourcePath),
  };
}

export async function writeDataUrlIntoSessionMedia(
  sessionId: string | number,
  dataUrl: string,
  options?: { name?: string },
): Promise<SessionPromptImage | null> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  const mimeType = match[1]!;
  const data = Buffer.from(match[2]!, "base64");
  return writeSessionMediaFile(sessionId, {
    mimeType,
    data,
    name: options?.name,
  });
}

export async function readSessionMediaFile(
  sessionId: string | number,
  mediaId: string,
): Promise<{ path: string; bytes: Buffer; mimeType: string } | null> {
  const path = resolveSessionMediaPath(sessionId, mediaId);
  if (!path || !existsSync(path)) return null;
  const bytes = await readFile(path);
  return { path, bytes, mimeType: mimeTypeFromFilename(mediaId) };
}

export async function resolveSessionPromptImages(
  sessionId: string | number,
  images: SessionPromptImage[],
): Promise<ImageContent[]> {
  const out: ImageContent[] = [];
  for (const image of images) {
    const file = await readSessionMediaFile(sessionId, image.mediaId);
    if (!file) throw new Error(`media not found: ${image.mediaId}`);
    out.push({
      type: "image",
      mimeType: image.mimeType || file.mimeType,
      data: file.bytes.toString("base64"),
    });
  }
  return out;
}
