import type { SupervisorDb } from "../db/db.js";
import type { ResourceHandler, ResourceInstallOutput } from "./handler.js";
import type { AgentResourceBinding, Resource, ResourceKind } from "./types.js";
import { isResourceKind } from "./types.js";

export interface ResourceManagerDeps {
  db: SupervisorDb;
  handlers: ReadonlyMap<ResourceKind, ResourceHandler>;
  ensureCatalog: () => Promise<void>;
}

export interface InstallResourceInput {
  kind: ResourceKind;
  source: string;
  slug?: string;
  name?: string;
  description?: string;
}

export interface InstallResourceResult {
  resource: Resource;
  details?: Record<string, unknown>;
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
  if (!db.getAgent(agentId)) throw new Error(`Agent not found: ${agentId}`);
}

/** Generic catalog, installation, and Agent-binding coordinator. */
export class ResourceManager {
  constructor(private readonly deps: ResourceManagerDeps) {}

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
    const handler = this.requireHandler(input.kind, "install");
    if (!handler.install) throw new Error(`Resource kind is not installable: ${input.kind}`);
    const installed = await handler.install({ source: input.source, slug: input.slug });
    const result = this.saveInstalledResource(input.kind, installed, input);
    await handler.onCatalogUpdated?.(result.resource.slug);
    return result;
  }

  async updateResource(kind: ResourceKind, slug: string): Promise<InstallResourceResult> {
    await this.deps.ensureCatalog();
    const handler = this.requireHandler(kind, "update");
    if (!handler.update) throw new Error(`Resource kind is not updateable: ${kind}`);
    const updated = await handler.update(slug);
    const result = this.saveInstalledResource(kind, updated);
    await handler.onCatalogUpdated?.(result.resource.slug);
    return result;
  }

  async uninstallResource(kind: ResourceKind, slug: string): Promise<void> {
    const resource = this.deps.db.getResourceByKindSlug(kind, slug);
    if (resource) {
      try {
        this.deps.db.deleteResource(resource.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Cannot uninstall ${kind}/${slug}: ${message}`);
      }
    }
    await this.deps.handlers.get(kind)?.uninstall?.(slug);
  }

  bindResource(input: BindResourceInput): AgentResourceBinding {
    assertAgentExists(this.deps.db, input.agentId);
    const resource =
      "kind" in input
        ? this.deps.db.getResourceByKindSlug(input.kind, input.slug)
        : this.deps.db.getResource(input.resourceId);
    if (!resource) {
      const identity = "kind" in input ? `${input.kind}/${input.slug}` : input.resourceId;
      throw new Error(`Resource not found: ${identity}`);
    }
    return this.deps.db.bindAgentResource(input.agentId, resource.id, {
      priority: input.priority,
    });
  }

  async unbindResource(input: UnbindResourceInput): Promise<void> {
    const resource =
      "kind" in input
        ? this.deps.db.getResourceByKindSlug(input.kind, input.slug)
        : this.deps.db.getResource(input.resourceId);
    if ("kind" in input) {
      this.deps.db.unbindAgentResourceBySlug(input.agentId, input.kind, input.slug);
    } else {
      this.deps.db.unbindAgentResource(input.agentId, input.resourceId);
    }
    if (resource)
      await this.deps.handlers.get(resource.kind)?.onUnbind?.(input.agentId, resource.slug);
  }

  async installAndBind(
    input: InstallAndBindInput,
  ): Promise<InstallResourceResult & { binding: AgentResourceBinding }> {
    const { agentId, priority, ...installInput } = input;
    const installed = await this.installResource(installInput);
    const binding = this.bindResource({ agentId, resourceId: installed.resource.id, priority });
    return { ...installed, binding };
  }

  private requireHandler(kind: ResourceKind, operation: string): ResourceHandler {
    const handler = this.deps.handlers.get(kind);
    if (!handler) throw new Error(`No ${operation} handler registered for resource kind: ${kind}`);
    return handler;
  }

  private saveInstalledResource(
    kind: ResourceKind,
    installed: ResourceInstallOutput,
    overrides?: Pick<InstallResourceInput, "name" | "description">,
  ): InstallResourceResult {
    const resource = this.deps.db.upsertResource({
      kind,
      slug: installed.slug,
      name: overrides?.name ?? installed.name,
      description: overrides?.description ?? installed.description,
      source_path: installed.sourcePath,
      version: installed.version,
      meta: installed.meta,
    });
    return { resource, details: installed.details };
  }
}

export function parseInstallResourceBody(body: Record<string, unknown>): InstallResourceInput {
  if (typeof body.kind !== "string" || !isResourceKind(body.kind)) {
    throw new Error("invalid resource kind");
  }
  if (typeof body.source !== "string" || !body.source.trim()) {
    throw new Error("source is required");
  }
  return {
    kind: body.kind,
    source: body.source.trim(),
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
    if (!isResourceKind(body.kind)) throw new Error("invalid resource kind");
    return {
      agentId,
      kind: body.kind,
      slug: body.slug,
      priority: typeof body.priority === "number" ? body.priority : undefined,
    };
  }
  throw new Error("resourceId or { kind, slug } is required");
}
