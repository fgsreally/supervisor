import { cpSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import type { ResourceHandler } from "../resources/handler.js";
import {
  ensureGlobalResourceDirectory,
  getGlobalResourceDirectory,
} from "../resources/resource-paths.js";

export function getGlobalPromptsDirectory(): string {
  return getGlobalResourceDirectory("prompts");
}

function assertValidSlug(slug: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug)) {
    throw new Error("Prompt slug must be alphanumeric (dots, dashes, underscores allowed)");
  }
}

export const promptResourceHandler: ResourceHandler = {
  kind: "prompt",
  discover() {
    const directory = getGlobalPromptsDirectory();
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".md"))
      .map((entry) => {
        const slug = basename(entry.name, extname(entry.name));
        return {
          kind: "prompt" as const,
          slug,
          name: slug,
          sourcePath: resolve(directory, entry.name),
        };
      });
  },
  install({ source, slug }) {
    const absoluteSource = isAbsolute(source) ? source : resolve(process.cwd(), source);
    if (
      !existsSync(absoluteSource) ||
      !statSync(absoluteSource).isFile() ||
      extname(absoluteSource) !== ".md"
    ) {
      throw new Error("Prompt source must be a .md file");
    }
    const targetSlug = slug ?? basename(absoluteSource, ".md");
    assertValidSlug(targetSlug);
    const targetPath = join(ensureGlobalResourceDirectory("prompts"), `${targetSlug}.md`);
    cpSync(absoluteSource, targetPath);
    return { slug: targetSlug, name: targetSlug, sourcePath: resolve(targetPath) };
  },
  writeContent({ slug, content }) {
    assertValidSlug(slug);
    const targetPath = join(ensureGlobalResourceDirectory("prompts"), `${slug}.md`);
    writeFileSync(targetPath, content, "utf-8");
    return { slug, name: slug, sourcePath: resolve(targetPath) };
  },
  uninstall(slug) {
    const target = join(getGlobalPromptsDirectory(), `${slug}.md`);
    if (existsSync(target)) rmSync(target, { force: true });
  },
};
