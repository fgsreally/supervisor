import { cpSync, existsSync, rmSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { ResourceHandler } from "../resources/handler.js";
import {
  cloneGitSourceToTemp,
  parseGitOrLocalSource,
  resolveSkillDirectory,
} from "../resources/git-source.js";
import { ensureGlobalResourceDirectory } from "../resources/resource-paths.js";
import {
  discoverSkillDescriptors,
  listGlobalSkillRoots,
  NPX_SKILLS_EXTERNAL,
  getSupervisorGlobalSkillsDirectory,
} from "./skill-dirs.js";

export function getGlobalSkillsDirectory(): string {
  return getSupervisorGlobalSkillsDirectory();
}

function installLocalDirectory(absoluteSource: string, slug?: string) {
  if (!existsSync(absoluteSource) || !statSync(absoluteSource).isDirectory()) {
    throw new Error("Skill source must be a directory");
  }
  // Prefer the given directory when it already looks like a skill; otherwise search one level.
  let skillDir = absoluteSource;
  if (!existsSync(join(absoluteSource, "SKILL.md"))) {
    try {
      skillDir = resolveSkillDirectory(absoluteSource, slug);
    } catch {
      // Backward compatible: copy any local directory even without SKILL.md.
      skillDir = absoluteSource;
    }
  }
  const targetSlug = slug ?? basename(skillDir);
  const targetPath = join(ensureGlobalResourceDirectory("skills"), targetSlug);
  if (existsSync(targetPath)) rmSync(targetPath, { recursive: true, force: true });
  cpSync(skillDir, targetPath, { recursive: true });
  return { slug: targetSlug, name: targetSlug, sourcePath: resolve(targetPath) };
}

export const skillResourceHandler: ResourceHandler = {
  kind: "skill",
  discover() {
    return discoverSkillDescriptors(listGlobalSkillRoots()).map((skill) => ({
      kind: "skill" as const,
      slug: skill.slug,
      name: skill.name,
      sourcePath: skill.sourcePath,
      // Always set meta so catalog sync can clear a stale external flag after a local install.
      meta: skill.external ? { external: NPX_SKILLS_EXTERNAL } : {},
    }));
  },
  install({ source, slug }) {
    const parsed = parseGitOrLocalSource(source);

    if (parsed.kind === "local") {
      const absoluteSource = isAbsolute(parsed.path)
        ? parsed.path
        : resolve(process.cwd(), parsed.path);
      return installLocalDirectory(absoluteSource, slug);
    }

    const { tempRoot, contentRoot } = cloneGitSourceToTemp(parsed);
    try {
      const skillDir = resolveSkillDirectory(contentRoot, slug ?? parsed.idHint);
      const targetSlug = slug ?? basename(skillDir);
      const targetPath = join(ensureGlobalResourceDirectory("skills"), targetSlug);
      if (existsSync(targetPath)) rmSync(targetPath, { recursive: true, force: true });
      cpSync(skillDir, targetPath, { recursive: true });
      return {
        slug: targetSlug,
        name: targetSlug,
        sourcePath: resolve(targetPath),
        details: {
          source: parsed.cloneUrl,
          ref: parsed.ref ?? null,
          subpath: parsed.subpath ?? null,
        },
      };
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  },
  uninstall(slug) {
    // Only remove Supervisor-owned installs; npx global skills are never deleted here.
    const target = join(getGlobalSkillsDirectory(), slug);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  },
};
