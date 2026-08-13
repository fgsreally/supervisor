import type { SupervisorDb } from "../../db/db.js";
import {
  BUILTIN_EXTENSIONS,
  BUILTIN_EXTENSION_SLUGS,
  builtinExtensionSourcePath,
  isBuiltinExtensionResource,
} from "./catalog.js";

/** Upsert shipped extensions into the global resources catalog. */
export function ensureBuiltinExtensionResources(db: SupervisorDb): void {
  const legacyGit = db.getResourceByKindSlug("extension", "session-git-worktree");
  if (legacyGit && isBuiltinExtensionResource(legacyGit.meta)) {
    db.db.transaction(() => {
      db.db
        .prepare(
          `DELETE FROM agent_resources
           WHERE resource_id = ?`,
        )
        .run(legacyGit.id);
      db.db.prepare("DELETE FROM resources WHERE id = ?").run(legacyGit.id);
    })();
  }
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
  const agent = db.getAgent(agentId);
  if (!agent) return;
  ensureBuiltinExtensionResources(db);
  const isExternal = agent.backendType !== "native";
  for (const spec of BUILTIN_EXTENSIONS) {
    if (spec.agentNames && !spec.agentNames.includes(agent.name)) continue;
    if (isExternal && !spec.bindExternalByDefault) continue;
    const resource = db.getResourceByKindSlug("extension", spec.slug);
    if (!resource || !isBuiltinExtensionResource(resource.meta)) continue;
    db.ensureAgentResourceBinding(agentId, resource.id, { enabled: true });
  }
}

/** Slugs of builtin extensions active for this agent (and session type). Bindings are always on. */
export function listEnabledBuiltinExtensionSlugs(
  db: SupervisorDb,
  agentId: number,
  options?: { isMainSession?: boolean },
): Set<string> {
  ensureAgentBuiltinExtensionBindings(db, agentId);
  const agent = db.getAgent(agentId);
  const isExternal = agent != null && agent.backendType !== "native";
  const boundSlugs = isExternal
    ? new Set(
        db
          .listAgentResourceBindings(agentId, { kind: "extension", enabledOnly: false })
          .flatMap((binding) => {
            const slug = binding.resource?.slug;
            return slug && BUILTIN_EXTENSION_SLUGS.has(slug) ? [slug] : [];
          }),
      )
    : null;
  const enabled = new Set<string>();
  for (const spec of BUILTIN_EXTENSIONS) {
    if (spec.agentNames && (!agent || !spec.agentNames.includes(agent.name))) continue;
    if (spec.requiresMainSession && options?.isMainSession === false) continue;
    if (boundSlugs && !boundSlugs.has(spec.slug)) continue;
    enabled.add(spec.slug);
  }
  return enabled;
}
