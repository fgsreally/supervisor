import { cpSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import type { ResourceHandler } from "../../../resources/handler.js";
import {
  ensureGlobalResourceDirectory,
  getGlobalResourceDirectory,
} from "../../../resources/resource-paths.js";

export function getGlobalMcpDirectory(): string {
  return getGlobalResourceDirectory("mcp");
}

function assertValidSlug(slug: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug)) {
    throw new Error("MCP slug must be alphanumeric (dots, dashes, underscores allowed)");
  }
}

function assertValidMcpJson(content: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("MCP content must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MCP content must be a JSON object");
  }
  const servers = (parsed as { servers?: unknown }).servers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error('MCP content must include a "servers" object');
  }
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
    assertValidSlug(targetSlug);
    const targetPath = join(ensureGlobalResourceDirectory("mcp"), `${targetSlug}.json`);
    cpSync(absoluteSource, targetPath);
    return { slug: targetSlug, name: targetSlug, sourcePath: resolve(targetPath) };
  },
  writeContent({ slug, content }) {
    assertValidSlug(slug);
    assertValidMcpJson(content);
    const targetPath = join(ensureGlobalResourceDirectory("mcp"), `${slug}.json`);
    writeFileSync(targetPath, content.endsWith("\n") ? content : `${content}\n`, "utf-8");
    return { slug, name: slug, sourcePath: resolve(targetPath) };
  },
  uninstall(slug) {
    const target = join(getGlobalMcpDirectory(), `${slug}.json`);
    if (existsSync(target)) rmSync(target, { force: true });
  },
};
