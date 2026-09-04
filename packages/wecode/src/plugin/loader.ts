/**
 * Wecode Plugin System - Loader
 *
 * 插件发现与动态加载（jiti）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti/static";
import type { AnyPluginDefinition, LoadPluginResult, LoadPluginsResult } from "./types.js";

const VALID_ENTRY_EXT = new Set([".ts", ".js", ".mts", ".mjs"]);

export interface PluginPackageJson {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  repository?: string | { type?: string; url: string; directory?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function readPluginPackageJson(dir: string): PluginPackageJson | null {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as PluginPackageJson;
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

/** Resolve a plugin package entry from package.json or a conventional index file. */
export function resolvePluginEntry(pluginDir: string): string | null {
  if (!fs.existsSync(pluginDir) || !fs.statSync(pluginDir).isDirectory()) return null;

  const pkg = readPluginPackageJson(pluginDir);
  if (pkg?.main && typeof pkg.main === "string") {
    const fromMain = path.resolve(pluginDir, pkg.main.replace(/^\.\//, ""));
    if (isValidEntryFile(fromMain)) return fromMain;
  }

  for (const name of ["index.ts", "index.js", "index.mts", "index.mjs"]) {
    const candidate = path.join(pluginDir, name);
    if (isValidEntryFile(candidate)) return candidate;
  }
  return null;
}

export function resolvePluginEntries(pluginDir: string): string[] {
  const entry = resolvePluginEntry(pluginDir);
  return entry ? [entry] : [];
}

export function requirePluginEntry(pluginDir: string): string {
  const entry = resolvePluginEntry(pluginDir);
  if (!entry) {
    throw new Error(
      `Plugin directory has no entry file (set package.json "main" or add index.ts/js): ${pluginDir}`,
    );
  }
  return entry;
}

export function pluginHasInstallableDeps(pluginDir: string): boolean {
  const pkg = readPluginPackageJson(pluginDir);
  return pkg ? Object.keys(pkg.dependencies ?? {}).length > 0 : false;
}

let _aliases: Record<string, string> | null = null;

function getAliases(): Record<string, string> {
  if (_aliases) return _aliases;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  _aliases = {
    "wecode": path.resolve(__dirname, "./index.js"),
  };

  return _aliases;
}

export interface PluginEntryInfo {
  /** Discovery root for this plugin (parent dir of entryPath). */
  rootDir: string;
  /** Absolute path of the entry file. */
  entryPath: string;
  /** File name (e.g. "index.ts"). */
  fileName: string;
  /** Plugin id = rootDir basename. */
  id: string;
  /** Display name from package.json (if available). */
  name: string | null;
  /** Version from package.json (if available). */
  version: string | null;
  /** Description from package.json (if available). */
  description: string | null;
}

function buildEntryInfo(entryPath: string, rootDir: string): PluginEntryInfo {
  const pkg = readPluginPackageJson(rootDir);
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
 * List plugins visible in `dirs` with static metadata (no jiti load).
 */
export function listPluginInfosInDirectories(dirs: string[]): PluginEntryInfo[] {
  const out: PluginEntryInfo[] = [];
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
        for (const entry of resolvePluginEntries(full)) {
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
 * 加载单个插件模块
 */
export async function loadPluginModule(
  pluginPath: string,
): Promise<{ definition: AnyPluginDefinition | null; error?: string }> {
  try {
    const jiti = createJiti(import.meta.url, {
      moduleCache: false,
      alias: getAliases(),
    });

    const module = await jiti.import(pluginPath, { default: true });

    if (!module || typeof module !== "object") {
      return {
        definition: null,
        error: `Plugin does not export a valid object: ${pluginPath}`,
      };
    }

    const def = module as AnyPluginDefinition;

    if (!def.name || typeof def.name !== "string") {
      return {
        definition: null,
        error: `Plugin must have a 'name' property: ${pluginPath}`,
      };
    }

    if (!def.setup || typeof def.setup !== "function") {
      return {
        definition: null,
        error: `Plugin must have a 'setup' function: ${pluginPath}`,
      };
    }

    return { definition: def };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      definition: null,
      error: `Failed to load plugin: ${message}`,
    };
  }
}

/**
 * 从文件系统路径加载插件
 */
export async function loadPlugin(pluginPath: string): Promise<LoadPluginResult> {
  const resolvedPath = path.resolve(pluginPath);

  const result = await loadPluginModule(resolvedPath);

  if (result.error) {
    return {
      definition: { name: "<failed>", setup: () => {} },
      path: pluginPath,
      resolvedPath,
      error: result.error,
    };
  }

  if (!result.definition) {
    return {
      definition: { name: "<failed>", setup: () => {} },
      path: pluginPath,
      resolvedPath,
      error: "Unknown error loading plugin",
    };
  }

  return {
    definition: result.definition,
    path: pluginPath,
    resolvedPath,
  };
}

/**
 * 从多个路径加载插件
 */
export async function loadPlugins(pluginPaths: string[]): Promise<LoadPluginsResult> {
  const plugins: LoadPluginResult[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  for (const pluginPath of pluginPaths) {
    const result = await loadPlugin(pluginPath);

    if (result.error) {
      errors.push({ path: pluginPath, error: result.error });
    } else {
      plugins.push(result);
    }
  }

  return {
    plugins,
    errors,
  };
}
