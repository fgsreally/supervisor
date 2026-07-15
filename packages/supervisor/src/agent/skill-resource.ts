import { cpSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { ResourceHandler } from "../resources/handler.js";
import {
  ensureGlobalResourceDirectory,
  getGlobalResourceDirectory,
} from "../resources/resource-paths.js";

export function getGlobalSkillsDirectory(): string {
  return getGlobalResourceDirectory("skills");
}

export const skillResourceHandler: ResourceHandler = {
  kind: "skill",
  discover() {
    const directory = getGlobalSkillsDirectory();
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => ({
        kind: "skill" as const,
        slug: entry.name,
        name: entry.name,
        sourcePath: resolve(directory, entry.name),
      }));
  },
  install({ source, slug }) {
    const absoluteSource = isAbsolute(source) ? source : resolve(process.cwd(), source);
    if (!existsSync(absoluteSource) || !statSync(absoluteSource).isDirectory()) {
      throw new Error("Skill source must be a directory");
    }
    const targetSlug = slug ?? basename(absoluteSource);
    const targetPath = join(ensureGlobalResourceDirectory("skills"), targetSlug);
    if (existsSync(targetPath)) rmSync(targetPath, { recursive: true, force: true });
    cpSync(absoluteSource, targetPath, { recursive: true });
    return { slug: targetSlug, name: targetSlug, sourcePath: resolve(targetPath) };
  },
  uninstall(slug) {
    const target = join(getGlobalSkillsDirectory(), slug);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  },
};
