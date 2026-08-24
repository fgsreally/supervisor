import type { SupervisorDb } from "../db/db.js";
import { ensureAgentBuiltinExtensionBindings } from "./builtin/ensure.js";
import type { ExternalAgentDescriptor } from "./types.js";

const META_KEY = "supervisor.externalAgent";

/** Register extension-contributed external agents without taking over user-edited rows. */
export function ensureExtensionExternalAgents(
  db: SupervisorDb,
  extensionId: string,
  specs: readonly ExternalAgentDescriptor[],
): void {
  for (const spec of specs) {
    if (!spec.id.trim() || !spec.name.trim() || !spec.command.trim()) continue;
    const key = `${extensionId}:${spec.id}`;
    const existing = db.listAgents().find((agent) => agent.meta[META_KEY] === key);
    if (existing) {
      ensureAgentBuiltinExtensionBindings(db, existing.id);
      continue;
    }
    const agent = db.insertAgent({
      name: spec.name,
      description: spec.description ?? null,
      avatar: spec.avatar ?? null,
      backend_type: "acp",
      tools_preset: "coding",
      is_builtin: extensionId.startsWith("builtin:"),
      external_config: JSON.stringify({
        command: spec.command,
        ...(spec.args ? { args: spec.args } : {}),
        detectArgs: spec.detectArgs ?? ["--version"],
        ...(spec.installCommand ? { installCommand: spec.installCommand } : {}),
        ...(spec.env ? { env: spec.env } : {}),
      }),
      meta: { [META_KEY]: key },
    });
    ensureAgentBuiltinExtensionBindings(db, agent.id);
  }
}
