/**
 * Install plugins from npm / git / local sources into the global catalog.
 *
 * Layout:
 *   ~/.pi/wecode/global/plugins/<id>/        <- source lives here (with package.json + npm deps)
 * Detects pnpm first, falls back to npm. Never touches bun/yarn.
 */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import {
  pluginHasInstallableDeps,
  readPluginPackageJson,
  requirePluginEntry,
} from "./loader.js";
import {
  ensureGlobalResourceDirectory,
  getGlobalResourceDirectory,
} from "../resources/resource-paths.js";
export interface ParsedGitSource {
  cloneUrl: string;
  ref?: string;
  subpath?: string;
  idHint: string;
}

const GITHUB_WEB_RE =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(?:\/(.+?))?)?\/?$/i;

export function parseGithubUrl(input: string): ParsedGitSource | null {
  const match = GITHUB_WEB_RE.exec(input.trim());
  if (!match) return null;

  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "");
  const ref = match[3];
  const subpath = match[4]?.replace(/\/$/, "");
  return {
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
    ref,
    subpath: subpath || undefined,
    idHint: subpath ? (subpath.split("/").pop() ?? repo) : repo,
  };
}

function parseGitRemote(input: string): ParsedGitSource | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("git@") && !trimmed.endsWith(".git")) return null;
  if (parseGithubUrl(trimmed)) return null;

  const idHint = trimmed
    .replace(/\.git$/, "")
    .split(/[/:]/)
    .pop();
  return idHint ? { cloneUrl: trimmed, idHint } : null;
}

export type PluginSource =
  | { kind: "npm"; spec: string }
  | { kind: "git"; cloneUrl: string; ref?: string; subpath?: string; idHint: string }
  | { kind: "local"; path: string };

export function parsePluginSource(input: string): PluginSource {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Plugin source is required");
  if (trimmed.startsWith("npm:")) return { kind: "npm", spec: trimmed.slice(4).trim() };

  const github = parseGithubUrl(trimmed);
  if (github) return { kind: "git", ...github };

  if (trimmed.startsWith("git+")) {
    const rest = trimmed.slice(4).trim();
    const githubFromGitPlus = parseGithubUrl(rest);
    if (githubFromGitPlus) return { kind: "git", ...githubFromGitPlus };
    return {
      kind: "git",
      cloneUrl: rest,
      idHint:
        rest
          .replace(/\.git$/, "")
          .split("/")
          .pop() ?? "plugin",
    };
  }

  const gitRemote = parseGitRemote(trimmed);
  if (gitRemote) return { kind: "git", ...gitRemote };
  if (/^https?:\/\//.test(trimmed)) {
    return {
      kind: "git",
      cloneUrl: trimmed.endsWith(".git") ? trimmed : `${trimmed}.git`,
      idHint:
        trimmed
          .replace(/\.git$/, "")
          .split("/")
          .pop() ?? "plugin",
    };
  }
  if (isLocalPath(trimmed)) return { kind: "local", path: trimmed };
  return { kind: "npm", spec: trimmed };
}

function isLocalPath(input: string): boolean {
  if (input.startsWith("~/") || input.startsWith("./") || input.startsWith("../")) return true;
  if (/^[A-Za-z]:[\\/]/.test(input)) return true;
  if (input.startsWith("/")) return true;
  return !input.includes(":");
}

export type PackageRepository = string | { type?: string; url: string; directory?: string };

function normalizeCloneUrl(url: string): string {
  const trimmed = url.trim().replace(/^git\+/, "");
  const github = parseGithubUrl(trimmed);
  if (github) return github.cloneUrl;
  if (trimmed.startsWith("git@")) return trimmed;
  return trimmed.endsWith(".git") ? trimmed : `${trimmed}.git`;
}

