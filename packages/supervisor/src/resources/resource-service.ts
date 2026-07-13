import { cpSync, existsSync, rmSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { ensureGlobalResourceDirs, getGlobalResourceDirs } from "../agent/agent-paths.js";
import {
  installExtensionToGlobal,
  type InstallResult,
  uninstallGlobalExtension,
  updateGlobalExtension,
} from "../agent/extension-installer.js";
import type { SupervisorDb } from "../db/db.js";
import type { ExtensionModuleRegistry } from "./extension-registry.js";
import type { AgentResourceBinding, Resource, ResourceKind } from "./types.js";
import { isResourceKind } from "./types.js";

export interface ResourceServiceDeps {
  db: SupervisorDb;
  extensionRegistry: ExtensionModuleRegistry;
  ensureCatalog: () => Promise<void>;
}

export type InstallableResourceKind = "extension" | "skill" | "prompt" | "mcp";

export interface InstallResourceInput {
  kind: InstallableResourceKind;
  /** npm:/git:/local path for extension; filesystem path for skill/prompt/mcp */
  source: string;
  slug?: string;
  name?: string;
  description?: string;
}

export interface InstallResourceResult {
  resource: Resource;
  rootDir?: string;
  entryPath?: string;
  installCommand?: InstallResult["installCommand"];
}

export type BindResourceInput =
  | { agentId: number; resourceId: number; priority?: number }
  | { agentId: number; kind: ResourceKind; slug: string; priority?: number };

export type UnbindResourceInput =
  | { agentId: number; resourceId: number }
  | { agentId: number; kind: ResourceKind; slug: string };

export interface InstallAndBindInput extends InstallResourceInput {
  agentId: number;
  priority?: number;
}

function assertAgentExists(db: SupervisorDb, agentId: number): void {
  if (!db.getAgent(agentId)) {
    throw new Error(`Agent not found: ${agentId}`);
  }
}

function resolveSourcePath(source: string): string {
  const absolute = isAbsolute(source) ? source : resolve(process.cwd(), source);
  if (!existsSync(absolute)) {
    throw new Error(`Source not found: ${absolute}`);
  }
  return absolute;
}

function installLocalToGlobal(
  kind: "skill" | "prompt" | "mcp",
  source: string,
  slug?: string,
): { slug: string; path: string } {
  ensureGlobalResourceDirs();
  const dirs = getGlobalResourceDirs();
  const absoluteSource = resolveSourcePath(source);

  switch (kind) {
    case "skill": {
      const stat = statSync(absoluteSource);
      if (!stat.isDirectory()) {
        throw new Error("Skill source must be a directory");
      }
      const targetSlug = slug ?? basename(absoluteSource);
      const targetPath = join(dirs.skills, targetSlug);
      if (existsSync(targetPath)) {
        rmSync(targetPath, { recursive: true, force: true });
      }
      cpSync(absoluteSource, targetPath, { recursive: true });
      return { slug: targetSlug, path: resolve(targetPath) };
    }
    case "prompt": {
      const stat = statSync(absoluteSource);
      if (!stat.isFile() || extname(absoluteSource) !== ".md") {
        throw new Error("Prompt source must be a .md file");
      }
      const targetSlug = slug ?? basename(absoluteSource, ".md");
      const targetPath = join(dirs.prompts, `${targetSlug}.md`);
      cpSync(absoluteSource, targetPath);
      return { slug: targetSlug, path: resolve(targetPath) };
    }
    case "mcp": {
      const stat = statSync(absoluteSource);
      if (!stat.isFile() || extname(absoluteSource) !== ".json") {
        throw new Error("MCP source must be a .json file");
      }
      const targetSlug = slug ?? basename(absoluteSource, ".json");
      const targetPath = join(dirs.mcp, `${targetSlug}.json`);
      cpSync(absoluteSource, targetPath);
      return { slug: targetSlug, path: resolve(targetPath) };
    }
  }
}

function removeGlobalResourceFromDisk(kind: ResourceKind, slug: string): void {
  const dirs = getGlobalResourceDirs();
  switch (kind) {
    case "extension":
      uninstallGlobalExtension(slug);
      return;
    case "skill": {
      const target = join(dirs.skills, slug);
      if (existsSync(target)) rmSync(target, { recursive: true, force: true });
      return;
    }
    case "prompt": {
      const target = join(dirs.prompts, `${slug}.md`);
      if (existsSync(target)) rmSync(target, { force: true });
      return;
    }
    case "mcp": {
      const target = join(dirs.mcp, `${slug}.json`);
      if (existsSync(target)) rmSync(target, { force: true });
      return;
    }
    case "tool":
      return;
  }
}

/**
 * Unified resource catalog operations: install to global disk, register in DB, bind to agents.
 * Used by SessionManager, HTTP API, and CLI.
 */
export class ResourceService {
  constructor(private readonly deps: ResourceServiceDeps) {}

  get db(): SupervisorDb {
    return this.deps.db;
  }

  listResources(kind?: ResourceKind): Resource[] {
    return this.deps.db.listResources(kind);
  }

  listAgentBindings(agentId: number, kind?: ResourceKind): AgentResourceBinding[] {
    return this.deps.db.listAgentResources(agentId, kind);
  }

  async installResource(input: InstallResourceInput): Promise<InstallResourceResult> {
    await this.deps.ensureCatalog();

    if (input.kind === "extension") {
      const result = installExtensionToGlobal(input.source);
      const resource = this.deps.db.upsertResource({
        kind: "extension",
        slug: result.id,
        name: input.name ?? result.id,
        description: input.description,
        source_path: result.rootDir,
      });
      await this.deps.extensionRegistry.reload(this.deps.db, result.id);
      return { resource, ...result };
    }

    const installed = installLocalToGlobal(input.kind, input.source, input.slug);
    const resource = this.deps.db.upsertResource({
      kind: input.kind,
      slug: installed.slug,
      name: input.name ?? installed.slug,
      description: input.description,
      source_path: installed.path,
    });
    return { resource };
  }

  async uninstallResource(kind: ResourceKind, slug: string): Promise<void> {
    const resource = this.deps.db.getResourceByKindSlug(kind, slug);
    if (resource) {
      try {
        this.deps.db.deleteResource(resource.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Cannot uninstall ${kind}/${slug}: ${message}`);
      }
    }

    if (kind === "extension" || existsGlobalResourceOnDisk(kind, slug)) {
      removeGlobalResourceFromDisk(kind, slug);
    }

    if (kind === "extension") {
      await this.deps.extensionRegistry.reload(this.deps.db, slug);
    }
  }

  async updateExtension(slug: string): Promise<InstallResourceResult> {
    await this.deps.ensureCatalog();
    const result = updateGlobalExtension(slug);
    const resource = this.deps.db.upsertResource({
      kind: "extension",
      slug: result.id,
      name: result.id,
      source_path: result.rootDir,
    });
    await this.deps.extensionRegistry.reload(this.deps.db, result.id);
    return { resource, ...result };
  }

  registerTool(
    slug: string,
    options?: { name?: string; description?: string; meta?: Record<string, unknown> },
  ): Resource {
    return this.deps.db.upsertResource({
      kind: "tool",
      slug,
      name: options?.name ?? slug,
      description: options?.description,
      source_path: null,
      meta: options?.meta,
    });
  }

  bindResource(input: BindResourceInput): AgentResourceBinding {
    assertAgentExists(this.deps.db, input.agentId);

    if ("resourceId" in input && input.resourceId !== undefined) {
      const resource = this.deps.db.getResource(input.resourceId);
      if (!resource) throw new Error(`Resource not found: ${input.resourceId}`);
      return this.deps.db.linkAgentResource(input.agentId, input.resourceId, {
        priority: input.priority,
      });
    }

    const resource = this.deps.db.getResourceByKindSlug(input.kind, input.slug);
    if (!resource) throw new Error(`Resource not found: ${input.kind}/${input.slug}`);
    return this.deps.db.linkAgentResource(input.agentId, resource.id, {
      priority: input.priority,
    });
  }

  unbindResource(input: UnbindResourceInput): void {
    if ("resourceId" in input && input.resourceId !== undefined) {
      this.deps.db.unlinkAgentResource(input.agentId, input.resourceId);
      return;
    }
    this.deps.db.unlinkAgentResourceBySlug(input.agentId, input.kind, input.slug);
  }

  async installAndBind(
    input: InstallAndBindInput,
  ): Promise<InstallResourceResult & { binding: AgentResourceBinding }> {
    const { agentId, priority, ...installInput } = input;
    const installed = await this.installResource(installInput);
    const binding = this.bindResource({
      agentId,
      resourceId: installed.resource.id,
      priority,
    });
    return { ...installed, binding };
  }

  /** Legacy: map global path basename to slug and bind via DB. */
  bindResourceByGlobalPath(
    agentId: number,
    kind: "skills" | "extensions" | "prompts",
    globalPath: string,
  ): AgentResourceBinding {
    const resourceKind: ResourceKind =
      kind === "extensions" ? "extension" : kind === "skills" ? "skill" : "prompt";
    const slug = basename(globalPath).replace(/\.md$/, "");
    return this.bindResource({ agentId, kind: resourceKind, slug });
  }
}

function existsGlobalResourceOnDisk(kind: ResourceKind, slug: string): boolean {
  const dirs = getGlobalResourceDirs();
  switch (kind) {
    case "extension":
      return existsSync(join(dirs.extensions, slug));
    case "skill":
      return existsSync(join(dirs.skills, slug));
    case "prompt":
      return existsSync(join(dirs.prompts, `${slug}.md`));
    case "mcp":
      return existsSync(join(dirs.mcp, `${slug}.json`));
    case "tool":
      return false;
  }
}

export function parseInstallResourceBody(body: Record<string, unknown>): InstallResourceInput {
  const kind = body.kind;
  const source = body.source;
  if (typeof kind !== "string" || !isResourceKind(kind) || kind === "tool") {
    throw new Error("kind must be extension, skill, prompt, or mcp");
  }
  if (typeof source !== "string" || !source.trim()) {
    throw new Error("source is required");
  }
  return {
    kind,
    source: source.trim(),
    slug: typeof body.slug === "string" ? body.slug : undefined,
    name: typeof body.name === "string" ? body.name : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
  };
}

export function parseBindResourceBody(
  agentId: number,
  body: Record<string, unknown>,
): BindResourceInput {
  if (typeof body.resourceId === "number") {
    return {
      agentId,
      resourceId: body.resourceId,
      priority: typeof body.priority === "number" ? body.priority : undefined,
    };
  }
  if (typeof body.kind === "string" && typeof body.slug === "string") {
    if (!isResourceKind(body.kind)) {
      throw new Error("invalid resource kind");
    }
    return {
      agentId,
      kind: body.kind,
      slug: body.slug,
      priority: typeof body.priority === "number" ? body.priority : undefined,
    };
  }
  throw new Error("resourceId or { kind, slug } is required");
}
