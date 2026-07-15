import { cpSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import type { ResourceHandler } from "../../../resources/handler.js";
import {
  ensureGlobalResourceDirectory,
  getGlobalResourceDirectory,
} from "../../../resources/resource-paths.js";

export function getGlobalMcpDirectory(): string {
  return getGlobalResourceDirectory("mcp");
}

export const mcpResourceHandler: ResourceHandler = {
  kind: "mcp",
  discover() {
    const directory = getGlobalMcpDirectory();
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".json"))
      .map((entry) => {
        const slug = basename(entry.name, ".json");
        return {
          kind: "mcp" as const,
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
      extname(absoluteSource) !== ".json"
    ) {
      throw new Error("MCP source must be a .json file");
    }
    const targetSlug = slug ?? basename(absoluteSource, ".json");
    const targetPath = join(ensureGlobalResourceDirectory("mcp"), `${targetSlug}.json`);
    cpSync(absoluteSource, targetPath);
    return { slug: targetSlug, name: targetSlug, sourcePath: resolve(targetPath) };
  },
  uninstall(slug) {
    const target = join(getGlobalMcpDirectory(), `${slug}.json`);
    if (existsSync(target)) rmSync(target, { force: true });
  },
};
