import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Nixpacks-style deterministic project detection.
 * Lifecycle commands (setup) come from manifest/lockfile facts, never from an LLM.
 */

export interface DetectedSetup {
  installCommand?: string;
  /** Which file decided the command (for logs). */
  source?: string;
}

function readPackageManagerField(cwd: string): string | undefined {
  try {
    const raw = readFileSync(join(cwd, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { packageManager?: unknown };
    if (typeof parsed.packageManager !== "string") return undefined;
    const name = parsed.packageManager.split("@")[0]?.trim();
    return name && ["pnpm", "yarn", "npm", "bun"].includes(name) ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Detect the one-shot setup (dependency install) command from project files. */
export function detectSetup(cwd: string): DetectedSetup {
  if (existsSync(join(cwd, "package.json"))) {
    const fromField = readPackageManagerField(cwd);
    if (fromField) {
      return { installCommand: `${fromField} install`, source: "package.json#packageManager" };
    }
    const lockfiles: Array<[string, string]> = [
      ["pnpm-lock.yaml", "pnpm install"],
      ["yarn.lock", "yarn install"],
      ["bun.lockb", "bun install"],
      ["bun.lock", "bun install"],
      ["package-lock.json", "npm install"],
    ];
    for (const [file, command] of lockfiles) {
      if (existsSync(join(cwd, file))) return { installCommand: command, source: file };
    }
    return { installCommand: "npm install", source: "package.json" };
  }

  const python: Array<[string, string]> = [
    ["uv.lock", "uv sync"],
    ["poetry.lock", "poetry install"],
    ["Pipfile", "pipenv install"],
    ["requirements.txt", "pip install -r requirements.txt"],
  ];
  for (const [file, command] of python) {
    if (existsSync(join(cwd, file))) return { installCommand: command, source: file };
  }

  return {};
}

/**
 * Browser-accessible HTML entries at the project root (dev servers such as Vite
 * serve them at /<file>.html). Sorted with index.html first.
 */
export function detectHtmlEntries(cwd: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(cwd, { withFileTypes: true })
      .filter((item) => item.isFile() && /\.html?$/i.test(item.name))
      .map((item) => item.name);
  } catch {
    return [];
  }
  return entries.sort((a, b) =>
    a.toLowerCase() === "index.html"
      ? -1
      : b.toLowerCase() === "index.html"
        ? 1
        : a.localeCompare(b),
  );
}

/**
 * True when a Node project at `cwd` can resolve dependencies from `cwd` itself
 * or any ancestor directory (Node/npx walk up), e.g. a session worktree under
 * `<project>/.supervisor/worktrees/<id>` reusing `<project>/node_modules`.
 */
export function canReuseParentNodeModules(cwd: string): boolean {
  if (!existsSync(join(cwd, "package.json"))) return false;
  let current = cwd;
  for (;;) {
    if (existsSync(join(current, "node_modules"))) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}