export function repositoryToGitSource(
  repository: PackageRepository,
): Extract<PluginSource, { kind: "git" }> | null {
  let url: string;
  let directory: string | undefined;
  if (typeof repository === "string") {
    const trimmed = repository.trim();
    if (trimmed.startsWith("github:")) {
      const [owner, repoName] = trimmed.slice("github:".length).split("/");
      if (!owner || !repoName) return null;
      url = `https://github.com/${owner}/${repoName.replace(/\.git$/, "")}.git`;
    } else {
      url = trimmed;
    }
  } else {
    url = repository.url;
    directory = repository.directory;
  }

  const github = parseGithubUrl(url);
  if (github) {
    const subpath = directory ?? github.subpath;
    return {
      kind: "git",
      cloneUrl: github.cloneUrl,
      ref: github.ref,
      subpath,
      idHint: subpath?.split("/").filter(Boolean).pop() ?? github.idHint,
    };
  }

  const gitRemote = parseGitRemote(url);
  if (gitRemote) {
    return {
      kind: "git",
      cloneUrl: gitRemote.cloneUrl,
      ref: gitRemote.ref,
      subpath: directory ?? gitRemote.subpath,
      idHint: gitRemote.idHint,
    };
  }

  if (/^https?:\/\//.test(url) || url.startsWith("git@")) {
    const cloneUrl = normalizeCloneUrl(url);
    const idHint =
      directory?.split("/").filter(Boolean).pop() ??
      cloneUrl
        .replace(/\.git$/, "")
        .split("/")
        .pop() ??
      "plugin";
    return { kind: "git", cloneUrl, subpath: directory, idHint };
  }
  return null;
}

export interface InstallResult {
  id: string;
  rootDir: string;
  entryPath: string;
  installCommand: "pnpm" | "npm" | "none";
}

