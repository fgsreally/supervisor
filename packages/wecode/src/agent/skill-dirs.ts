import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { getGlobalResourceDirectory } from "../resources/resource-paths.js";

/** Marker stored on catalog resources discovered from npx skills global dirs. */
export const NPX_SKILLS_EXTERNAL = "npx-skills";

export interface GlobalSkillRoot {
  path: string;
  /** True when the root is outside Wecode's own global/skills directory. */
  external: boolean;
}

export interface DiscoveredSkillDescriptor {
  slug: string;
  name: string;
  sourcePath: string;
  external: boolean;
}

function xdgConfigHome(): string {
  const fromEnv = process.env.XDG_CONFIG_HOME?.trim();
  if (fromEnv) return resolve(fromEnv);
  return join(homedir(), ".config");
}

function tryRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** npx skills canonical + universal fallback global directories (existing only, realpath-deduped). */
export function getNpxGlobalSkillsDirectories(): string[] {
  const candidates = [
    join(homedir(), ".agents", "skills"),
    join(xdgConfigHome(), "agents", "skills"),
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      if (!statSync(candidate).isDirectory()) continue;
    } catch {
      continue;
    }
    const key = tryRealpath(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(resolve(candidate));
  }
  return result;
}

export function getWecodeGlobalSkillsDirectory(): string {
  return getGlobalResourceDirectory("skills");
}

/** Wecode global skills first, then npx skills global roots. */
export function listGlobalSkillRoots(): GlobalSkillRoot[] {
  const roots: GlobalSkillRoot[] = [];
  const seen = new Set<string>();

  const wecode = getWecodeGlobalSkillsDirectory();
  roots.push({ path: resolve(wecode), external: false });
  if (existsSync(wecode)) {
    seen.add(tryRealpath(wecode));
  } else {
    seen.add(resolve(wecode));
  }

  for (const dir of getNpxGlobalSkillsDirectories()) {
    const key = tryRealpath(dir);
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push({ path: dir, external: true });
  }

  return roots;
}

/** Project-level skills directory used by `npx skills add` (default scope). */
export function getProjectSkillsDirectory(cwd: string): string {
  return join(cwd, ".agents", "skills");
}

/**
 * Discover skill directories under the given roots.
 * First root wins on slug collision (call with Wecode root first).
 */
export function discoverSkillDescriptors(roots: GlobalSkillRoot[]): DiscoveredSkillDescriptor[] {
  const bySlug = new Map<string, DiscoveredSkillDescriptor>();

  for (const root of roots) {
    if (!existsSync(root.path)) continue;
    let entries;
    try {
      entries = readdirSync(root.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const sourcePath = resolve(root.path, entry.name);
      const skillMd = join(sourcePath, "SKILL.md");
      if (!existsSync(skillMd)) continue;
      if (bySlug.has(entry.name)) continue;
      bySlug.set(entry.name, {
        slug: entry.name,
        name: entry.name,
        sourcePath,
        external: root.external,
      });
    }
  }

  return [...bySlug.values()];
}
