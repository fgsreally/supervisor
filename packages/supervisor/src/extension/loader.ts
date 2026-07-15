/**
 * Supervisor Extension System - Loader
 *
 * 扩展发现与动态加载（jiti）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti/static";
import type { ExtensionDefinition, LoadExtensionResult, LoadExtensionsResult } from "./types.js";

const VALID_ENTRY_EXT = new Set([".ts", ".js", ".mts", ".mjs"]);

export interface ExtensionPackageJson {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  repository?: string | { type?: string; url: string; directory?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function readExtensionPackageJson(dir: string): ExtensionPackageJson | null {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as ExtensionPackageJson;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isValidEntryFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return VALID_ENTRY_EXT.has(ext);
}

/** Resolve an extension package entry from package.json or a conventional index file. */
export function resolveExtensionEntry(extDir: string): string | null {
  if (!fs.existsSync(extDir) || !fs.statSync(extDir).isDirectory()) return null;

  const pkg = readExtensionPackageJson(extDir);
  if (pkg?.main && typeof pkg.main === "string") {
    const fromMain = path.resolve(extDir, pkg.main.replace(/^\.\//, ""));
    if (isValidEntryFile(fromMain)) return fromMain;
  }

  for (const name of ["index.ts", "index.js", "index.mts", "index.mjs"]) {
    const candidate = path.join(extDir, name);
    if (isValidEntryFile(candidate)) return candidate;
  }
  return null;
}

export function resolveExtensionEntries(extDir: string): string[] {
  const entry = resolveExtensionEntry(extDir);
  return entry ? [entry] : [];
}

export function requireExtensionEntry(extDir: string): string {
  const entry = resolveExtensionEntry(extDir);
  if (!entry) {
    throw new Error(
      `Extension directory has no entry file (set package.json "main" or add index.ts/js): ${extDir}`,
    );
  }
  return entry;
}

export function extensionHasInstallableDeps(extDir: string): boolean {
  const pkg = readExtensionPackageJson(extDir);
  return pkg ? Object.keys(pkg.dependencies ?? {}).length > 0 : false;
}

let _aliases: Record<string, string> | null = null;

function getAliases(): Record<string, string> {
  if (_aliases) return _aliases;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  _aliases = {
    "@earendil-works/pi-supervisor": path.resolve(__dirname, "./index.js"),
  };

  return _aliases;
}

export interface ExtensionEntryInfo {
  /** Discovery root for this extension (parent dir of entryPath). */
  rootDir: string;
  /** Absolute path of the entry file. */
  entryPath: string;
  /** File name (e.g. "index.ts"). */
  fileName: string;
  /** Extension id = rootDir basename. */
  id: string;
  /** Display name from package.json (if available). */
  name: string | null;
  /** Version from package.json (if available). */
  version: string | null;
  /** Description from package.json (if available). */
  description: string | null;
}

function buildEntryInfo(entryPath: string, rootDir: string): ExtensionEntryInfo {
  const pkg = readExtensionPackageJson(rootDir);
  const fileName = path.basename(entryPath);
  return {
    rootDir,
    entryPath,
    fileName,
    id: path.basename(rootDir),
    name: pkg?.name ?? null,
    version: pkg?.version ?? null,
    description: pkg?.description ?? null,
  };
}

/**
 * List extensions visible in `dirs` with static metadata (no jiti load).
 */
export function listExtensionInfosInDirectories(dirs: string[]): ExtensionEntryInfo[] {
  const out: ExtensionEntryInfo[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (
        e.isDirectory() ||
        (e.isSymbolicLink() && fs.existsSync(full) && fs.statSync(full).isDirectory())
      ) {
        for (const entry of resolveExtensionEntries(full)) {
          const resolved = path.resolve(entry);
          if (seen.has(resolved)) continue;
          seen.add(resolved);
          out.push(buildEntryInfo(entry, full));
        }
      }
    }
  }
  return out;
}

/**
 * 加载单个扩展模块
 */
export async function loadExtensionModule(
  extensionPath: string,
): Promise<{ definition: ExtensionDefinition | null; error?: string }> {
  try {
    const jiti = createJiti(import.meta.url, {
      moduleCache: false,
      alias: getAliases(),
    });

    const module = await jiti.import(extensionPath, { default: true });

    if (!module || typeof module !== "object") {
      return {
        definition: null,
        error: `Extension does not export a valid object: ${extensionPath}`,
      };
    }

    const def = module as ExtensionDefinition;

    if (!def.name || typeof def.name !== "string") {
      return {
        definition: null,
        error: `Extension must have a 'name' property: ${extensionPath}`,
      };
    }

    if (!def.setup || typeof def.setup !== "function") {
      return {
        definition: null,
        error: `Extension must have a 'setup' function: ${extensionPath}`,
      };
    }

    return { definition: def };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      definition: null,
      error: `Failed to load extension: ${message}`,
    };
  }
}

/**
 * 从文件系统路径加载扩展
 */
export async function loadExtension(extensionPath: string): Promise<LoadExtensionResult> {
  const resolvedPath = path.resolve(extensionPath);

  const result = await loadExtensionModule(resolvedPath);

  if (result.error) {
    return {
      definition: { name: "<failed>", setup: () => {} },
      path: extensionPath,
      resolvedPath,
      error: result.error,
    };
  }

  if (!result.definition) {
    return {
      definition: { name: "<failed>", setup: () => {} },
      path: extensionPath,
      resolvedPath,
      error: "Unknown error loading extension",
    };
  }

  return {
    definition: result.definition,
    path: extensionPath,
    resolvedPath,
  };
}

/**
 * 从多个路径加载扩展
 */
export async function loadExtensions(extensionPaths: string[]): Promise<LoadExtensionsResult> {
  const extensions: LoadExtensionResult[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  for (const extPath of extensionPaths) {
    const result = await loadExtension(extPath);

    if (result.error) {
      errors.push({ path: extPath, error: result.error });
    } else {
      extensions.push(result);
    }
  }

  return {
    extensions,
    errors,
  };
}
