import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Append a plain-text line while keeping only the newest maxBytes of complete lines. */
export function appendRotatingTextLog(path: string, line: string, maxBytes: number): void {
  mkdirSync(dirname(path), { recursive: true });
  const normalized = line.endsWith("\n") ? line : `${line}\n`;
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/).filter(Boolean) : [];
  lines.push(normalized.trimEnd());

  while (lines.length > 1 && Buffer.byteLength(`${lines.join("\n")}\n`, "utf8") > maxBytes) {
    lines.shift();
  }

  let content = `${lines.join("\n")}\n`;
  if (Buffer.byteLength(content, "utf8") > maxBytes) {
    content = `${Buffer.from(content, "utf8").subarray(-maxBytes).toString("utf8")}`;
    const firstNewline = content.indexOf("\n");
    if (firstNewline >= 0) content = content.slice(firstNewline + 1);
  }
  writeFileSync(path, content, "utf8");
}

export function readRotatingTextLog(path: string, limit = 400): string {
  if (!existsSync(path)) return "";
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - limit)).join("\n");
}