function detectPackageManager(): "pnpm" | "npm" {
  for (const cmd of ["pnpm", "npm"]) {
    const res = spawnSync(cmd, ["--version"], {
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    if (res.status === 0) return cmd as "pnpm" | "npm";
  }
  throw new Error("No package manager found. Install pnpm or npm first.");
}

function run(cmd: string, args: string[], cwd: string): SpawnSyncReturns<string> {
  return spawnSync(cmd, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

function safeId(input: string): string {
  let id = input.replace(/^@/, "").replace(/\//g, "-");
  id = id.replace(/\.git$/, "");
  id = id.replace(/[^A-Za-z0-9-_]/g, "-").replace(/^-+|-+$/g, "");
  if (!id) id = "plugin";
  return id;
}

function writePackageJson(dir: string, content: unknown): void {
  writeFileSync(join(dir, "package.json"), JSON.stringify(content, null, 2), "utf8");
}

function ensurePackageJson(pluginDir: string): { name: string; version: string } {
  const existing = readPluginPackageJson(pluginDir);
  if (existing) {
    return {
      name: existing.name ?? basename(pluginDir),
      version: existing.version ?? "0.0.0",
    };
  }
  const name = basename(pluginDir);
  const fallback = { name, version: "0.0.0", private: true, main: "./index.ts" };
  writePackageJson(pluginDir, fallback);
  return fallback;
}

function removeLocalDevelopmentDependencies(pluginDir: string): void {
  const packagePath = join(pluginDir, "package.json");
  if (!existsSync(packagePath)) return;
  const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as Record<string, unknown>;
  delete manifest.devDependencies;
  writePackageJson(pluginDir, manifest);
}

function installDeps(pluginDir: string): "pnpm" | "npm" | "none" {
  if (!pluginHasInstallableDeps(pluginDir) && existsSync(join(pluginDir, "node_modules"))) {
    return "none";
  }

  const manager = detectPackageManager();
  const args =
    manager === "pnpm"
      ? ["install", "--prod", "--config.auto-install-peers=false", "--silent"]
      : ["install", "--omit=dev", "--silent", "--no-audit", "--no-fund"];
  const res = run(manager, args, pluginDir);
  if (res.status !== 0) {
    const stderr = res.stderr ?? "";
    throw new Error(`${manager} install failed in ${pluginDir}: ${stderr.slice(0, 500)}`);
  }
  return manager;
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function moveDirectory(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  rmSync(from, { recursive: true, force: true });
}

function preferPackageId(rootDir: string, fallbackId: string): string {
  const pkg = readPluginPackageJson(rootDir);
  if (!pkg?.name) return fallbackId;
  return safeId(pkg.name);
}

function finalizeInstallRoot(targetDir: string, rootDir: string, fallbackId: string): string {
  const preferredId = preferPackageId(rootDir, fallbackId);
  const preferredRoot = join(targetDir, preferredId);
  if (resolve(rootDir) === resolve(preferredRoot)) return rootDir;
  moveDirectory(rootDir, preferredRoot);
  return preferredRoot;
}

function installLocal(source: string, targetDir: string): string {
  const absoluteSource = isAbsolute(source) ? source : resolve(process.cwd(), source);
  if (!existsSync(absoluteSource)) throw new Error(`Local source not found: ${absoluteSource}`);

  if (!isDir(absoluteSource)) {
    const name = basename(absoluteSource).replace(extname(absoluteSource), "");
    const targetRoot = join(targetDir, safeId(name));
    mkdirSync(targetRoot, { recursive: true });
    const entryPath = join(targetRoot, basename(absoluteSource));
    cpSync(absoluteSource, entryPath);
    ensurePackageJson(targetRoot);
    return targetRoot;
  }

  const fallbackId = safeId(basename(absoluteSource));
  const targetRoot = join(targetDir, fallbackId);
  rmSync(targetRoot, { recursive: true, force: true });
  cpSync(absoluteSource, targetRoot, {
    recursive: true,
    filter: (sourcePath) => basename(sourcePath) !== "node_modules",
  });
  ensurePackageJson(targetRoot);
  removeLocalDevelopmentDependencies(targetRoot);
  return finalizeInstallRoot(targetDir, targetRoot, fallbackId);
}

function installNpm(spec: string, targetDir: string): string {
  const fallbackId = safeId(spec);
  const targetRoot = join(targetDir, fallbackId);
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(targetRoot, { recursive: true });

  const manager = detectPackageManager();
  const packRes = run(manager, ["pack", spec], targetRoot);
  if (packRes.status !== 0) {
    throw new Error(`${manager} pack ${spec} failed: ${(packRes.stderr ?? "").slice(0, 500)}`);
  }
  const packed = packRes.stdout.trim().split(/\r?\n/).pop();
  if (!packed) throw new Error(`Could not determine packed tarball name for ${spec}`);
  const tarPath = join(targetRoot, packed);
  if (!existsSync(tarPath)) throw new Error(`npm pack did not produce ${tarPath}`);

  const extractRes = run(
    "tar",
    ["-xzf", packed, "-C", targetRoot, "--strip-components=1"],
    targetRoot,
  );
  rmSync(tarPath, { force: true });
  if (extractRes.status !== 0) {
    throw new Error(`tar extract failed: ${(extractRes.stderr ?? "").slice(0, 500)}`);
  }
  ensurePackageJson(targetRoot);
  return finalizeInstallRoot(targetDir, targetRoot, fallbackId);
}

function installGit(source: Extract<PluginSource, { kind: "git" }>, targetDir: string): string {
  const fallbackId = safeId(source.idHint);
  const targetRoot = join(targetDir, fallbackId);
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(targetRoot, { recursive: true });
  populateDirectoryFromGit(source, targetRoot);
  ensurePackageJson(targetRoot);
  return finalizeInstallRoot(targetDir, targetRoot, fallbackId);
}

function populateDirectoryFromGit(
  source: Extract<PluginSource, { kind: "git" }>,
  targetRoot: string,
): void {
  const cloneArgs = ["clone", "--depth", "1"];
  if (source.ref) cloneArgs.push("--branch", source.ref);

  if (source.subpath) {
    const tempRoot = mkdtempSync(join(tmpdir(), "wecode-ext-git-"));
    try {
      const cloneRes = run("git", [...cloneArgs, source.cloneUrl, tempRoot], process.cwd());
      if (cloneRes.status !== 0) {
        throw new Error(
          `git clone ${source.cloneUrl} failed: ${(cloneRes.stderr ?? "").slice(0, 500)}`,
        );
      }

      const subpathSource = join(tempRoot, source.subpath);
      if (!existsSync(subpathSource) || !isDir(subpathSource)) {
        throw new Error(`Subpath not found in repository: ${source.subpath}`);
      }

      cpSync(subpathSource, targetRoot, { recursive: true });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
    return;
  }

  const tempClone = mkdtempSync(join(tmpdir(), "wecode-ext-git-"));
  try {
    const cloneRes = run("git", [...cloneArgs, source.cloneUrl, tempClone], process.cwd());
    if (cloneRes.status !== 0) {
      throw new Error(
        `git clone ${source.cloneUrl} failed: ${(cloneRes.stderr ?? "").slice(0, 500)}`,
      );
    }
    for (const name of readdirSync(tempClone)) {
      cpSync(join(tempClone, name), join(targetRoot, name), { recursive: true });
    }
  } finally {
    rmSync(tempClone, { recursive: true, force: true });
  }
}

function refreshDirectoryFromGit(
  rootDir: string,
  source: Extract<PluginSource, { kind: "git" }>,
): void {
  const tempRoot = mkdtempSync(join(tmpdir(), "wecode-ext-update-"));
  try {
    mkdirSync(tempRoot, { recursive: true });
    populateDirectoryFromGit(source, tempRoot);
    for (const name of readdirSync(rootDir)) {
      rmSync(join(rootDir, name), { recursive: true, force: true });
    }
    for (const name of readdirSync(tempRoot)) {
      cpSync(join(tempRoot, name), join(rootDir, name), { recursive: true });
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Install a plugin from any source into the global catalog.
 * Agent access is granted separately through a database resource binding.
 */
export function installPluginToGlobal(source: string): InstallResult {
  const parsed = parsePluginSource(source);
  const globalPluginDir = ensureGlobalResourceDirectory("plugins");
  mkdirSync(globalPluginDir, { recursive: true });

  let rootDir: string;
  switch (parsed.kind) {
    case "local":
      rootDir = installLocal(parsed.path, globalPluginDir);
      break;
    case "npm":
      rootDir = installNpm(parsed.spec, globalPluginDir);
      break;
    case "git":
      rootDir = installGit(parsed, globalPluginDir);
      break;
  }

  const entryPath = requirePluginEntry(rootDir);
  const installCommand = installDeps(rootDir);
  const id = basename(rootDir);

  return { id, rootDir, entryPath, installCommand };
}

/**
 * Remove a plugin from the global catalog by id (basename of its directory).
 */
export function uninstallGlobalPlugin(id: string): void {
  const globalPluginDir = getGlobalResourceDirectory("plugins");
  const target = join(globalPluginDir, id);
  if (!existsSync(target)) {
    throw new Error(`Plugin not installed in global catalog: ${id}`);
  }
  rmSync(target, { recursive: true, force: true });
}

/**
 * Find a global plugin by id. Returns the rootDir or null.
 */
function getGlobalPluginDir(id: string): string | null {
  const globalPluginDir = getGlobalResourceDirectory("plugins");
  const target = join(globalPluginDir, id);
  return existsSync(target) ? target : null;
}

/**
 * Update a global plugin by re-fetching from package.json `repository`.
 * Preserves the install directory so database resource paths remain stable.
 */
export function updateGlobalPlugin(id: string): InstallResult {
  const rootDir = getGlobalPluginDir(id);
  if (!rootDir) {
    throw new Error(`Plugin not installed in global catalog: ${id}`);
  }

  const pkg = readPluginPackageJson(rootDir);
  if (!pkg?.repository) {
    throw new Error(
      `Plugin ${id} has no package.json repository field; reinstall with plugins install <source>`,
    );
  }

  const gitSource = repositoryToGitSource(pkg.repository);
  if (!gitSource) {
    throw new Error(`Plugin ${id} repository field is not a supported git source`);
  }

  refreshDirectoryFromGit(rootDir, gitSource);
  ensurePackageJson(rootDir);

  const entryPath = requirePluginEntry(rootDir);
  const installCommand = installDeps(rootDir);

  return { id, rootDir, entryPath, installCommand };
}
