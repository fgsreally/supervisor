/**
 * Install extensions from npm / git / local sources into the global catalog.
 *
 * Layout:
 *   ~/.pi/supervisor/global/extensions/<id>/        <- source lives here (with package.json + npm deps)
 * Detects pnpm first, falls back to npm. Never touches bun/yarn.
 */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import {
  extensionHasInstallableDeps,
  readExtensionPackageJson,
  requireExtensionEntry,
} from "../extension/index.js";
import { getGlobalResourceDirs } from "./resource-paths.js";
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

export function parseGitRemote(input: string): ParsedGitSource | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("git@") && !trimmed.endsWith(".git")) return null;
  if (parseGithubUrl(trimmed)) return null;

  const idHint = trimmed
    .replace(/\.git$/, "")
    .split(/[/:]/)
    .pop();
  return idHint ? { cloneUrl: trimmed, idHint } : null;
}

export type ExtensionSource =
  | { kind: "npm"; spec: string }
  | { kind: "git"; cloneUrl: string; ref?: string; subpath?: string; idHint: string }
  | { kind: "local"; path: string };

export function parseExtensionSource(input: string): ExtensionSource {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Extension source is required");
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
          .pop() ?? "extension",
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
          .pop() ?? "extension",
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
): Extract<ExtensionSource, { kind: "git" }> | null {
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
      "extension";
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
  if (!id) id = "extension";
  return id;
}

function writePackageJson(dir: string, content: unknown): void {
  writeFileSync(join(dir, "package.json"), JSON.stringify(content, null, 2), "utf8");
}

function ensurePackageJson(extDir: string): { name: string; version: string } {
  const existing = readExtensionPackageJson(extDir);
  if (existing) {
    return {
      name: existing.name ?? basename(extDir),
      version: existing.version ?? "0.0.0",
    };
  }
  const name = basename(extDir);
  const fallback = { name, version: "0.0.0", private: true, main: "./index.ts" };
  writePackageJson(extDir, fallback);
  return fallback;
}

function installDeps(extDir: string): "pnpm" | "npm" | "none" {
  if (!extensionHasInstallableDeps(extDir) && existsSync(join(extDir, "node_modules"))) {
    return "none";
  }

  const manager = detectPackageManager();
  const args =
    manager === "pnpm"
      ? ["install", "--silent"]
      : ["install", "--silent", "--no-audit", "--no-fund"];
  const res = run(manager, args, extDir);
  if (res.status !== 0) {
    const stderr = res.stderr ?? "";
    throw new Error(`${manager} install failed in ${extDir}: ${stderr.slice(0, 500)}`);
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
  const pkg = readExtensionPackageJson(rootDir);
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
  cpSync(absoluteSource, targetRoot, { recursive: true });
  ensurePackageJson(targetRoot);
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

function installGit(source: Extract<ExtensionSource, { kind: "git" }>, targetDir: string): string {
  const fallbackId = safeId(source.idHint);
  const targetRoot = join(targetDir, fallbackId);
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(targetRoot, { recursive: true });
  populateDirectoryFromGit(source, targetRoot);
  ensurePackageJson(targetRoot);
  return finalizeInstallRoot(targetDir, targetRoot, fallbackId);
}

function populateDirectoryFromGit(
  source: Extract<ExtensionSource, { kind: "git" }>,
  targetRoot: string,
): void {
  const cloneArgs = ["clone", "--depth", "1"];
  if (source.ref) cloneArgs.push("--branch", source.ref);

  if (source.subpath) {
    const tempRoot = mkdtempSync(join(tmpdir(), "pi-ext-git-"));
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

  const tempClone = mkdtempSync(join(tmpdir(), "pi-ext-git-"));
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
  source: Extract<ExtensionSource, { kind: "git" }>,
): void {
  const tempRoot = mkdtempSync(join(tmpdir(), "pi-ext-update-"));
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
 * Install an extension from any source into the global catalog.
 * Agent access is granted separately through a database resource binding.
 */
export function installExtensionToGlobal(source: string): InstallResult {
  const parsed = parseExtensionSource(source);
  const globalExtDir = getGlobalResourceDirs().extensions;
  mkdirSync(globalExtDir, { recursive: true });

  let rootDir: string;
  switch (parsed.kind) {
    case "local":
      rootDir = installLocal(parsed.path, globalExtDir);
      break;
    case "npm":
      rootDir = installNpm(parsed.spec, globalExtDir);
      break;
    case "git":
      rootDir = installGit(parsed, globalExtDir);
      break;
  }

  const entryPath = requireExtensionEntry(rootDir);
  const installCommand = installDeps(rootDir);
  const id = basename(rootDir);

  return { id, rootDir, entryPath, installCommand };
}

/**
 * Remove an extension from the global catalog by id (basename of its directory).
 */
export function uninstallGlobalExtension(id: string): void {
  const globalExtDir = getGlobalResourceDirs().extensions;
  const target = join(globalExtDir, id);
  if (!existsSync(target)) {
    throw new Error(`Extension not installed in global catalog: ${id}`);
  }
  rmSync(target, { recursive: true, force: true });
}

/**
 * Find a global extension by id. Returns the rootDir or null.
 */
export function getGlobalExtensionDir(id: string): string | null {
  const globalExtDir = getGlobalResourceDirs().extensions;
  const target = join(globalExtDir, id);
  return existsSync(target) ? target : null;
}

/**
 * Update a global extension by re-fetching from package.json `repository`.
 * Preserves the install directory so database resource paths remain stable.
 */
export function updateGlobalExtension(id: string): InstallResult {
  const rootDir = getGlobalExtensionDir(id);
  if (!rootDir) {
    throw new Error(`Extension not installed in global catalog: ${id}`);
  }

  const pkg = readExtensionPackageJson(rootDir);
  if (!pkg?.repository) {
    throw new Error(
      `Extension ${id} has no package.json repository field; reinstall with extensions install <source>`,
    );
  }

  const gitSource = repositoryToGitSource(pkg.repository);
  if (!gitSource) {
    throw new Error(`Extension ${id} repository field is not a supported git source`);
  }

  refreshDirectoryFromGit(rootDir, gitSource);
  ensurePackageJson(rootDir);

  const entryPath = requireExtensionEntry(rootDir);
  const installCommand = installDeps(rootDir);

  return { id, rootDir, entryPath, installCommand };
}
