import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, normalize, relative, resolve, sep } from "node:path";
import { listWorkspaceFiles, type WorkspaceFileEntry } from "./workspace-files.js";

const MAX_TEXT_BYTES = 1.5 * 1024 * 1024;
const MAX_BINARY_BYTES = 8 * 1024 * 1024;

const TEXT_EXT = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".jsonc",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".less",
  ".html",
  ".htm",
  ".xml",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".bat",
  ".cmd",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cs",
  ".php",
  ".sql",
  ".graphql",
  ".vue",
  ".svelte",
  ".astro",
  ".svg",
  ".csv",
  ".tsv",
  ".log",
  ".gitignore",
  ".dockerignore",
  ".editorconfig",
  ".prettierrc",
  ".eslintrc",
  ".npmrc",
  ".lock",
]);

const IMAGE_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".avif",
]);

const PDF_EXT = new Set([".pdf"]);

export type SessionFileKind = "text" | "markdown" | "json" | "code" | "image" | "pdf" | "binary";

export interface SessionFileContent {
  path: string;
  kind: SessionFileKind;
  size: number;
  encoding: "utf8" | "base64" | "none";
  content: string | null;
  mimeType: string;
  truncated?: boolean;
  language?: string;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function resolveUnderRoot(root: string, relPath: string): string {
  const rootAbs = normalize(resolve(root));
  const cleaned = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("\0")) {
    throw new Error("invalid path");
  }
  const abs = normalize(resolve(rootAbs, cleaned));
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    throw new Error("path is outside session workspace");
  }
  return abs;
}

function detectKind(path: string): { kind: SessionFileKind; language?: string; mimeType: string } {
  const ext = extname(path).toLowerCase();
  if (IMAGE_EXT.has(ext)) {
    const mime =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".svg"
          ? "image/svg+xml"
          : `image/${ext.slice(1)}`;
    return { kind: "image", mimeType: mime };
  }
  if (PDF_EXT.has(ext)) return { kind: "pdf", mimeType: "application/pdf" };
  if (ext === ".md" || ext === ".markdown") {
    return { kind: "markdown", language: "markdown", mimeType: "text/markdown" };
  }
  if (ext === ".json" || ext === ".jsonc") {
    return { kind: "json", language: "json", mimeType: "application/json" };
  }
  if (TEXT_EXT.has(ext) || !ext) {
    const language = ext ? ext.slice(1) : "text";
    const codeLike = [
      "js",
      "jsx",
      "ts",
      "tsx",
      "py",
      "go",
      "rs",
      "java",
      "vue",
      "css",
      "html",
      "sql",
      "sh",
    ].includes(language);
    return {
      kind: codeLike ? "code" : "text",
      language,
      mimeType: "text/plain",
    };
  }
  return { kind: "binary", mimeType: "application/octet-stream" };
}

function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length < 0.1;
}

/** List files under the session cwd for the files panel. */
export function listSessionWorkspaceFiles(cwd: string): WorkspaceFileEntry[] {
  return listWorkspaceFiles(cwd);
}

/** Read a file relative to session cwd with kind detection for UI preview. */
export function readSessionWorkspaceFile(cwd: string, relPath: string): SessionFileContent {
  const abs = resolveUnderRoot(cwd, relPath);
  if (!existsSync(abs)) throw new Error("file not found");
  const st = statSync(abs);
  if (!st.isFile()) throw new Error("not a file");

  const path = toPosix(relative(normalize(resolve(cwd)), abs));
  const detected = detectKind(path);
  const size = st.size;

  if (detected.kind === "image" || detected.kind === "pdf") {
    if (size > MAX_BINARY_BYTES) {
      return {
        path,
        kind: detected.kind,
        size,
        encoding: "none",
        content: null,
        mimeType: detected.mimeType,
        truncated: true,
      };
    }
    const buf = readFileSync(abs);
    return {
      path,
      kind: detected.kind,
      size,
      encoding: "base64",
      content: buf.toString("base64"),
      mimeType: detected.mimeType,
    };
  }

  if (detected.kind === "binary") {
    const buf = readFileSync(abs, { flag: "r" }).subarray(0, Math.min(size, 64 * 1024));
    if (looksLikeText(buf) && size <= MAX_TEXT_BYTES) {
      const full = readFileSync(abs);
      return {
        path,
        kind: "text",
        size,
        encoding: "utf8",
        content: full.toString("utf8"),
        mimeType: "text/plain",
        language: "text",
      };
    }
    return {
      path,
      kind: "binary",
      size,
      encoding: "none",
      content: null,
      mimeType: detected.mimeType,
    };
  }

  if (size > MAX_TEXT_BYTES) {
    const buf = readFileSync(abs).subarray(0, MAX_TEXT_BYTES);
    return {
      path,
      kind: detected.kind,
      size,
      encoding: "utf8",
      content: `${buf.toString("utf8")}\n\n…（已截断，文件过大）`,
      mimeType: detected.mimeType,
      language: detected.language,
      truncated: true,
    };
  }

  const content = readFileSync(abs, "utf8");
  return {
    path,
    kind: detected.kind,
    size,
    encoding: "utf8",
    content,
    mimeType: detected.mimeType,
    language: detected.language,
  };
}
