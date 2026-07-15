import type { ResourceKind } from "./types.js";

export interface ResourceDescriptor {
  kind: ResourceKind;
  slug: string;
  name: string;
  description?: string | null;
  sourcePath?: string | null;
  version?: string | null;
  meta?: Record<string, unknown>;
}

export interface ResourceInstallRequest {
  source: string;
  slug?: string;
}

export interface ResourceInstallOutput extends Omit<ResourceDescriptor, "kind"> {
  details?: Record<string, unknown>;
}

/** Resource-kind adapter. Generic catalog code never inspects a concrete kind. */
export interface ResourceHandler {
  readonly kind: ResourceKind;
  discover(): ResourceDescriptor[];
  install?(request: ResourceInstallRequest): ResourceInstallOutput | Promise<ResourceInstallOutput>;
  update?(slug: string): ResourceInstallOutput | Promise<ResourceInstallOutput>;
  uninstall?(slug: string): void | Promise<void>;
  onCatalogUpdated?(slug: string): void | Promise<void>;
  onUnbind?(agentId: number, slug: string): void | Promise<void>;
}

export function indexResourceHandlers(
  handlers: Iterable<ResourceHandler>,
): ReadonlyMap<ResourceKind, ResourceHandler> {
  const indexed = new Map<ResourceKind, ResourceHandler>();
  for (const handler of handlers) {
    if (indexed.has(handler.kind)) {
      throw new Error(`Duplicate resource handler: ${handler.kind}`);
    }
    indexed.set(handler.kind, handler);
  }
  return indexed;
}
