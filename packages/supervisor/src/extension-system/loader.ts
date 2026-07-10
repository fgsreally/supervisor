/**
 * Supervisor Extension System - Loader
 *
 * 新的扩展加载器，只加载 supervisor 专用扩展
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti/static";
import { LOAD_PROJECT_RESOURCES } from "../agent/agent-paths.js";
import {
  readExtensionPackageJson,
  resolveExtensionEntries,
} from "./extension-entry.js";
import type { ExtensionDefinition, LoadExtensionResult, LoadExtensionsResult } from "./types.js";

export { resolveExtensionEntries } from "./extension-entry.js";

const require = createRequire(import.meta.url);

// ============================================================================
// Configuration
// ============================================================================

/**
 * 获取扩展搜索目录
 * 只加载 supervisor 专用目录，与 coding-agent 完全分离
 * 每个 agent 只加载自己目录下的扩展
 */
export function getExtensionDirectories(agentHomeDir: string, cwd: string): string[] {
  const dirs = [path.join(agentHomeDir, "extensions")];
  if (LOAD_PROJECT_RESOURCES) {
    dirs.push(path.join(cwd, ".pi", "supervisor", "extensions"));
  }
  return dirs.filter((dir) => fs.existsSync(dir));
}

// ============================================================================
// Module Resolution
// ============================================================================

let _aliases: Record<string, string> | null = null;

function getAliases(): Record<string, string> {
  if (_aliases) return _aliases;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  const typeboxEntry = require.resolve("typebox");
  const typeboxCompileEntry = require.resolve("typebox/compile");
  const typeboxValueEntry = require.resolve("typebox/value");

  // 当前扩展系统的入口
  const supervisorEntry = path.resolve(__dirname, "./index.js");

  _aliases = {
    // 扩展系统
    "@earendil-works/pi-supervisor": supervisorEntry,
    "@mariozechner/pi-supervisor": supervisorEntry,

    // typebox
    typebox: typeboxEntry,
    "typebox/compile": typeboxCompileEntry,
    "typebox/value": typeboxValueEntry,
    "@sinclair/typebox": typeboxEntry,
    "@sinclair/typebox/compile": typeboxCompileEntry,
    "@sinclair/typebox/value": typeboxValueEntry,
  };

  return _aliases;
}

// ============================================================================
// File Discovery
// ============================================================================

function isExtensionFile(name: string): boolean {
  return (
    name.endsWith(".ts") || name.endsWith(".js") || name.endsWith(".mts") || name.endsWith(".mjs")
  );
}

/**
 * 在目录中搜索扩展：仅支持子目录扩展（扩展名/index.ts）。
 */
export function discoverExtensionsInDir(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const discovered: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      if (
        entry.isDirectory() ||
        (entry.isSymbolicLink() && fs.existsSync(entryPath) && fs.statSync(entryPath).isDirectory())
      ) {
        const resolved = resolveExtensionEntries(entryPath);
        discovered.push(...resolved);
      }
    }
  } catch {
    // 忽略读取错误
  }

  return discovered;
}

/**
 * 从多个目录收集唯一扩展路径
 */
export function collectExtensionPaths(dirs: string[]): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const dir of dirs) {
    for (const entry of discoverExtensionsInDir(dir)) {
      const resolved = path.resolve(entry);
      if (!seen.has(resolved)) {
        seen.add(resolved);
        paths.push(entry);
      }
    }
  }

  return paths;
}

/**
 * 从多个目录列出所有扩展文件（别名）
 */
export function listExtensionsInDirectories(dirs: string[]): string[] {
  return collectExtensionPaths(dirs);
}

// ============================================================================
// Extension Metadata (static, for resource API & UI)
// ============================================================================

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
  /** Always false — only directory extensions are supported. */
  isFlatFile: boolean;
}

function isUnder(filePath: string, dir: string): boolean {
  const f = filePath.replace(/\\/g, "/");
  const d = dir.replace(/\\/g, "/").replace(/\/$/, "");
  return f === d || f.startsWith(`${d}/`);
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
    isFlatFile: false,
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

/** Filter infos by parent scan dir. */
export function filterExtensionInfosByDir(
  infos: ExtensionEntryInfo[],
  dir: string,
): ExtensionEntryInfo[] {
  return infos.filter((info) => isUnder(info.rootDir, dir) || isUnder(info.entryPath, dir));
}

// ============================================================================
// Packaged extension helpers
// ============================================================================

const PACKAGED_EXTENSION_IDS = [
  "read",
  "edit",
  "lsp",
  "ask",
  "ast-grep",
  "output-minimizer",
  "web",
  "browser",
] as const;

/** Directory containing supervisor-shipped extension packages. */
export function getPackagedExtensionsDir(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "extensions");
}

export function getPackagedExtensionPath(id: string): string {
  return path.join(getPackagedExtensionsDir(), id, "index.ts");
}

/** All optional packaged tool extensions (not auto-loaded; subagent/sidecar are runtime built-ins). */
export function listPackagedExtensionPaths(): string[] {
  return PACKAGED_EXTENSION_IDS.map((id) => getPackagedExtensionPath(id));
}

/**
 * @deprecated Use `listPackagedExtensionPaths()` or `getPackagedExtensionPath(id)`.
 * Kept for callers that linked a single bundled extension path.
 */
export function getSupervisorAgentToolsExtensionPath(): string {
  return getPackagedExtensionPath("read");
}

// ============================================================================
// Module Loading
// ============================================================================

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

    // 检查是否是 defineExtension 返回的对象
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

export interface DiscoverAndLoadExtensionsOptions {
  /** Agent home directory (~/.pi/supervisor/agents/{agentId}) */
  agentHomeDir: string;
  /** Current working directory for project-level extensions */
  cwd: string;
  /** Additional explicit paths to load */
  additionalPaths?: string[];
}

/**
 * 自动发现并加载所有扩展
 *
 * 注意：只加载 supervisor 专用目录，不加载 coding-agent 的扩展
 * 每个 agent 只加载自己目录下的扩展
 */
export async function discoverAndLoadExtensions(
  options: DiscoverAndLoadExtensionsOptions,
): Promise<LoadExtensionsResult> {
  const { agentHomeDir, cwd, additionalPaths = [] } = options;

  const allPaths: string[] = [];
  const seen = new Set<string>();

  // 1. Collect supervisor directories
  const dirs = getExtensionDirectories(agentHomeDir, cwd);
  for (const entry of collectExtensionPaths(dirs)) {
    const resolved = path.resolve(entry);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      allPaths.push(entry);
    }
  }

  // 2. Merge explicit paths
  for (const p of additionalPaths) {
    const resolved = path.resolve(p);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      allPaths.push(p);
    }
  }

  // 3. Load selected extensions only
  return loadExtensions(allPaths);
}
