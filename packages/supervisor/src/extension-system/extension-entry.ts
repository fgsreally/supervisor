import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export const VALID_ENTRY_EXT = new Set([".ts", ".js", ".mts", ".mjs"]);

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
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const raw = readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as ExtensionPackageJson;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isValidEntryFile(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return VALID_ENTRY_EXT.has(ext);
}

/**
 * Resolve the single entry file for an extension package directory.
 * Priority: package.json `main` → index.ts/js/mts/mjs
 */
export function resolveExtensionEntry(extDir: string): string | null {
  if (!existsSync(extDir) || !statSync(extDir).isDirectory()) return null;

  const pkg = readExtensionPackageJson(extDir);
  if (pkg?.main && typeof pkg.main === "string") {
    const fromMain = resolve(extDir, pkg.main.replace(/^\.\//, ""));
    if (isValidEntryFile(fromMain)) return fromMain;
  }

  for (const name of ["index.ts", "index.js", "index.mts", "index.mjs"]) {
    const cand = join(extDir, name);
    if (isValidEntryFile(cand)) return cand;
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
  if (!pkg) return false;
  return Object.keys(pkg.dependencies ?? {}).length > 0;
}
