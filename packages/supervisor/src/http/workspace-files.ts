import { type Dirent, existsSync, readdirSync } from "node:fs";
import { join, normalize, relative, resolve, sep } from "node:path";

export interface WorkspaceFileEntry {
  path: string;
  isDirectory: boolean;
}

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".pi",
  ".cursor",
  "coverage",
  ".next",
  ".nuxt",
]);

const MAX_FILES = 800;
const MAX_DEPTH = 8;

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

function walkDir(root: string, dir: string, depth: number, out: WorkspaceFileEntry[]): void {
  if (out.length >= MAX_FILES || depth > MAX_DEPTH) return;

  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    const name = String(entry.name);
    const abs = join(dir, name);
    const rel = toPosixPath(relative(root, abs));
    if (!rel || rel === ".") continue;

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(name)) continue;
      out.push({ path: `${rel}/`, isDirectory: true });
      walkDir(root, abs, depth + 1, out);
      continue;
    }

    if (entry.isFile()) {
      out.push({ path: rel, isDirectory: false });
    }
  }
}

/** List workspace files relative to cwd for @ autocomplete. */
export function listWorkspaceFiles(cwd: string): WorkspaceFileEntry[] {
  const root = normalize(resolve(cwd));
  if (!existsSync(root)) return [];

  const out: WorkspaceFileEntry[] = [];
  walkDir(root, root, 0, out);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
