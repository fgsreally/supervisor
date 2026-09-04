import type { WecodeDb } from "../db/db.js";
import { ensureAgentBuiltinPluginBindings } from "./builtin/ensure.js";
import type { ExternalAgentDescriptor } from "./types.js";

const META_KEY = "wecode.externalAgent";

/** Register plugin-contributed external agents without taking over user-edited rows. */
export function ensurePluginExternalAgents(
  db: WecodeDb,
  pluginId: string,
  specs: readonly ExternalAgentDescriptor[],
): void {
  for (const spec of specs) {
    if (!spec.id.trim() || !spec.name.trim() || !spec.command.trim()) continue;
    const key = `${pluginId}:${spec.id}`;
    const existing = db.listAgents().find((agent) => agent.meta[META_KEY] === key);
    if (existing) {
      ensureAgentBuiltinPluginBindings(db, existing.id);
      continue;
    }
    const agent = db.insertAgent({
      name: spec.name,
      description: spec.description ?? null,
      avatar: spec.avatar ?? null,
      backend_type: "acp",
      tools_preset: "coding",
      is_builtin: pluginId.startsWith("builtin:"),
      external_config: JSON.stringify({
        command: spec.command,
        ...(spec.args ? { args: spec.args } : {}),
        detectArgs: spec.detectArgs ?? ["--version"],
        ...(spec.installCommand ? { installCommand: spec.installCommand } : {}),
        ...(spec.env ? { env: spec.env } : {}),
      }),
      meta: { [META_KEY]: key },
    });
    ensureAgentBuiltinPluginBindings(db, agent.id);
  }
}
