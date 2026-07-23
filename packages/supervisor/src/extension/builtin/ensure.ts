import type { SupervisorDb } from "../../db/db.js";
import {
  BUILTIN_EXTENSIONS,
  builtinExtensionSourcePath,
  isBuiltinExtensionResource,
} from "./catalog.js";

/** Upsert shipped extensions into the global resources catalog. */
export function ensureBuiltinExtensionResources(db: SupervisorDb): void {
  for (const spec of BUILTIN_EXTENSIONS) {
    const existing = db.getResourceByKindSlug("extension", spec.slug);
    if (existing && !isBuiltinExtensionResource(existing.meta)) {
      // Do not overwrite a user-installed extension that happens to share the slug.
      continue;
    }
    db.upsertResource({
      kind: "extension",
      slug: spec.slug,
      name: spec.name,
      description: spec.description,
      source_path: builtinExtensionSourcePath(spec.slug),
      version: "builtin",
      meta: { builtin: true },
    });
  }
}

/**
 * Ensure every shipped extension has an agent_resources row.
 * Does not reset enabled when the row already exists.
 */
export function ensureAgentBuiltinExtensionBindings(db: SupervisorDb, agentId: number): void {
  ensureBuiltinExtensionResources(db);
  for (const spec of BUILTIN_EXTENSIONS) {
    const resource = db.getResourceByKindSlug("extension", spec.slug);
    if (!resource || !isBuiltinExtensionResource(resource.meta)) continue;
    db.ensureAgentResourceBinding(agentId, resource.id, { enabled: true });
  }
}

/** Slugs of builtin extensions that are enabled for this agent (and session type). */
export function listEnabledBuiltinExtensionSlugs(
  db: SupervisorDb,
  agentId: number,
  options?: { isMainSession?: boolean },
): Set<string> {
  ensureAgentBuiltinExtensionBindings(db, agentId);
  const enabled = new Set<string>();
  for (const spec of BUILTIN_EXTENSIONS) {
    if (spec.requiresMainSession && options?.isMainSession === false) continue;
    const resource = db.getResourceByKindSlug("extension", spec.slug);
    if (!resource) continue;
    const binding = db.getAgentResourceBinding(agentId, resource.id);
    if (binding?.enabled) enabled.add(spec.slug);
  }
  return enabled;
}
