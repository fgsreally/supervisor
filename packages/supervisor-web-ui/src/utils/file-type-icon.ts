/** VS Code file icons via Iconify `vscode-icons` set. */

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
  | "pnpm"
  | "npm"
  | "vite"
  | "yarn"
  | "generic";

const FILE_NAME_ICONS: Record<string, string> = {
  "pnpm-lock.yaml": "vscode-icons:file-type-pnpm",
  "pnpm-workspace.yaml": "vscode-icons:file-type-pnpm",
  ".npmrc": "vscode-icons:file-type-npm",
  "package.json": "vscode-icons:file-type-npm",
  "package-lock.json": "vscode-icons:file-type-npm",
  "npm-shrinkwrap.json": "vscode-icons:file-type-npm",
  "yarn.lock": "vscode-icons:file-type-yarn",
  ".yarnrc": "vscode-icons:file-type-yarn",
  ".yarnrc.yml": "vscode-icons:file-type-yarn",
  "bun.lock": "vscode-icons:file-type-bun",
  "bun.lockb": "vscode-icons:file-type-bun",
  "vite.config.js": "vscode-icons:file-type-vite",
  "vite.config.ts": "vscode-icons:file-type-vite",
  "vite.config.mjs": "vscode-icons:file-type-vite",
  "vite.config.cjs": "vscode-icons:file-type-vite",
  "vite.config.mts": "vscode-icons:file-type-vite",
  "vite.config.cts": "vscode-icons:file-type-vite",
  dockerfile: "vscode-icons:file-type-docker",
  "docker-compose.yml": "vscode-icons:file-type-docker",
  "docker-compose.yaml": "vscode-icons:file-type-docker",
  "compose.yml": "vscode-icons:file-type-docker",
  "compose.yaml": "vscode-icons:file-type-docker",
  ".gitignore": "vscode-icons:file-type-git",
  ".gitattributes": "vscode-icons:file-type-git",
  ".gitmodules": "vscode-icons:file-type-git",
  "tsconfig.json": "vscode-icons:file-type-tsconfig",
  "jsconfig.json": "vscode-icons:file-type-jsconfig",
  "readme.md": "vscode-icons:file-type-markdown",
  "agents.md": "vscode-icons:file-type-markdown",
  "plan.md": "vscode-icons:file-type-markdown",
};

const FOLDER_NAME_ICONS: Record<string, string> = {
  ".git": "vscode-icons:folder-type-git",
  ".github": "vscode-icons:folder-type-github",
  node_modules: "vscode-icons:folder-type-node",
  dist: "vscode-icons:folder-type-dist",
  build: "vscode-icons:folder-type-dist",
  src: "vscode-icons:folder-type-src",
  public: "vscode-icons:folder-type-public",
  docs: "vscode-icons:folder-type-docs",
  test: "vscode-icons:folder-type-test",
  tests: "vscode-icons:folder-type-test",
  __tests__: "vscode-icons:folder-type-test",
};

export function getFileIconKind(path: string, isDirectory = false): FileIconKind {
  if (isDirectory || path.endsWith("/") || path.endsWith("\\")) return "folder";
  const base = getFileBaseName(path);
  const lower = base.toLowerCase();

  if (lower === "pnpm-lock.yaml" || lower === "pnpm-workspace.yaml") return "pnpm";
  if (
    lower === "package.json" ||
    lower === "package-lock.json" ||
    lower === "npm-shrinkwrap.json" ||
    lower === ".npmrc"
  ) {
    return "npm";
  }
  if (lower === "yarn.lock" || lower === ".yarnrc" || lower === ".yarnrc.yml") return "yarn";
  if (/^vite\.config\./.test(lower)) return "vite";
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) return "docker";
  if (lower === ".gitignore" || lower === ".gitattributes" || lower === ".gitmodules") return "git";
  if (lower.endsWith(".lock") || lower === "bun.lockb") return "lock";

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
      return "yaml";
    case "toml":
      return "config";
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
  const normalized = path.replace(/[\\/]+$/, "").replace(/\\/g, "/");
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
  const base = getFileBaseName(path);
  const lower = base.toLowerCase();

  if (isDirectory || path.endsWith("/") || path.endsWith("\\")) {
    return FOLDER_NAME_ICONS[lower] ?? "vscode-icons:default-folder";
  }

  if (FILE_NAME_ICONS[lower]) return FILE_NAME_ICONS[lower];
  if (lower.startsWith("dockerfile")) return "vscode-icons:file-type-docker";
  if (/^vite\.config\./.test(lower)) return "vscode-icons:file-type-vite";

  return fileIconName(getFileIconKind(path, false));
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
    case "lock":
      return "vscode-icons:file-type-yarn";
    case "config":
      return "vscode-icons:file-type-config";
    case "pnpm":
      return "vscode-icons:file-type-pnpm";
    case "npm":
      return "vscode-icons:file-type-npm";
    case "vite":
      return "vscode-icons:file-type-vite";
    case "yarn":
      return "vscode-icons:file-type-yarn";
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

/** Fallback colored badges for CodeMirror / non-Iconify surfaces. */
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
      return badgeIcon("MD", "#2b6fff");
    case "json":
      return badgeIcon("{}", "#ffd94f", "#1f2328");
    case "yaml":
      return badgeIcon("YML", "#cb171e");
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
    case "pnpm":
      return badgeIcon("PN", "#f9ad00", "#1f2328");
    case "npm":
      return badgeIcon("NPM", "#cb3837");
    case "vite":
      return badgeIcon("VT", "#646cff");
    case "yarn":
      return badgeIcon("Y", "#2c8ebb");
    default:
      return docIcon("#6d8086");
  }
}

export function skillIconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.062l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>`;
}
