import type { WecodeDb } from "../../db/db.js";
import {
  BUILTIN_PLUGINS,
  BUILTIN_PLUGIN_SLUGS,
  builtinPluginSourcePath,
  isBuiltinPluginResource,
} from "./catalog.js";

/** Upsert shipped plugins into the global resources catalog. */
export function ensureBuiltinPluginResources(db: WecodeDb): void {
  const legacyGit = db.getResourceByKindSlug("plugin", "session-git-worktree");
  if (legacyGit && isBuiltinPluginResource(legacyGit.meta)) {
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
  for (const spec of BUILTIN_PLUGINS) {
    const existing = db.getResourceByKindSlug("plugin", spec.slug);
    if (existing && !isBuiltinPluginResource(existing.meta)) {
      // Do not overwrite a user-installed plugin that happens to share the slug.
      continue;
    }
    db.upsertResource({
      kind: "plugin",
      slug: spec.slug,
      name: spec.name,
      description: spec.description,
      source_path: builtinPluginSourcePath(spec.slug),
      version: "builtin",
      meta: { builtin: true },
    });
  }
}

/**
 * Ensure every shipped plugin has an agent_resources row.
 * Does not reset enabled when the row already exists.
 */
export function ensureAgentBuiltinPluginBindings(db: WecodeDb, agentId: number): void {
  const agent = db.getAgent(agentId);
  if (!agent) return;
  ensureBuiltinPluginResources(db);
  const isExternal = agent.backendType !== "native";
  for (const spec of BUILTIN_PLUGINS) {
    if (spec.agentNames && !spec.agentNames.includes(agent.name)) continue;
    if (isExternal && !spec.bindExternalByDefault) continue;
    const resource = db.getResourceByKindSlug("plugin", spec.slug);
    if (!resource || !isBuiltinPluginResource(resource.meta)) continue;
    db.ensureAgentResourceBinding(agentId, resource.id, { enabled: true });
  }
}

/** Slugs of builtin plugins active for this agent (and session type). Bindings are always on. */
export function listEnabledBuiltinPluginSlugs(
  db: WecodeDb,
  agentId: number,
  options?: { isMainSession?: boolean },
): Set<string> {
  ensureAgentBuiltinPluginBindings(db, agentId);
  const agent = db.getAgent(agentId);
  const isExternal = agent != null && agent.backendType !== "native";
  const boundSlugs = isExternal
    ? new Set(
        db
          .listAgentResourceBindings(agentId, { kind: "plugin", enabledOnly: false })
          .flatMap((binding) => {
            const slug = binding.resource?.slug;
            return slug && BUILTIN_PLUGIN_SLUGS.has(slug) ? [slug] : [];
          }),
      )
    : null;
  const enabled = new Set<string>();
  for (const spec of BUILTIN_PLUGINS) {
    if (spec.agentNames && (!agent || !spec.agentNames.includes(agent.name))) continue;
    if (spec.requiresMainSession && options?.isMainSession === false) continue;
    if (boundSlugs && !boundSlugs.has(spec.slug)) continue;
    enabled.add(spec.slug);
  }
  return enabled;
}
