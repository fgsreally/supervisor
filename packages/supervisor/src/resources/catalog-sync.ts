import type { SupervisorDb } from "../db/db.js";
import type { ResourceHandler } from "./handler.js";

/** Discover every registered resource kind and update the database catalog. */
export function initializeResourceCatalog(
  db: SupervisorDb,
  handlers: Iterable<ResourceHandler>,
): void {
  for (const handler of handlers) {
    for (const resource of handler.discover()) {
      if (resource.kind !== handler.kind) {
        throw new Error(
          `Resource handler ${handler.kind} returned mismatched kind ${resource.kind}`,
        );
      }
      db.upsertResource({
        kind: resource.kind,
        slug: resource.slug,
        name: resource.name,
        description: resource.description,
        source_path: resource.sourcePath,
        version: resource.version,
        meta: resource.meta,
      });
    }
  }
}
