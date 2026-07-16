/** VS Code–style file icons (colored badges, extension-aware). */

export type FileIconKind =
  | "folder"
  | "typescript"
  | "javascript"
  | "vue"
  | "react"
  | "html"
  | "css"
  | "json"
  | "markdown"
  | "yaml"
  | "python"
  | "rust"
  | "go"
  | "shell"
  | "docker"
  | "git"
  | "image"
  | "pdf"
  | "lock"
  | "config"
  | "generic";

export function getFileIconKind(path: string, isDirectory = false): FileIconKind {
  if (isDirectory || path.endsWith("/")) return "folder";
  const base = path.split("/").pop() ?? path;
  const lower = base.toLowerCase();

  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) return "docker";
  if (lower === ".gitignore" || lower === ".gitattributes" || lower === ".gitmodules") return "git";
  if (lower.endsWith(".lock") || lower === "package-lock.json" || lower === "pnpm-lock.yaml")
    return "lock";

  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "generic";
  const ext = base.slice(dot + 1).toLowerCase();

  switch (ext) {
    case "ts":
    case "mts":
    case "cts":
      return "typescript";
    case "tsx":
    case "jsx":
      return "react";
    case "js":
    case "mjs":
    case "cjs":
      return "javascript";
    case "vue":
      return "vue";
    case "html":
    case "htm":
      return "html";
    case "css":
    case "scss":
    case "sass":
    case "less":
      return "css";
    case "md":
    case "mdx":
    case "markdown":
      return "markdown";
    case "json":
    case "jsonc":
    case "jsonl":
      return "json";
    case "yaml":
    case "yml":
    case "toml":
      return "yaml";
    case "py":
    case "pyw":
    case "pyi":
      return "python";
    case "rs":
      return "rust";
    case "go":
      return "go";
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
    case "ps1":
      return "shell";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
    case "ico":
    case "bmp":
      return "image";
    case "pdf":
      return "pdf";
    case "ini":
    case "cfg":
    case "conf":
    case "env":
      return "config";
    default:
      return "generic";
  }
}

export function getFilePathFromToken(token: string): string {
  if (token.startsWith('@"') && token.endsWith('"')) return token.slice(2, -1);
  if (token.startsWith("@")) return token.slice(1);
  return token;
}

export function getFileBaseName(path: string): string {
  const normalized = path.replace(/\/$/, "");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

export function getSkillNameFromToken(token: string): string {
  const match = token.match(/^\/skill:([\w-]+)/);
  if (match?.[1]) return match[1];
  return token.replace(/^\/skill:/, "").replace(/^\//, "");
}

export function fileIconSvgFromPath(path: string, isDirectory = false): string {
  return fileIconSvg(getFileIconKind(path, isDirectory));
}

export function fileIconNameFromPath(path: string, isDirectory = false): string {
  return fileIconName(getFileIconKind(path, isDirectory));
}

/** Real VS Code file icon theme ids (vscode-icons set via Iconify). */
export function fileIconName(kind: FileIconKind): string {
  switch (kind) {
    case "folder":
      return "vscode-icons:default-folder";
    case "typescript":
      return "vscode-icons:file-type-typescript";
    case "javascript":
      return "vscode-icons:file-type-js";
    case "vue":
      return "vscode-icons:file-type-vue";
    case "react":
      return "vscode-icons:file-type-reactjs";
    case "html":
      return "vscode-icons:file-type-html";
    case "css":
      return "vscode-icons:file-type-css";
    case "json":
      return "vscode-icons:file-type-json";
    case "markdown":
      return "vscode-icons:file-type-markdown";
    case "yaml":
      return "vscode-icons:file-type-yaml";
    case "python":
      return "vscode-icons:file-type-python";
    case "rust":
      return "vscode-icons:file-type-rust";
    case "go":
      return "vscode-icons:file-type-go";
    case "shell":
      return "vscode-icons:file-type-shell";
    case "docker":
      return "vscode-icons:file-type-docker";
    case "git":
      return "vscode-icons:file-type-git";
    case "image":
      return "vscode-icons:file-type-image";
    case "pdf":
      return "vscode-icons:file-type-pdf2";
    default:
      return "vscode-icons:default-file";
  }
}

function badgeIcon(label: string, bg: string, fg = "#ffffff"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="2" fill="${bg}"/><text x="8" y="11" text-anchor="middle" fill="${fg}" font-size="6.5" font-family="Segoe UI, system-ui, sans-serif" font-weight="700">${label}</text></svg>`;
}

function folderIcon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="#c09553" d="M1.5 3.5A1 1 0 0 1 2.5 2.5h3.6l1.2 1.2H13.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9z"/></svg>`;
}

function docIcon(bg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="${bg}" d="M3 1.5h6.8L13.5 5.2V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"/><path fill="#ffffff" opacity="0.9" d="M9 1.5v3.5h3.5z"/></svg>`;
}

/** Colored VS Code–style 16px icons for autocomplete and tags. */
export function fileIconSvg(kind: FileIconKind): string {
  switch (kind) {
    case "folder":
      return folderIcon();
    case "typescript":
      return badgeIcon("TS", "#2f8fff");
    case "javascript":
      return badgeIcon("JS", "#ffe14a", "#1f2328");
    case "vue":
      return badgeIcon("V", "#42d392");
    case "react":
      return badgeIcon("R", "#59d5ff", "#1f2328");
    case "html":
      return badgeIcon("<>", "#ff6b3d");
    case "css":
      return badgeIcon("#", "#2f8fff");
    case "markdown":
      return badgeIcon("M", "#2b6fff");
    case "json":
      return badgeIcon("{}", "#ffd94f", "#1f2328");
    case "yaml":
      return badgeIcon("Y", "#ff4d5a");
    case "python":
      return badgeIcon("PY", "#3b82f6");
    case "rust":
      return badgeIcon("RS", "#ffb066", "#1f2328");
    case "go":
      return badgeIcon("GO", "#26c6ff");
    case "shell":
      return badgeIcon("$", "#58d845");
    case "docker":
      return badgeIcon("D", "#38a9ff");
    case "git":
      return badgeIcon("G", "#ff7043");
    case "image":
      return badgeIcon("IMG", "#be6dff");
    case "pdf":
      return badgeIcon("PDF", "#ff5c4d");
    case "lock":
      return badgeIcon("LK", "#8b8b8b");
    case "config":
      return badgeIcon("CFG", "#6d8086");
    default:
      return docIcon("#6d8086");
  }
}

export function skillIconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.062l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>`;
}
